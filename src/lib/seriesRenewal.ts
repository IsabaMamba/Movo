/**
 * Renewing a series (0057; Series v2 · 9–10).
 *
 * A month before the last date the organizer is asked «¿Agregas 8 fechas
 * más?». `renewSeries` adds them, minus any date the organizer taps away (a
 * holiday), the run moving a week for each. The people on the whole series
 * are then asked «¿Sigues en la serie?»; `answerSeriesRenewal(…, true)` puts
 * them on the new dates, date by date, and no answer leaves them off. Nothing
 * renews by itself.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { toApiError } from './errors';

export const DEFAULT_RENEWAL = 8;
export const MAX_RENEWAL = 12;

/** ISO date (yyyy-mm-dd) plus `days`, in plain calendar arithmetic. */
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The dates the renewal sheet shows as chips, mirroring renew_series():
 * `count` dates after `lastDate`, every `stepDays`, leaving out `skip` and
 * moving the run one step for each date left out.
 */
export function renewalDates(
  lastDate: string,
  count: number = DEFAULT_RENEWAL,
  skip: readonly string[] = [],
  stepDays = 7,
  today?: string,
): string[] {
  const out: string[] = [];
  let date = lastDate;
  // A series that already ended starts again from today, as the server does.
  if (today !== undefined) while (date < today) date = addDays(date, stepDays);
  while (out.length < Math.min(Math.max(count, 0), MAX_RENEWAL)) {
    date = addDays(date, stepDays);
    if (!skip.includes(date)) out.push(date);
  }
  return out;
}

/** Days between dates, by the series' frequency (renew_series()). */
export function stepDaysFor(frequency: string): number {
  if (frequency === 'biweekly') return 14;
  if (frequency === 'monthly') return 28;
  return 7;
}

/** The calendar date (yyyy-mm-dd) of an instant in the series' time zone. */
export function localDate(iso: string, timeZone = 'America/Costa_Rica'): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(new Date(iso));
}

export interface RenewalChip {
  date: string;
  /** Off: tapped away, a holiday. */
  on: boolean;
}

/**
 * The chips on the sheet: the dates that will be added, and among them, in
 * place, the ones tapped away — so a holiday stays visible, struck through,
 * and tapping it again brings it back.
 */
export function renewalChips(
  lastDate: string,
  count: number,
  skip: readonly string[],
  stepDays = 7,
  today?: string,
): RenewalChip[] {
  const dates = renewalDates(lastDate, count, skip, stepDays, today);
  const last = dates[dates.length - 1] ?? lastDate;
  const off = skip.filter((d) => d > lastDate && d <= last);
  return [
    ...dates.map((date) => ({ date, on: true })),
    ...off.map((date) => ({ date, on: false })),
  ].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Tapping a chip: off if it was on, back on if it was off. */
export function toggleSkip(skip: readonly string[], date: string): string[] {
  return skip.includes(date) ? skip.filter((d) => d !== date) : [...skip, date];
}

/** «mar 15 dic», for sentences. */
export function renewalDay(isoDate: string): string {
  return new Intl.DateTimeFormat('es-CR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
    .format(new Date(`${isoDate}T12:00:00Z`))
    .replace(/[.,]/g, '');
}

/** «15 dic», for a chip. */
export function chipDay(isoDate: string): string {
  return new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${isoDate}T12:00:00Z`))
    .replace('.', '');
}

export interface RenewalResult {
  renewalId: string;
  dates: string[];
  /** How many people on the whole series were asked. */
  asked: number;
}

/** Organizer only. */
export async function renewSeries(
  db: SupabaseClient,
  seriesId: string,
  count: number = DEFAULT_RENEWAL,
  skip: readonly string[] = [],
): Promise<RenewalResult> {
  const { data, error } = await db.rpc('renew_series', {
    p_series_id: seriesId,
    p_count: count,
    p_skip: skip,
  });
  if (error) throw toApiError(error);
  const r = (data ?? {}) as { renewal_id?: string; dates?: string[]; asked?: number };
  return { renewalId: r.renewal_id ?? '', dates: r.dates ?? [], asked: r.asked ?? 0 };
}

/** «Sí, sigo» or «No, termino». Once per renewal; only for people who were asked. */
export async function answerSeriesRenewal(
  db: SupabaseClient,
  seriesId: string,
  join: boolean,
): Promise<{ joined: number; waitlisted: number }> {
  const { data, error } = await db.rpc('answer_series_renewal', {
    p_series_id: seriesId,
    p_join: join,
  });
  if (error) throw toApiError(error);
  const r = (data ?? {}) as { joined?: number; waitlisted?: number };
  return { joined: r.joined ?? 0, waitlisted: r.waitlisted ?? 0 };
}

/** The organizer's refusals, in their words; anything else as it came. */
export function explainRenewalError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : '';
  if (message.includes('series not found')) return 'No encontramos esta serie.';
  return message || 'No se pudieron agregar las fechas. Intenta de nuevo.';
}

// ------------------------------------------------- «¿Sigues en la serie?»

/** What my_series_renewal() (0059) says is waiting for the caller. */
export interface RenewalQuestion {
  /** Who added the dates. */
  name: string;
  added: number;
  first: string;
  last: string;
  /** The old last date: where the series ends for them without a yes. */
  lastStart: string;
  /** Dates left out between first and last. */
  skipped: string[];
}

/** Null when nothing is waiting: not asked, already answered, or no renewal. */
export async function fetchRenewalQuestion(
  db: SupabaseClient,
  seriesId: string,
): Promise<RenewalQuestion | null> {
  const { data, error } = await db.rpc('my_series_renewal', { p_series_id: seriesId });
  if (error) throw toApiError(error);
  if (data === null || typeof data !== 'object') return null;
  const r = data as Partial<{
    name: string;
    added: number;
    first: string;
    last: string;
    last_start: string;
    skipped: string[];
  }>;
  if (!r.first || !r.last || !r.last_start) return null;
  return {
    name: r.name ?? 'Quien organiza',
    added: r.added ?? DEFAULT_RENEWAL,
    first: r.first,
    last: r.last,
    lastStart: r.last_start,
    skipped: r.skipped ?? [],
  };
}

/** The words on «¿Sigues en la serie?» (Series v2 · 10). */
export function questionCopy(
  q: RenewalQuestion,
  seriesTitle: string,
  timeZone = 'America/Costa_Rica',
): {
  title: string;
  range: string;
  /** «15 dic → 9 feb», under «8 fechas nuevas». */
  span: string;
  /** «8 dic»: where the series ends without a yes. */
  endDay: string;
  yes: string;
  no: string;
  note: string;
} {
  const end = chipDay(localDate(q.lastStart, timeZone));
  const without =
    q.skipped.length === 0
      ? ''
      : ` Sin el ${q.skipped
          .map(chipDay)
          .join(', el ')
          .replace(/, el ([^,]*)$/, ' ni el $1')}.`;
  return {
    title: `${q.name} agregó ${String(q.added)} ${q.added === 1 ? 'fecha' : 'fechas'} a ${seriesTitle}`,
    range:
      q.first === q.last
        ? `El ${renewalDay(q.first)}.${without}`
        : `Del ${renewalDay(q.first)} al ${renewalDay(q.last)}.${without}`,
    span: q.first === q.last ? chipDay(q.first) : `${chipDay(q.first)} → ${chipDay(q.last)}`,
    endDay: end,
    yes: q.added === 1 ? 'Sí, sigo' : `Sí, sigo en las ${String(q.added)}`,
    no: `No, termino el ${end}`,
    note: `Las dos respuestas pesan igual. Si no respondes antes del ${end}, la serie termina para ti ese día; puedes unirte después cuando quieras.`,
  };
}

/** What the page says once the person answered. */
export function answeredNotice(
  join: boolean,
  r: { joined: number; waitlisted: number },
  endDay: string,
): string {
  if (!join) {
    return `Listo. La serie termina para ti el ${endDay}. Puedes volver cuando quieras.`;
  }
  const dates = (n: number) => (n === 1 ? '1 fecha nueva' : `${String(n)} fechas nuevas`);
  if (r.waitlisted === 0) return `Listo: vas a ${dates(r.joined)}.`;
  if (r.joined === 0) return `Quedaste en lista de espera en ${dates(r.waitlisted)}.`;
  return `Vas a ${dates(r.joined)} y quedaste en espera en ${String(r.waitlisted)}.`;
}
