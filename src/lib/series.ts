/**
 * A series as the organizer manages it (0013).
 *
 * `update_series()` and `cancel_series()` have existed since 0013 with nothing
 * in the app calling them, so a weekly club was edited and cancelled one
 * Tuesday at a time. This module is the client half: read the template and
 * its upcoming dates, change the template, or end it.
 *
 * The rules live in the functions and are only mirrored here so the form can
 * say them before the save:
 *
 *   * Day, hour, duration and venue lock once anybody is on an upcoming date
 *     — the same reason 0008 locks a single session.
 *   * Capacity can rise freely and fall only to the fullest upcoming date.
 *   * Price and category are not editable at all.
 *   * Cancelling cancels every future date through `cancel_activity()`, so
 *     each roster gets its own notice; past dates are left as they happened.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { ActivitySeries, ActivityStatus, Location } from '../types/database';
import { toApiError } from './errors';

/** 0 = domingo … 6 = sábado, matching `activity_series.weekday` and Postgres `dow`. */
export const WEEKDAYS = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const;

export function weekdayLabel(weekday: number): string {
  return WEEKDAYS[weekday] ?? 'día sin nombre';
}

/** "18:00" from the column's "18:00:00". */
export function shortTime(localTime: string): string {
  return localTime.slice(0, 5);
}

/**
 * «martes», «sábados», «domingos». Lunes to viernes already end in -s and do
 * not change; sábado and domingo take one. «Todos los sábado» was on the
 * create screen's confirmation until this function existed.
 */
export function weekdayPlural(weekday: number): string {
  const day = weekdayLabel(weekday);
  return day.endsWith('s') ? day : `${day}s`;
}

/** «Todos los martes a las 18:00». */
export function cadenceLabel(weekday: number, localTime: string): string {
  return `Todos los ${weekdayPlural(weekday)} a las ${shortTime(localTime)}`;
}

export interface SeriesDate {
  id: string;
  starts_at: string;
  status: ActivityStatus;
  joined_count: number;
  waitlist_count: number;
  max_participants: number | null;
}

export interface OrganizerSeries extends ActivitySeries {
  location: Pick<Location, 'id' | 'name' | 'district'>;
  /** Upcoming, not cancelled, soonest first. */
  upcoming: SeriesDate[];
}

/** Null when the series does not exist or the caller cannot read it. */
export async function fetchOrganizerSeries(
  db: SupabaseClient,
  seriesId: string,
  now: Date = new Date(),
): Promise<OrganizerSeries | null> {
  const [series, dates] = await Promise.all([
    db
      .from('activity_series')
      .select('*, location:locations!activity_series_location_id_fkey(id, name, district)')
      .eq('id', seriesId)
      .maybeSingle(),
    db
      .from('activities')
      .select('id, starts_at, status, joined_count, waitlist_count, max_participants')
      .eq('series_id', seriesId)
      .gt('starts_at', now.toISOString())
      .in('status', ['draft', 'published', 'full'])
      .order('starts_at', { ascending: true }),
  ]);

  if (series.error) throw toApiError(series.error);
  if (dates.error) throw toApiError(dates.error);
  if (!series.data) return null;

  return {
    ...(series.data as unknown as Omit<OrganizerSeries, 'upcoming'>),
    upcoming: (dates.data ?? []) as SeriesDate[],
  };
}

/** Everybody on any upcoming date, joined or waiting. One is enough to lock. */
export function peopleOnUpcoming(dates: readonly SeriesDate[]): number {
  return dates.reduce((sum, d) => sum + d.joined_count + d.waitlist_count, 0);
}

/** The lowest the cap can go: the fullest upcoming date, and never below 2. */
export function capacityFloor(dates: readonly SeriesDate[]): number {
  return dates.reduce((floor, d) => Math.max(floor, d.joined_count), 2);
}

export interface SeriesEdit {
  seriesId: string;
  title: string;
  description: string;
  weekday: number;
  /** "HH:MM", Costa Rica wall clock. */
  localStartTime: string;
  durationMinutes: number;
  locationId: string;
  maxParticipants: number | null;
}

/**
 * Change the template. Future dates nobody has joined follow it; dates with
 * people on them keep what they had. Every field is sent every time, for the
 * same reason as `updateActivity()`: `null` capacity means uncapped.
 */
export async function updateSeries(db: SupabaseClient, edit: SeriesEdit): Promise<ActivitySeries> {
  const { data, error } = await db.rpc('update_series', {
    p_series_id: edit.seriesId,
    p_title: edit.title.trim(),
    p_description: edit.description.trim() || null,
    p_local_start_time: edit.localStartTime,
    p_weekday: edit.weekday,
    p_duration_minutes: edit.durationMinutes,
    p_location_id: edit.locationId,
    p_max_participants: edit.maxParticipants,
  });
  if (error) throw toApiError(error);
  return data as ActivitySeries;
}

/** End the series. Returns how many upcoming dates were cancelled. */
export async function cancelSeries(
  db: SupabaseClient,
  seriesId: string,
  reason: string,
): Promise<number> {
  const { data, error } = await db.rpc('cancel_series', {
    p_series_id: seriesId,
    p_reason: reason.trim() || null,
  });
  if (error) throw toApiError(error);
  return typeof data === 'number' ? data : 0;
}

/**
 * The function's English refusals in the organizer's words. Anything not
 * recognised is shown as it came: an unexplained failure hidden behind a
 * generic sentence is how the create form stayed broken for four days.
 */
export function explainSeriesError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : '';
  const locked = /time and venue are locked: (\d+) people/.exec(message);
  if (locked) {
    const n = Number(locked[1]);
    return `${n === 1 ? 'Va 1 persona' : `Van ${n} personas`} a las próximas fechas: el día, la hora, la duración y el lugar no se pueden cambiar.`;
  }
  const floor = /capacity cannot go below (\d+)/.exec(message);
  if (floor) {
    return `El cupo no puede quedar por debajo de ${floor[1]}, la fecha más llena que viene.`;
  }
  if (message.includes('series is cancelled')) return 'Esta serie ya está cancelada.';
  if (message.includes('different currency')) {
    return 'Ese lugar cobra en otra moneda. Cancela la serie y publica una nueva.';
  }
  if (message.includes('duration must be at least')) {
    return 'La duración tiene que ser de 15 minutos o más.';
  }
  return message || 'No se pudieron guardar los cambios.';
}

// -------------------------------------------------------- Organizar

/** The shape Organizar groups; `OrganizedActivity` satisfies it. */
export interface GroupableActivity {
  id: string;
  series_id: string | null;
  starts_at: string;
}

export type UpcomingEntry<A extends GroupableActivity> =
  { kind: 'single'; activity: A } | { kind: 'series'; seriesId: string; next: A; dates: A[] };

/**
 * Upcoming sessions with each series folded into one entry, placed where its
 * next date falls. Descubrir has shown a series as one card since 0009;
 * Organizar listing nine Tuesdays of the same club was the one screen that
 * still did not.
 *
 * Input order does not matter; output is soonest first.
 */
export function groupUpcoming<A extends GroupableActivity>(
  activities: readonly A[],
): UpcomingEntry<A>[] {
  const sorted = [...activities].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const bySeries = new Map<string, A[]>();
  const entries: UpcomingEntry<A>[] = [];

  for (const activity of sorted) {
    if (activity.series_id === null) {
      entries.push({ kind: 'single', activity });
      continue;
    }
    const dates = bySeries.get(activity.series_id);
    if (dates) {
      dates.push(activity);
    } else {
      const fresh = [activity];
      bySeries.set(activity.series_id, fresh);
      entries.push({ kind: 'series', seriesId: activity.series_id, next: activity, dates: fresh });
    }
  }

  return entries;
}

// ------------------------------------------------- Serie v2 (2 November walkthrough, step 27)

/** A date that already happened: who was on its list, and who arrived. */
export interface SeriesPastDate {
  id: string;
  starts_at: string;
  /** Marked «Llegó», by code or by the organizer. */
  arrived: number;
  /** Everybody the date was counting on: arrived, no-show, or never marked. */
  expected: number;
}

const PAST_SHOWN = 6;

/**
 * The last dates of the series that were held, oldest first, with their
 * attendance. Two reads: the dates, then their participations, which RLS
 * lets the organizer see.
 */
export async function fetchSeriesHistory(
  db: SupabaseClient,
  seriesId: string,
  now: Date = new Date(),
): Promise<SeriesPastDate[]> {
  const dates = await db
    .from('activities')
    .select('id, starts_at')
    .eq('series_id', seriesId)
    .lt('starts_at', now.toISOString())
    .in('status', ['published', 'full', 'completed'])
    .order('starts_at', { ascending: false })
    .limit(PAST_SHOWN);
  if (dates.error) throw toApiError(dates.error);
  const rows = (dates.data ?? []) as { id: string; starts_at: string }[];
  if (rows.length === 0) return [];

  const people = await db
    .from('activity_participants')
    .select('activity_id, status')
    .in(
      'activity_id',
      rows.map((r) => r.id),
    );
  if (people.error) throw toApiError(people.error);

  return pastAttendance(rows, (people.data ?? []) as { activity_id: string; status: string }[]);
}

/** Count each date's list, oldest first. Pure, for the test. */
export function pastAttendance(
  dates: readonly { id: string; starts_at: string }[],
  people: readonly { activity_id: string; status: string }[],
): SeriesPastDate[] {
  return [...dates]
    .sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1))
    .slice(-PAST_SHOWN)
    .map((d) => {
      const mine = people.filter((p) => p.activity_id === d.id);
      const arrived = mine.filter((p) => p.status === 'attended').length;
      const expected = mine.filter(
        (p) => p.status === 'attended' || p.status === 'no_show' || p.status === 'joined',
      ).length;
      return { id: d.id, starts_at: d.starts_at, arrived, expected };
    });
}

export interface SeriesStats {
  /** Share of the expected who arrived, 0–100; null before any data. */
  rate: number | null;
  upcoming: number;
  lastDate: string | null;
  /** Weeks in a row with a date held, counting back from the latest. */
  streak: number;
}

/** A week plus a day of slack, so a date moved by an hour still counts. */
const WEEK_SLACK_MS = 8 * 24 * 60 * 60_000;

export function seriesStats(
  past: readonly SeriesPastDate[],
  upcoming: readonly SeriesDate[],
): SeriesStats {
  const expected = past.reduce((n, d) => n + d.expected, 0);
  const arrived = past.reduce((n, d) => n + d.arrived, 0);
  let streak = past.length > 0 ? 1 : 0;
  for (let i = past.length - 1; i > 0; i -= 1) {
    const later = new Date(past[i]?.starts_at ?? 0).getTime();
    const earlier = new Date(past[i - 1]?.starts_at ?? 0).getTime();
    if (later - earlier > WEEK_SLACK_MS) break;
    streak += 1;
  }
  return {
    rate: expected === 0 ? null : Math.round((arrived / expected) * 100),
    upcoming: upcoming.length,
    lastDate: upcoming[upcoming.length - 1]?.starts_at ?? null,
    streak,
  };
}

/** «Mar 20 oct», in Costa Rica time. */
export function seriesDay(iso: string): string {
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

/** «8 dic», for the chart and the stat captions. */
export function seriesShortDate(iso: string): string {
  return new Intl.DateTimeFormat('es-CR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Costa_Rica',
  })
    .format(new Date(iso))
    .replace(/\./g, '');
}

/** «11 de 12 · queda 1 lugar», «9 de 12», «12 de 12 · llena», «7 van». */
export function seriesDateFill(d: SeriesDate): string {
  if (d.max_participants === null) return `${d.joined_count} van`;
  const left = d.max_participants - d.joined_count;
  const base = `${d.joined_count} de ${d.max_participants}`;
  if (left <= 0) return `${base} · llena`;
  if (left <= 2) return `${base} · ${left === 1 ? 'queda 1 lugar' : `quedan ${left} lugares`}`;
  return base;
}
