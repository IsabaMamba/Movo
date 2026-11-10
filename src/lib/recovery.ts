/**
 * «¿Olvidaste tu contraseña?»
 *
 * The person asks with their email; Supabase sends recovery.html (Correos v1)
 * with a link that comes back to /recuperar with a short session; there they
 * choose a new password. Three things this module keeps straight:
 *
 *   * The answer to the request is the same whether or not the email has an
 *     account. Saying «no hay cuenta con ese correo» tells anybody who asks
 *     which addresses are on Movo.
 *   * Coming back from the link is recognised from the URL *before* the
 *     Supabase client reads and clears it (see `arrivedFromRecovery` in
 *     lib/supabase.ts). A session alone does not mean a recovery: somebody
 *     already signed in who opens /recuperar is sent to «Cambiar contraseña»,
 *     which asks for the current one.
 *   * After the new password is saved every other session is signed out: the
 *     usual reason to recover an account is that somebody else may be in it.
 *
 * The redirect URL has to be allowed in Supabase › Authentication › URL
 * Configuration, like the ones in docs/auth-providers.md.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { friendlyAuthError } from './credentials';
import { MIN_PASSWORD_LENGTH, passwordOk } from './password';

/** True when the URL the page was opened with is a recovery link coming back. */
export function isRecoveryUrl(hash: string, search: string): boolean {
  const fromHash = new URLSearchParams(hash.replace(/^#/, ''));
  const fromSearch = new URLSearchParams(search.replace(/^\?/, ''));
  return fromHash.get('type') === 'recovery' || fromSearch.get('type') === 'recovery';
}

/** Supabase puts the reason in the URL when the link is old or already used. */
export function recoveryLinkFailed(hash: string, search: string): boolean {
  const fromHash = new URLSearchParams(hash.replace(/^#/, ''));
  const fromSearch = new URLSearchParams(search.replace(/^\?/, ''));
  return fromHash.has('error_code') || fromSearch.has('error_code');
}

/** Null when the new password can be saved; otherwise the sentence to show. */
export function recoveredPasswordProblem(next: string, repeat: string): string | null {
  if (!passwordOk(next)) return `La contraseña necesita ${MIN_PASSWORD_LENGTH} caracteres o más.`;
  if (next !== repeat) return 'Las dos contraseñas no coinciden.';
  return null;
}

/** What the person reads after asking, account or no account. */
export const RECOVERY_SENT =
  'Si hay una cuenta con ese correo, te mandamos un enlace para cambiar la contraseña. ' +
  'Revisa también el correo no deseado. El enlace sirve una sola vez.';

export async function requestRecovery(
  db: SupabaseClient,
  email: string,
  redirectTo: string | undefined,
): Promise<void> {
  const { error } = await db.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo,
  });
  // Only what is about the person asking, never about the address: too many
  // tries. Anything else reads the same as success.
  if (error && /rate limit|too many/i.test(error.message)) {
    throw new Error(friendlyAuthError(error.message));
  }
}

export async function saveRecoveredPassword(db: SupabaseClient, next: string): Promise<void> {
  const { error } = await db.auth.updateUser({ password: next });
  if (error) throw new Error(friendlyAuthError(error.message));
  await db.auth.signOut({ scope: 'others' });
}
