/**
 * «Continuar con Apple» and «Continuar con Google» (Registro v3 · 1).
 *
 * Supabase Auth does the OAuth dance; this only starts it and, on a phone,
 * takes the session back from the link the app is opened with.
 *
 *   * Web: the browser goes to the provider and comes back to /registro;
 *     the client reads the session from the URL (`detectSessionInUrl`).
 *   * iOS and Android: the provider's page opens in the browser and comes
 *     back through `movo://auth-callback#access_token=…`, which the
 *     /auth-callback route hands to `setSession`.
 *
 * Nothing works until both providers are switched on by hand: in Supabase
 * (Authentication › Providers, with the client ids and secrets) and on the
 * Apple and Google developer consoles, with these redirect URLs allowed.
 * See docs/auth-providers.md.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

export { readCallback, type CallbackResult, type CallbackTokens } from './oauthCallback';

export type OAuthProvider = 'apple' | 'google';

export const OAUTH_PROVIDERS: readonly { provider: OAuthProvider; label: string }[] = [
  { provider: 'apple', label: 'Continuar con Apple' },
  { provider: 'google', label: 'Continuar con Google' },
];

/** Where the provider sends the person back. */
export function redirectUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/registro`;
  }
  return Linking.createURL('auth-callback');
}

/** Starts the flow. On web the page navigates away; on a phone the browser opens. */
export async function signInWithProvider(
  db: SupabaseClient,
  provider: OAuthProvider,
): Promise<void> {
  const native = Platform.OS !== 'web';
  const { data, error } = await db.auth.signInWithOAuth({
    provider,
    options: { redirectTo: redirectUrl(), skipBrowserRedirect: native },
  });
  if (error) throw error;
  if (native && data.url) await Linking.openURL(data.url);
}
