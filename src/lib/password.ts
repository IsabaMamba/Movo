/**
 * The password rule, in one place (3 November handoff, Registro v2: «8
 * caracteres o más»).
 *
 * Supabase Auth is the boundary — `minimum_password_length` in
 * supabase/config.toml for local, and the same number in the dashboard for
 * the live project, which no file can set. This mirrors it so the form can say
 * so before the request instead of after it.
 */

export const MIN_PASSWORD_LENGTH = 8;

/** Null when the password is acceptable; otherwise the sentence to show. */
export function passwordProblem(password: string): string | null {
  if (password.length === 0) return null;
  if (password.length < MIN_PASSWORD_LENGTH) {
    const missing = MIN_PASSWORD_LENGTH - password.length;
    return missing === 1 ? 'Te falta 1 carácter.' : `Te faltan ${missing} caracteres.`;
  }
  return null;
}

export function passwordOk(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}
