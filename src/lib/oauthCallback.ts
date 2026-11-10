/**
 * Reading the link an OAuth sign-in comes back on (see oauth.ts). Kept apart
 * from oauth.ts so it has no platform imports and can be tested in Node.
 */

export interface CallbackTokens {
  accessToken: string;
  refreshToken: string;
}

export type CallbackResult =
  | { ok: true; tokens: CallbackTokens }
  | { ok: false; problem: string }
  | { ok: false; problem: null };

/**
 * What came back on the link: the tokens (after `#`, as Supabase sends
 * them), or the provider's refusal. `problem: null` is a link with neither.
 */
export function readCallback(url: string): CallbackResult {
  const hash = url.indexOf('#');
  const query = url.indexOf('?');
  const params = new URLSearchParams(
    [
      query >= 0 ? url.slice(query + 1, hash > query ? hash : undefined) : '',
      hash >= 0 ? url.slice(hash + 1) : '',
    ].join('&'),
  );
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) return { ok: true, tokens: { accessToken, refreshToken } };
  const error = params.get('error_description') ?? params.get('error');
  if (error) {
    return {
      ok: false,
      problem: error.includes('denied')
        ? 'Cancelaste el inicio de sesión. Puedes intentar de nuevo o usar tu correo.'
        : 'No pudimos entrar con esa cuenta. Intenta de nuevo o usa tu correo.',
    };
  }
  return { ok: false, problem: null };
}
