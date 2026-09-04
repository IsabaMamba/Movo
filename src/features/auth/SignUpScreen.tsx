import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { useAuth } from './AuthProvider';
import { authStyles as s } from './styles';

/** Mirrors the profiles check constraint so the fallback name never triggers. */
const NAME_MIN = 2;
const NAME_MAX = 60;

export function SignUpScreen() {
  const { session, loading, signUp } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (session) return <Redirect href="/" />;

  if (confirmationSent) {
    return (
      <View style={s.screen}>
        <Text style={s.title}>Revisá tu correo</Text>
        <Text style={s.notice}>
          Te enviamos un enlace de confirmación a {email.trim()}. Abrilo para activar tu cuenta y
          después iniciá sesión.
        </Text>
        <Link href="/sign-in" style={s.link}>
          <Text style={s.linkText}>Volver a iniciar sesión</Text>
        </Link>
      </View>
    );
  }

  const trimmedName = displayName.trim();
  const nameValid = trimmedName.length >= NAME_MIN && trimmedName.length <= NAME_MAX;
  const canSubmit = nameValid && email.length > 0 && password.length > 0 && !busy;

  const submit = () => {
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    signUp(email.trim(), password, trimmedName)
      .then((outcome) => {
        // With email confirmation on, signUp returns no session. Redirecting
        // to the app here would land on a screen that cannot read anything.
        if (outcome === 'confirmation-required') setConfirmationSent(true);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo crear la cuenta.');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <View style={s.screen}>
      <Text style={s.title}>Crear cuenta</Text>
      <Text style={s.subtitle}>Movo — actividades cerca de vos</Text>

      <Text style={s.label}>Nombre</Text>
      <TextInput
        autoComplete="name"
        maxLength={NAME_MAX}
        onChangeText={setDisplayName}
        placeholder="Cómo te van a ver"
        style={s.input}
        value={displayName}
      />

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
        autoComplete="new-password"
        onChangeText={setPassword}
        onSubmitEditing={submit}
        placeholder="Mínimo 6 caracteres"
        secureTextEntry
        style={s.input}
        value={password}
      />

      {error ? <Text style={s.error}>{error}</Text> : null}

      <Pressable
        disabled={!canSubmit}
        onPress={submit}
        style={[s.button, !canSubmit && s.buttonDisabled]}
      >
        <Text style={s.buttonText}>{busy ? 'Creando…' : 'Crear cuenta'}</Text>
      </Pressable>

      <Link href="/sign-in" style={s.link}>
        <Text style={s.linkText}>¿Ya tenés cuenta? Iniciá sesión</Text>
      </Link>
    </View>
  );
}
