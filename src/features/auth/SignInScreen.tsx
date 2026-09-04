import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { useAuth } from './AuthProvider';
import { authStyles as s } from './styles';

export function SignInScreen() {
  const { session, loading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (session) return <Redirect href="/" />;

  const submit = () => {
    setError(null);
    setBusy(true);
    signIn(email.trim(), password)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión.');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <View style={s.screen}>
      <Text style={s.title}>Iniciar sesión</Text>
      <Text style={s.subtitle}>Movo — actividades cerca de vos</Text>

      <Text style={s.label}>Correo</Text>
      <TextInput
        autoCapitalize="none"
        autoComplete="email"
        inputMode="email"
        onChangeText={setEmail}
        placeholder="vos@ejemplo.cr"
        style={s.input}
        value={email}
      />

      <Text style={s.label}>Contraseña</Text>
      <TextInput
        autoCapitalize="none"
        autoComplete="current-password"
        onChangeText={setPassword}
        onSubmitEditing={submit}
        placeholder="••••••••"
        secureTextEntry
        style={s.input}
        value={password}
      />

      {error ? <Text style={s.error}>{error}</Text> : null}

      <Pressable
        disabled={busy || !email || !password}
        onPress={submit}
        style={[s.button, (busy || !email || !password) && s.buttonDisabled]}
      >
        <Text style={s.buttonText}>{busy ? 'Entrando…' : 'Entrar'}</Text>
      </Pressable>

      <Link href="/sign-up" style={s.link}>
        <Text style={s.linkText}>¿No tenés cuenta? Registrate</Text>
      </Link>
    </View>
  );
}
