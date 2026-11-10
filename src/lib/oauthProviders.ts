/**
 * Which «Continuar con…» buttons exist, and which are switched on.
 *
 * Apart from lib/oauth.ts so it has no platform imports and can be tested.
 */

export type OAuthProvider = 'apple' | 'google';

export const OAUTH_PROVIDERS: readonly { provider: OAuthProvider; label: string }[] = [
  { provider: 'apple', label: 'Continuar con Apple' },
  { provider: 'google', label: 'Continuar con Google' },
];

/**
 * The providers that are switched on, from EXPO_PUBLIC_OAUTH_PROVIDERS
 * («apple,google», «google», or empty).
 *
 * A button for a provider that is off cannot fail politely on the web: the
 * browser has already left for Supabase, which answers with a page of JSON
 * («Unsupported provider: provider is not enabled») and no way back. So a
 * provider shows only once somebody has done docs/auth-providers.md and said
 * so here. Unknown names are ignored; the order is always Apple, then Google.
 */
export function enabledProviders(raw: string | undefined): typeof OAUTH_PROVIDERS {
  const asked = new Set(
    (raw ?? '')
      .split(',')
      .map((name) => name.trim().toLowerCase())
      .filter((name) => name !== ''),
  );
  return OAUTH_PROVIDERS.filter(({ provider }) => asked.has(provider));
}
