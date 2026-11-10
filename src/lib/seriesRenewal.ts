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
): string[] {
  const out: string[] = [];
  let date = lastDate;
  while (out.length < Math.min(Math.max(count, 0), MAX_RENEWAL)) {
    date = addDays(date, stepDays);
    if (!skip.includes(date)) out.push(date);
  }
  return out;
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
