/**
 * Changing the email and the password (Perfil v3, 4 November handoff item 6).
 *
 * Both go straight to Supabase Auth; there is no table of ours involved.
 *   * Email: updateUser({ email }). With «Secure email change» on, Supabase
 *     confirms on the new address and tells the old one; until the person
 *     confirms, they keep signing in with the old address.
 *   * Password: the current one is checked first by signing in with it
 *     (Supabase's update does not ask for it), then updateUser({ password }),
 *     then, unless the person says otherwise, every other session is signed
 *     out (scope 'others') — the usual reason to change a password is that
 *     somebody else might know it.
 * An account made with Google or Apple has no password here: its email is
 * changed with the provider.
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';

import { MIN_PASSWORD_LENGTH, passwordOk } from './password';

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/** Null when the new email can be sent; otherwise the sentence to show. */
export function emailProblem(next: string, current: string | null | undefined): string | null {
  const email = next.trim().toLowerCase();
  if (email === '') return 'Escribe tu correo nuevo.';
  if (!EMAIL_SHAPE.test(email)) return 'Ese correo no parece completo.';
  if (current && email === current.trim().toLowerCase()) return 'Ese ya es tu correo.';
  return null;
}

/** Null when the new password can be saved; otherwise the sentence to show. */
export function newPasswordProblem(current: string, next: string, repeat: string): string | null {
  if (current === '') return 'Escribe tu contraseña actual.';
  if (!passwordOk(next)) return `La nueva necesita ${MIN_PASSWORD_LENGTH} caracteres o más.`;
  if (next === current) return 'La nueva tiene que ser distinta de la actual.';
  if (next !== repeat) return 'Las dos contraseñas nuevas no coinciden.';
  return null;
}

/** Whether the account signs in with a password at all (not only Google or Apple). */
export function hasPassword(user: Pick<User, 'app_metadata' | 'identities'>): boolean {
  const identities = user.identities ?? [];
  if (identities.length > 0) return identities.some((i) => i.provider === 'email');
  return (user.app_metadata.provider ?? 'email') === 'email';
}

export async function changeEmail(db: SupabaseClient, next: string): Promise<void> {
  const { error } = await db.auth.updateUser({ email: next.trim().toLowerCase() });
  if (error) throw new Error(friendlyAuthError(error.message));
}

export async function changePassword(
  db: SupabaseClient,
  email: string,
  current: string,
  next: string,
  signOutOthers: boolean,
): Promise<void> {
  const check = await db.auth.signInWithPassword({ email, password: current });
  if (check.error) throw new Error('Tu contraseña actual no es esa.');
  const { error } = await db.auth.updateUser({ password: next });
  if (error) throw new Error(friendlyAuthError(error.message));
  if (signOutOthers) await db.auth.signOut({ scope: 'others' });
}

/** Supabase's messages are English and technical; the common ones, in our words. */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('already') && m.includes('registered'))
    return 'Ese correo ya tiene una cuenta en Movo.';
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Probaste muchas veces seguidas. Espera unos minutos y vuelve a intentarlo.';
  if (m.includes('weak') || m.includes('password should'))
    return `La contraseña necesita ${MIN_PASSWORD_LENGTH} caracteres o más.`;
  if (m.includes('same') && m.includes('password'))
    return 'La nueva tiene que ser distinta de la actual.';
  return 'No se pudo guardar. Vuelve a intentarlo en un momento.';
}
