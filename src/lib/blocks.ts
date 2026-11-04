/**
 * Blocking, from the client's side of 0039.
 *
 * Every read in the product has honoured `is_blocked()` since 0001, so a block
 * already hides both people from each other everywhere. What 0039 adds is the
 * only way to write one (`block_user` / `unblock_user` — the direct INSERT and
 * DELETE grants are gone), the Bloqueos list, and the one yes-or-no the
 * session detail needs. This file is exactly those four calls and the shaping
 * of what they return.
 *
 * Nothing here ever names the blocked person to anybody but the person who
 * blocked them, and nothing tells somebody they were blocked. The database
 * enforces the first; the second is simply never asked of it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { toApiError } from './errors';

/** One row of Perfil › Bloqueos. Public fields only — 0039 returns no more. */
export interface BlockedPerson {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  /** ISO instant the block was made. */
  blockedAt: string;
}

/** Block somebody. Idempotent: pressing it twice is not an error. */
export async function blockPerson(db: SupabaseClient, userId: string): Promise<void> {
  const { error } = await db.rpc('block_user', { p_user_id: userId });
  if (error) throw toApiError(error);
}

/** Undo a block. Nobody is told, in either direction. */
export async function unblockPerson(db: SupabaseClient, userId: string): Promise<void> {
  const { error } = await db.rpc('unblock_user', { p_user_id: userId });
  if (error) throw toApiError(error);
}

/** Perfil › Bloqueos, newest first. */
export async function fetchBlockedPeople(db: SupabaseClient): Promise<BlockedPerson[]> {
  const { data, error } = await db.rpc('my_blocked_people');
  if (error) throw toApiError(error);
  return toBlockedPeople(data);
}

/**
 * Whether somebody the caller blocked is going to a session.
 *
 * Drives the session detail's «Alguien que bloqueaste va a esta sesión». A
 * failure reads as «no» rather than an error screen: the notice is a courtesy
 * on top of a page whose real content is the session, and the block itself
 * still holds whatever this returns.
 */
export async function blockedPersonGoing(db: SupabaseClient, activityId: string): Promise<boolean> {
  const { data, error } = await db.rpc('blocked_person_going', { p_activity_id: activityId });
  if (error) return false;
  return data === true;
}

/**
 * `my_blocked_people()` returns jsonb, which reaches the client as `unknown`.
 * Narrowed once here: a row without an id or a name is dropped rather than
 * rendered as a button that unblocks nobody.
 */
export function toBlockedPeople(raw: unknown): BlockedPerson[] {
  if (!Array.isArray(raw)) return [];
  const out: BlockedPerson[] = [];
  for (const row of raw) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.display_name !== 'string') continue;
    out.push({
      id: r.id,
      displayName: r.display_name,
      avatarUrl: typeof r.avatar_url === 'string' ? r.avatar_url : null,
      blockedAt: typeof r.blocked_at === 'string' ? r.blocked_at : '',
    });
  }
  return out;
}

/** «Desde el 3 nov», in Costa Rica's calendar. Empty when the date is unknown. */
export function blockedSinceLabel(iso: string): string {
  const date = new Date(iso);
  if (iso === '' || Number.isNaN(date.getTime())) return '';
  const day = new Intl.DateTimeFormat('es-CR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Costa_Rica',
  })
    .format(date)
    .replace('.', '');
  return `Desde el ${day}`;
}
