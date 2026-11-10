/**
 * «Continuar con Apple» and «Continuar con Google» (Registro v3 · 1), on the
 * welcome screen and on «Entrar»: with Apple or Google, signing in and
 * signing up are the same tap.
 *
 * Apple first and in black, Google in white, as both ask in their
 * guidelines. Only the providers named in EXPO_PUBLIC_OAUTH_PROVIDERS are
 * shown (see lib/oauth.ts): on the web a provider that is off cannot answer
 * in plain words, because the browser has already left for Supabase's error
 * page. With none switched on this renders nothing, and `hasOAuth` lets the
 * screens drop the «o con tu correo» line that would point at nothing.
 */

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ENABLED_PROVIDERS, signInWithProvider, type OAuthProvider } from '../../lib/oauth';
import { supabase } from '../../lib/supabase';
import { color, radius, size, space, stroke, type } from '../../theme';

/** Whether any provider is switched on, for the copy around the buttons. */
export const hasOAuth = ENABLED_PROVIDERS.length > 0;

export function OAuthButtons() {
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = (provider: OAuthProvider) => {
    setBusy(provider);
    setError(null);
    signInWithProvider(supabase, provider)
      .catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : '';
        setError(
          /not enabled|unsupported provider/i.test(message)
            ? 'Esta opción todavía no está lista. Usa tu correo por ahora.'
            : 'No pudimos abrir esa opción. Intenta de nuevo o usa tu correo.',
        );
      })
      .finally(() => {
        setBusy(null);
      });
  };

  if (!hasOAuth) return null;

  return (
    <View style={{ gap: space.sm }}>
      {ENABLED_PROVIDERS.map(({ provider, label }) => {
        const apple = provider === 'apple';
        return (
          <Pressable
            accessibilityRole="button"
            disabled={busy !== null}
            key={provider}
            onPress={() => {
              start(provider);
            }}
            style={{
              alignItems: 'center',
              backgroundColor: apple ? '#000000' : '#FFFFFF',
              borderColor: apple ? color.border.strong : '#FFFFFF',
              borderRadius: radius.full,
              borderWidth: stroke.hair,
              justifyContent: 'center',
              minHeight: size.control,
              opacity: busy !== null && busy !== provider ? 0.4 : 1,
            }}
          >
            <Text style={{ ...type.action, color: apple ? '#FFFFFF' : '#1F1F1F' }}>
              {busy === provider ? 'Abriendo…' : label}
            </Text>
          </Pressable>
        );
      })}
      {error !== null && (
        <Text
          accessibilityRole="alert"
          style={{ ...type.bodySmall, color: color.semantic.dangerOnRaised }}
        >
          {error}
        </Text>
      )}
    </View>
  );
}
