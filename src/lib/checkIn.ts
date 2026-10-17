/**
 * «Llegué» with the session's code (0033; Asistencia v2).
 *
 * The person who arrives types the organizer's 4-digit code on their own
 * phone; the organizer watches the list fill in, marks anybody without a
 * phone with check_in() as before, and can undo either before closing.
 *
 * The window and the answers live in the database. The window is mirrored
 * here so the button can say «Disponible desde 15 minutos antes» instead of
 * failing, and the answers are turned into the sentence the screen shows.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { toApiError } from './errors';

export const OPENS_MINUTES_BEFORE = 15;
export const CLOSES_MINUTES_AFTER = 45;
export const MAX_WRONG_CODES = 5;

export type CheckInWindow = 'early' | 'open' | 'late';

export function checkInWindow(startsAt: string | Date, now: Date = new Date()): CheckInWindow {
  const start = new Date(startsAt).getTime();
  const t = now.getTime();
  if (t < start - OPENS_MINUTES_BEFORE * 60_000) return 'early';
  if (t > start + CLOSES_MINUTES_AFTER * 60_000) return 'late';
  return 'open';
}

/** Only digits, at most four: what the keypad can produce. */
export function cleanCode(typed: string): string {
  return typed.replace(/\D/gu, '').slice(0, 4);
}

export type SelfCheckInOutcome = 'checked_in' | 'already' | 'wrong_code' | 'locked';

export function outcomeText(outcome: SelfCheckInOutcome): string {
  switch (outcome) {
    case 'checked_in':
      return 'Listo, quedó marcada tu llegada.';
    case 'already':
      return 'Tu llegada ya estaba marcada.';
    case 'wrong_code':
      return 'Ese no es el código de hoy. Pídeselo a quien organiza.';
    case 'locked':
      return `Probaste ${MAX_WRONG_CODES} códigos que no eran. Pídele a quien organiza que marque tu llegada.`;
  }
}

export async function selfCheckIn(
  db: SupabaseClient,
  activityId: string,
  code: string,
): Promise<SelfCheckInOutcome> {
  const { data, error } = await db.rpc('self_check_in', {
    p_activity_id: activityId,
    p_code: cleanCode(code),
  });
  if (error) throw toApiError(error);
  return data as SelfCheckInOutcome;
}

/** The organizer's code, created the first time it is asked for. */
export async function fetchCheckInCode(db: SupabaseClient, activityId: string): Promise<string> {
  const { data, error } = await db.rpc('check_in_code', { p_activity_id: activityId });
  if (error) throw toApiError(error);
  return data as string;
}

/** A different code, for when the current one went beyond the people there. */
export async function newCheckInCode(db: SupabaseClient, activityId: string): Promise<string> {
  const { data, error } = await db.rpc('new_check_in_code', { p_activity_id: activityId });
  if (error) throw toApiError(error);
  return data as string;
}

/** Organizer only, before closing. Also removes the history row it wrote. */
export async function undoCheckIn(
  db: SupabaseClient,
  activityId: string,
  userId: string,
): Promise<void> {
  const { error } = await db.rpc('undo_check_in', {
    p_activity_id: activityId,
    p_user_id: userId,
  });
  if (error) throw toApiError(error);
}

/** «con código» when the person marked it, «por ti» when the organizer did. */
export function checkedInBy(
  participantId: string,
  checkedInByUserId: string | null,
): 'self' | 'organizer' | null {
  if (checkedInByUserId === null) return null;
  return checkedInByUserId === participantId ? 'self' : 'organizer';
}
