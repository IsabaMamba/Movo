/**
 * Attendance history (0021).
 *
 * Opt-in, coarse and expiring — see `docs/security.md`. The database holds
 * all three promises: nothing is written without a consent row, a row is a
 * district, a sport and a time band dated to the week, and it is deleted at
 * ninety days. This module only reads what is there and asks for the two
 * ways to make it go away.
 *
 * The screen must never show more than a row holds. There is no venue, no
 * session and no hour to show, and that is the point.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { TimeBand } from '../types/database';
import { toApiError } from './errors';

/**
 * The version of the notice on the screen. Stored with the consent, so a
 * change of wording is a new version and says who agreed to which.
 * **Change this whenever the notice text changes.**
 */
export const ATTENDANCE_NOTICE_VERSION = '2026-09-22';

export interface AttendanceConsent {
  consentedAt: string;
  noticeVersion: string;
}

export interface AttendanceRow {
  weekOf: string;
  isWeekend: boolean;
  band: TimeBand;
  district: string;
  category: string;
}

/** One line of the summary: where, what and when, and how many times. */
export interface AttendanceLine {
  key: string;
  text: string;
  times: number;
  lastWeekOf: string;
}

/** Null when history is off. */
export async function fetchAttendanceConsent(
  db: SupabaseClient,
): Promise<AttendanceConsent | null> {
  const { data, error } = await db
    .from('attendance_history_consent')
    .select('consented_at, notice_version')
    .maybeSingle();
  if (error) throw toApiError(error);
  if (!data) return null;
  const row = data as { consented_at: string; notice_version: string };
  return { consentedAt: row.consented_at, noticeVersion: row.notice_version };
}

/** The caller's rows inside the ninety-day window. Policy returns nobody else's. */
export async function fetchAttendanceHistory(db: SupabaseClient): Promise<AttendanceRow[]> {
  const { data, error } = await db
    .from('attendance_history')
    .select('week_of, is_weekend, band, zone:zones(name), category:categories(name_es)')
    .order('week_of', { ascending: false });
  if (error) throw toApiError(error);

  const rows = (data ?? []) as unknown as {
    week_of: string;
    is_weekend: boolean;
    band: TimeBand;
    zone: { name: string } | null;
    category: { name_es: string } | null;
  }[];

  return rows.map((row) => ({
    weekOf: row.week_of,
    isWeekend: row.is_weekend,
    band: row.band,
    district: row.zone?.name ?? 'Distrito sin nombre',
    category: row.category?.name_es ?? 'Otra actividad',
  }));
}

export async function enableAttendanceHistory(db: SupabaseClient): Promise<void> {
  const { error } = await db.rpc('set_attendance_history', {
    p_enabled: true,
    p_notice_version: ATTENDANCE_NOTICE_VERSION,
  });
  if (error) throw toApiError(error);
}

/** Turns it off and deletes every row, in one call. */
export async function disableAttendanceHistory(db: SupabaseClient): Promise<void> {
  const { error } = await db.rpc('set_attendance_history', { p_enabled: false });
  if (error) throw toApiError(error);
}

/** Deletes every row and leaves it on. Returns how many went. */
export async function clearAttendanceHistory(db: SupabaseClient): Promise<number> {
  const { data, error } = await db.rpc('clear_attendance_history');
  if (error) throw toApiError(error);
  return typeof data === 'number' ? data : 0;
}

// ------------------------------------------------------------- wording

const BAND_LABEL: Record<TimeBand, string> = {
  early: 'madrugada',
  morning: 'mañana',
  afternoon: 'tarde',
  evening: 'noche',
};

/** "entre semana, noche" / "fin de semana, madrugada". */
export function whenLabel(isWeekend: boolean, band: TimeBand): string {
  return `${isWeekend ? 'fin de semana' : 'entre semana'}, ${BAND_LABEL[band]}`;
}

/** "semana del 14 de septiembre". A week is all the row knows. */
export function weekLabel(weekOf: string): string {
  // `week_of` is a calendar date, not an instant: read it as UTC midnight
  // and format in UTC, so no device time zone can move it to the day before.
  const day = new Intl.DateTimeFormat('es-CR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${weekOf}T00:00:00Z`));
  return `semana del ${day}`;
}

/**
 * Rows folded into what they say: "Running · Mata Redonda · entre semana,
 * noche", three times, the last in the week of the 14th. Most repeated first,
 * then most recent — the pattern is what a person wants to check, and it is
 * exactly what a recommendation would read.
 */
export function summarizeAttendance(rows: readonly AttendanceRow[]): AttendanceLine[] {
  const lines = new Map<string, AttendanceLine>();

  for (const row of rows) {
    const key = [row.category, row.district, row.isWeekend, row.band].join('|');
    const current = lines.get(key);
    if (current) {
      current.times += 1;
      if (row.weekOf > current.lastWeekOf) current.lastWeekOf = row.weekOf;
    } else {
      lines.set(key, {
        key,
        text: `${row.category} · ${row.district} · ${whenLabel(row.isWeekend, row.band)}`,
        times: 1,
        lastWeekOf: row.weekOf,
      });
    }
  }

  return [...lines.values()].sort(
    (a, b) => b.times - a.times || b.lastWeekOf.localeCompare(a.lastWeekOf),
  );
}

/** "1 vez" / "3 veces". */
export function timesLabel(times: number): string {
  return times === 1 ? '1 vez' : `${times} veces`;
}
