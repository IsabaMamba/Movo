/**
 * The signed-in person's own account.
 *
 * Only the name is editable here. `profiles` accepts updates to
 * `display_name`, `bio` and `home_district` and nothing else (0024); the photo
 * waits for storage and EXIF stripping (status.md, item 4), and verification is
 * never the person's to set.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { toApiError } from './errors';

/** The bounds of `profiles.display_name`'s check constraint, and of sign-up. */
export const NAME_MIN = 2;
export const NAME_MAX = 60;

export function nameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < NAME_MIN) return `El nombre tiene que tener al menos ${NAME_MIN} letras.`;
  if (trimmed.length > NAME_MAX) return `El nombre puede tener hasta ${NAME_MAX} caracteres.`;
  return null;
}

export async function fetchMyName(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await db
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw toApiError(error);
  return (data as { display_name: string } | null)?.display_name ?? null;
}

/** Returns the name as stored, which is what the screen should show next. */
export async function updateMyName(
  db: SupabaseClient,
  userId: string,
  name: string,
): Promise<string> {
  const { data, error } = await db
    .from('profiles')
    .update({ display_name: name.trim() })
    .eq('id', userId)
    .select('display_name')
    .single();
  if (error) throw toApiError(error);
  return (data as { display_name: string }).display_name;
}

// ------------------------------------------------- leaving (0029)

/**
 * Everything Movo holds about the caller, as export_my_data() assembles it.
 * Other people appear only as ids.
 */
export async function exportMyData(db: SupabaseClient): Promise<unknown> {
  const { data, error } = await db.rpc('export_my_data');
  if (error) throw toApiError(error);
  return data;
}

/** `movo-mis-datos-2026-10-07.json`, by the local calendar day. */
export function exportFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `movo-mis-datos-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/**
 * The word typed to confirm. A second button alone is one accidental double
 * tap away from losing every session and group; a word is not.
 */
export const DELETE_WORD = 'borrar';

export function confirmsDeletion(typed: string): boolean {
  return typed.trim().toLowerCase() === DELETE_WORD;
}

/**
 * Deletes the caller's account. The database refuses while the account is
 * suspended or on the team, with a sentence written for the screen.
 */
export async function deleteMyAccount(db: SupabaseClient): Promise<void> {
  const { error } = await db.rpc('delete_my_account');
  if (error) throw toApiError(error);
}
