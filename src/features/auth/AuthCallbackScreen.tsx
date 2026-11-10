/**
 * movo://auth-callback — where Apple or Google send a phone back (see
 * lib/oauth.ts). The tokens arrive after `#`; they become the session and
 * the person continues to /registro, which knows whether there are steps
 * left. On web this route is not used: the provider returns to /registro and
 * the client reads the URL itself.
 */

import * as Linking from 'expo-linking';
import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { readCallback } from '../../lib/oauthCallback';
import { supabase } from '../../lib/supabase';
import { authStyles as s } from './styles';

export function AuthCallbackScreen() {
  const url = Linking.useURL();
  const router = useRouter();
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    const result = readCallback(url);
    if (!result.ok) {
      setProblem(result.problem ?? 'Este enlace no trae una sesión. Vuelve a intentarlo.');
      return;
    }
    supabase.auth
      .setSession({
        access_token: result.tokens.accessToken,
        refresh_token: result.tokens.refreshToken,
      })
      .then(({ error }) => {
        if (error) throw error;
        router.replace('/registro');
      })
      .catch(() => {
        setProblem('No pudimos entrar con esa cuenta. Intenta de nuevo o usa tu correo.');
      });
  }, [url, router]);

  if (problem === null) return <ActivityIndicator style={s.screen} />;

  return (
    <View style={s.screen}>
      <Text style={s.title}>No pudimos entrar</Text>
      <Text accessibilityRole="alert" style={s.notice}>
        {problem}
      </Text>
      <Link href="/sign-up" style={s.link}>
        <Text style={s.linkText}>Volver</Text>
      </Link>
    </View>
  );
}
