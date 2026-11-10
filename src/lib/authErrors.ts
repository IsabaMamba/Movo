/**
 * What a failed «Entrar» says.
 *
 * Supabase Auth answers in English («Invalid login credentials»), and the
 * sign-in screen used to show that sentence as it came. These are the ones a
 * person can actually meet, in Movo's words. The sentence never says which
 * half was wrong, the email or the password: that would tell a stranger which
 * addresses have an account.
 */

export function signInMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message.toLowerCase() : '';
  if (message.includes('invalid login credentials') || message.includes('invalid_credentials')) {
    return 'El correo o la contraseña no coinciden. Revísalos, o cambia tu contraseña.';
  }
  if (message.includes('email not confirmed')) {
    return 'Falta confirmar tu correo. Abre el enlace que te mandamos cuando creaste la cuenta.';
  }
  if (message.includes('rate limit') || message.includes('too many')) {
    return 'Probaste muchas veces seguidas. Espera unos minutos y vuelve a intentarlo.';
  }
  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'No hay conexión. Revisa tu internet y vuelve a intentarlo.';
  }
  return 'No se pudo iniciar sesión. Vuelve a intentarlo en un momento.';
}
