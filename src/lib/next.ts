/**
 * Where to go after signing in: «?next=/g/K7Q2M9XP». Only a path inside Movo
 * is accepted — one slash, no scheme, no host — so the parameter cannot send
 * somebody to another site after they typed their password there.
 */
export function safeNext(raw: string | string[] | undefined | null): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  // No spaces or control characters: a path from a link never has them.
  if ([...value].some((ch) => ch.charCodeAt(0) < 32 || /\s/u.test(ch))) return null;
  if (value.includes('://')) return null;
  if (value === '/sign-in' || value.startsWith('/sign-in?')) return null;
  return value;
}
