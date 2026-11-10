import { Link, Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { signInMessage } from '../../lib/authErrors';
import { safeNext } from '../../lib/next';
import { color } from '../../theme';

import { useAuth } from './AuthProvider';
import { hasOAuth, OAuthButtons } from './OAuthButtons';
import { authStyles as s } from './styles';

export function SignInScreen() {
  const { session, loading, signIn } = useAuth();
  // «?next=/g/CODE»: back to where the person was going (an invitation, an
  // answer). Only a path inside Movo; anything else is ignored.
  const { next } = useLocalSearchParams<{ next?: string }>();
  const target = safeNext(next);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <ActivityIndicator style={s.screen} />;
  // Typed routes cannot know a runtime path; safeNext has checked it.
  if (session) return <Redirect href={(target ?? '/') as '/'} />;

  const submit = () => {
    setError(null);
    setBusy(true);
    signIn(email.trim(), password)
      .catch((cause: unknown) => {
        setError(signInMessage(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <View style={s.screen}>
      <Text style={s.title}>Iniciar sesión</Text>
      <Text style={s.subtitle}>Movo — actividades cerca de ti</Text>

      <OAuthButtons />
      {hasOAuth && <Text style={s.hint}>O con tu correo:</Text>}

      <Text style={s.label}>Correo</Text>
      <TextInput
        accessibilityLabel="Correo"
        autoCapitalize="none"
        autoComplete="email"
        inputMode="email"
        onChangeText={setEmail}
        placeholder="tu@ejemplo.cr"
        placeholderTextColor={color.text.tertiary}
        style={s.input}
        value={email}
      />

      <Text style={s.label}>Contraseña</Text>
      <TextInput
        accessibilityLabel="Contraseña"
        autoCapitalize="none"
        autoComplete="current-password"
        onChangeText={setPassword}
        onSubmitEditing={submit}
        placeholder="••••••••"
        placeholderTextColor={color.text.tertiary}
        secureTextEntry
        style={s.input}
        value={password}
      />

      {/* The only feedback a failed sign-in has. It appears below the field the
          user just left, so without a role it lands silently. */}
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}

      <Pressable
        /* The label tracks the visible text: "Entrando…" is how the button
           reports that the request is in flight, and a fixed label would hide
           the only sign that anything happened. */
        accessibilityRole="button"
        accessibilityLabel={busy ? 'Entrando…' : 'Entrar'}
        aria-disabled={busy || !email || !password}
        disabled={busy || !email || !password}
        onPress={submit}
        style={[s.button, (busy || !email || !password) && s.buttonDisabled]}
      >
        <Text style={s.buttonText}>{busy ? 'Entrando…' : 'Entrar'}</Text>
      </Pressable>

      <Link href="/recuperar" style={s.link}>
        <Text style={s.linkText}>¿Olvidaste tu contraseña?</Text>
      </Link>
      <Link href="/sign-up" style={s.link}>
        <Text style={s.linkText}>¿No tienes cuenta? Regístrate</Text>
      </Link>
    </View>
  );
}
