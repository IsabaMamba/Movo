/**
 * A series seen by somebody who goes, or might (Perfiles v1 · 3–6, 0048).
 *
 * The template row (`activity_series`) is readable only by its organizer and
 * its group, so everything here is read from the dates themselves, which are
 * public like any session. Being «in the series» is being on its upcoming
 * dates — there is no membership row — so the screen derives it from the
 * caller's own participations.
 *
 * The rules live in `join_series()` and `leave_series()`; the preview here
 * only says before the tap what the function will do: a full date puts the
 * person on that date's waitlist, and the rest are places.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { ActivityStatus, ParticipationStatus } from '../types/database';
import { toApiError } from './errors';
import { withPricingDefaults, type Pricing } from './pricing';

export interface MemberSeriesDate {
  id: string;
  starts_at: string;
  status: ActivityStatus;
  joined_count: number;
  max_participants: number | null;
  /** Already started, or held. */
  past: boolean;
  /** The caller's own status on this date, or null. */
  mine: ParticipationStatus | null;
  /** Place on this date's waitlist, when `mine` is `waitlisted`. */
  position: number | null;
}

export interface MemberSeries {
  id: string;
  title: string;
  categoryId: string;
  organizer: { id: string; displayName: string };
  priceMinor: number;
  currency: string;
  /** Per person or split, and the entry fee (0054). */
  pricing: Pricing;
  skill: string;
  locationName: string;
  /** Oldest first. Cancelled dates are left out. */
  dates: MemberSeriesDate[];
}

interface DateRow extends Partial<Pricing> {
  id: string;
  starts_at: string;
  status: ActivityStatus;
  joined_count: number;
  max_participants: number | null;
  title: string;
  category_id: string;
  price_minor: number;
  currency: string;
  skill: string;
  organizer: { id: string; display_name: string } | null;
  location: { name: string } | null;
}

/** Null when no date of the series is readable. */
export async function fetchMemberSeries(
  db: SupabaseClient,
  seriesId: string,
  userId: string | null,
  now: Date = new Date(),
): Promise<MemberSeries | null> {
  const dates = await db
    .from('activities')
    .select(
      // `*` rather than a column list: the pricing columns (0054) are read
      // when they exist, and an older database still answers.
      '*, organizer:profiles!activities_organizer_id_fkey(id, display_name), ' +
        'location:locations!activities_location_id_fkey(name)',
    )
    .eq('series_id', seriesId)
    .in('status', ['published', 'full', 'completed'])
    .order('starts_at', { ascending: true });
  if (dates.error) throw toApiError(dates.error);
  const rows = (dates.data ?? []) as unknown as DateRow[];
  if (rows.length === 0) return null;

  let mine: { activity_id: string; status: ParticipationStatus; waitlist_pos: number | null }[] =
    [];
  if (userId) {
    const own = await db
      .from('activity_participants')
      .select('activity_id, status, waitlist_pos')
      .eq('user_id', userId)
      .in(
        'activity_id',
        rows.map((r) => r.id),
      );
    if (own.error) throw toApiError(own.error);
    mine = (own.data ?? []) as typeof mine;
  }

  // The header follows the next date, so a renamed template shows its new
  // name; once everything is past, the last one.
  const head = rows.find((r) => new Date(r.starts_at) > now) ?? rows[rows.length - 1];
  if (!head) return null;

  return {
    id: seriesId,
    title: head.title,
    categoryId: head.category_id,
    organizer: {
      id: head.organizer?.id ?? '',
      displayName: head.organizer?.display_name ?? 'Quien organiza',
    },
    priceMinor: head.price_minor,
    currency: head.currency,
    pricing: withPricingDefaults(head),
    skill: head.skill,
    locationName: head.location?.name ?? '',
    dates: rows.map((r) => {
      const own = mine.find((m) => m.activity_id === r.id);
      return {
        id: r.id,
        starts_at: r.starts_at,
        status: r.status,
        joined_count: r.joined_count,
        max_participants: r.max_participants,
        past: new Date(r.starts_at) <= now || r.status === 'completed',
        mine: own?.status ?? null,
        position: own?.status === 'waitlisted' ? own.waitlist_pos : null,
      };
    }),
  };
}

const ON_IT: readonly (ParticipationStatus | null)[] = ['joined', 'waitlisted'];

/** Dates still to come. */
export function upcomingDates(dates: readonly MemberSeriesDate[]): MemberSeriesDate[] {
  return dates.filter((d) => !d.past);
}

/** On any upcoming date, with a place or waiting. */
export function isInSeries(dates: readonly MemberSeriesDate[]): boolean {
  return upcomingDates(dates).some((d) => ON_IT.includes(d.mine));
}

export function isFull(d: Pick<MemberSeriesDate, 'joined_count' | 'max_participants'>): boolean {
  return d.max_participants !== null && d.joined_count >= d.max_participants;
}

export interface JoinPreview {
  /** Dates with a place left (or the caller already has one). */
  places: MemberSeriesDate[];
  /** Full dates: the caller would wait there. */
  waiting: MemberSeriesDate[];
}

/** What «Unirme a la serie» will do, date by date, before the tap. */
export function joinPreview(dates: readonly MemberSeriesDate[]): JoinPreview {
  const places: MemberSeriesDate[] = [];
  const waiting: MemberSeriesDate[] = [];
  for (const d of upcomingDates(dates)) {
    if (d.mine === 'joined' || (d.mine !== 'waitlisted' && !isFull(d))) places.push(d);
    else waiting.push(d);
  }
  return { places, waiting };
}

export interface MemberStats {
  /** Past dates where the caller was marked «Llegó». */
  arrived: number;
  /** Past dates the caller was on: arrived, missed or never marked. */
  wasOn: number;
  /** Upcoming dates with a place. */
  ahead: number;
  /** Upcoming dates waiting. */
  waiting: number;
}

/** «1 de 1 llegaste · 4 por delante · 1 en espera». Only the caller's own. */
export function memberStats(dates: readonly MemberSeriesDate[]): MemberStats {
  let arrived = 0;
  let wasOn = 0;
  let ahead = 0;
  let waiting = 0;
  for (const d of dates) {
    if (d.past) {
      if (d.mine === 'attended') arrived += 1;
      if (d.mine === 'attended' || d.mine === 'no_show' || d.mine === 'joined') wasOn += 1;
    } else if (d.mine === 'joined') {
      ahead += 1;
    } else if (d.mine === 'waitlisted') {
      waiting += 1;
    }
  }
  return { arrived, wasOn, ahead, waiting };
}

/** «Cada sábado · 07:00 · 8 fechas», from the dates. */
export function seriesCadence(dates: readonly MemberSeriesDate[]): string {
  const first = dates[0];
  if (!first) return '';
  const day = new Intl.DateTimeFormat('es-CR', {
    weekday: 'long',
    timeZone: 'America/Costa_Rica',
  }).format(new Date(first.starts_at));
  const time = new Intl.DateTimeFormat('es-CR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Costa_Rica',
  }).format(new Date(first.starts_at));
  const n = dates.length;
  return `Cada ${day} · ${time} · ${n === 1 ? '1 fecha' : `${n} fechas`}`;
}

/** «Sáb 7 nov», in Costa Rica time. */
export function memberDay(iso: string): string {
  const text = new Intl.DateTimeFormat('es-CR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Costa_Rica',
  })
    .format(new Date(iso))
    .replace(/[.,]/g, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** «sábado 7», for «Solo el sábado 7». */
export function memberDayLong(iso: string): string {
  return new Intl.DateTimeFormat('es-CR', {
    weekday: 'long',
    day: 'numeric',
    timeZone: 'America/Costa_Rica',
  })
    .format(new Date(iso))
    .replace(',', '');
}

/** «7, 14, 21 y 28 de noviembre» when one month; else «7 nov, 14 nov y 5 dic». */
export function dateList(isos: readonly string[]): string {
  if (isos.length === 0) return '';
  const parts = isos.map((iso) => {
    const d = new Date(iso);
    const day = new Intl.DateTimeFormat('es-CR', {
      day: 'numeric',
      timeZone: 'America/Costa_Rica',
    }).format(d);
    const month = new Intl.DateTimeFormat('es-CR', {
      month: 'long',
      timeZone: 'America/Costa_Rica',
    }).format(d);
    return { day, month };
  });
  const oneMonth = parts.every((p) => p.month === parts[0]?.month);
  const words = oneMonth ? parts.map((p) => p.day) : parts.map((p) => `${p.day} de ${p.month}`);
  const joined =
    words.length === 1
      ? (words[0] ?? '')
      : `${words.slice(0, -1).join(', ')} y ${words[words.length - 1] ?? ''}`;
  return oneMonth ? `${joined} de ${parts[0]?.month ?? ''}` : joined;
}

export interface JoinResult {
  joined: { activity_id: string; starts_at: string }[];
  waitlisted: { activity_id: string; starts_at: string; position: number }[];
}

export async function joinSeries(db: SupabaseClient, seriesId: string): Promise<JoinResult> {
  const { data, error } = await db.rpc('join_series', { p_series_id: seriesId });
  if (error) throw toApiError(error);
  return data as JoinResult;
}

export type LeaveReason = 'trabajo' | 'salud' | 'viaje';

/** The three reasons the organizer can be told, and nothing typed. */
export const LEAVE_REASONS: readonly { value: LeaveReason; label: string }[] = [
  { value: 'trabajo', label: 'Trabajo' },
  { value: 'salud', label: 'Me enfermé' },
  { value: 'viaje', label: 'Viaje' },
];

/** One date when `activityId` is given, every upcoming date otherwise. */
export async function leaveSeries(
  db: SupabaseClient,
  seriesId: string,
  activityId: string | null,
  reason: LeaveReason | null,
): Promise<number> {
  const { data, error } = await db.rpc('leave_series', {
    p_series_id: seriesId,
    p_activity_id: activityId,
    p_reason: reason,
  });
  if (error) throw toApiError(error);
  return data as number;
}

/** The functions' English refusals, said to the person. */
export function explainMemberError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : '';
  if (message.includes('no upcoming dates')) return 'Esta serie ya no tiene fechas por delante.';
  if (message.includes('series takes single dates only')) {
    return 'Esta serie es por fechas sueltas: únete a cada fecha que te sirva.';
  }
  if (message.includes('series takes whole sign-ups only')) {
    return 'Esta serie se toma completa: únete a toda la serie.';
  }
  if (message.includes('organizer is already attending')) return 'Tú organizas esta serie.';
  if (message.includes('community members only')) {
    return 'Esta serie es solo para el grupo. Únete al grupo primero.';
  }
  if (message.includes('not permitted')) return 'No puedes unirte a esta serie.';
  if (message.includes('suspendida')) {
    return 'Tu cuenta está suspendida y no puede unirse a sesiones.';
  }
  return message || 'No se pudo hacer eso. Intenta de nuevo.';
}
