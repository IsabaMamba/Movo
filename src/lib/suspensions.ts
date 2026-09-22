/**
 * Account suspension (0020).
 *
 * Two audiences, deliberately kept apart:
 *
 *   * The suspended person asks one question — am I suspended, and until
 *     when — through `my_suspension()`. It returns an end date or nothing,
 *     never the team's note and never the report.
 *   * Staff suspend from a report, list what is in force and lift it, all
 *     through functions that stamp who did it. `suspensions` has no client
 *     write grant at all.
 *
 * The database is the boundary. The suspension screen is courtesy: a
 * suspended account that got past it would still be refused every write
 * by the triggers in 0020.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { toApiError } from './errors';

const CR_TIMEZONE = 'America/Costa_Rica';

/** What the suspended person is told. `endsAt` null means no end date. */
export interface MySuspension {
  endsAt: string | null;
}

/** Null when the caller is not suspended. */
export async function fetchMySuspension(db: SupabaseClient): Promise<MySuspension | null> {
  const { data, error } = await db.rpc('my_suspension');
  if (error) throw toApiError(error);
  const rows = (data ?? []) as { ends_at: string | null }[];
  const first = rows[0];
  return first ? { endsAt: first.ends_at } : null;
}

/**
 * "hasta el 28 de septiembre, 18:00", or "sin fecha de fin".
 *
 * Costa Rica time whatever the device says: the end was chosen by a person
 * in Costa Rica about a service in Costa Rica.
 */
export function suspensionUntilLabel(endsAt: string | null): string {
  if (endsAt === null) return 'sin fecha de fin';
  const when = new Intl.DateTimeFormat('es-CR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: CR_TIMEZONE,
  }).format(new Date(endsAt));
  return `hasta el ${when}`;
}

// ---------------------------------------------------------------- staff

/** The lengths the queue offers. `null` is "until somebody lifts it". */
export const SUSPENSION_LENGTHS = [
  { key: '7d', label: '7 días', days: 7 },
  { key: '30d', label: '30 días', days: 30 },
  { key: 'none', label: 'Sin fecha de fin', days: null },
] as const;

export type SuspensionLength = (typeof SUSPENSION_LENGTHS)[number]['key'];

/** The instant a length ends, counted from `now`. Null for no end. */
export function endsAtFor(length: SuspensionLength, now: Date = new Date()): string | null {
  const option = SUSPENSION_LENGTHS.find((candidate) => candidate.key === length);
  if (!option || option.days === null) return null;
  return new Date(now.getTime() + option.days * 86_400_000).toISOString();
}

export interface SuspensionOutcome {
  sessionsCancelled: number;
  sessionsLeft: number;
}

/**
 * Suspend the person a report is about — the user, the session's organizer,
 * or the message's author. Also cancels their future sessions, stops their
 * series and gives up their places elsewhere, and marks the report actioned.
 * Refused with 22023 for a blank note, a past end, a resolved report, a
 * report about a group, a staff account or one already suspended.
 */
export async function suspendAccount(
  db: SupabaseClient,
  reportId: string,
  note: string,
  endsAt: string | null,
): Promise<SuspensionOutcome> {
  const { data, error } = await db.rpc('suspend_account', {
    p_report_id: reportId,
    p_note: note.trim(),
    p_ends_at: endsAt,
  });
  if (error) throw toApiError(error);
  const result = (data ?? {}) as { sessions_cancelled?: number; sessions_left?: number };
  return {
    sessionsCancelled: result.sessions_cancelled ?? 0,
    sessionsLeft: result.sessions_left ?? 0,
  };
}

export interface ActiveSuspension {
  id: string;
  user_id: string;
  note: string;
  starts_at: string;
  ends_at: string | null;
  report_id: string | null;
  person: { display_name: string } | null;
}

/**
 * Suspensions in force, newest first. Staff only by policy — anybody else
 * gets an empty list, not an error. Expired ones are filtered here as well
 * as by the end date, because nothing marks them.
 */
export async function fetchActiveSuspensions(
  db: SupabaseClient,
  now: Date = new Date(),
): Promise<ActiveSuspension[]> {
  const { data, error } = await db
    .from('suspensions')
    .select(
      'id, user_id, note, starts_at, ends_at, report_id, ' +
        'person:profiles!suspensions_user_id_fkey(display_name)',
    )
    .is('lifted_at', null)
    .or(`ends_at.is.null,ends_at.gt.${now.toISOString()}`)
    .order('starts_at', { ascending: false });

  if (error) throw toApiError(error);
  return (data ?? []) as unknown as ActiveSuspension[];
}

/** End a suspension that is still in force. The note is required. */
export async function liftSuspension(
  db: SupabaseClient,
  suspensionId: string,
  note: string,
): Promise<void> {
  const { error } = await db.rpc('lift_suspension', {
    p_suspension_id: suspensionId,
    p_note: note.trim(),
  });
  if (error) throw toApiError(error);
}
