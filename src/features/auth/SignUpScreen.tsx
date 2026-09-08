import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { color } from '../../theme';

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

  if (loading) return <ActivityIndicator style={s.screen} />;
  if (session) return <Redirect href="/" />;

  if (confirmationSent) {
    return (
      <View style={s.screen}>
        <Text style={s.title}>Revisá tu correo</Text>
        {/* Nothing else marks the transition: the form is replaced in place, so
            this text is the whole outcome of pressing the button. */}
        <Text accessibilityRole="alert" style={s.notice}>
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
        accessibilityLabel="Nombre"
        /* The length bounds are enforced by silently disabling the button, so
           they have to be said somewhere a screen reader reaches. */
        accessibilityHint={`Entre ${NAME_MIN} y ${NAME_MAX} caracteres.`}
        autoComplete="name"
        maxLength={NAME_MAX}
        onChangeText={setDisplayName}
        placeholder="Cómo te van a ver"
        placeholderTextColor={color.text.tertiary}
        style={s.input}
        value={displayName}
      />

      <Text style={s.label}>Correo</Text>
      <TextInput
        accessibilityLabel="Correo"
        autoCapitalize="none"
        autoComplete="email"
        inputMode="email"
        onChangeText={setEmail}
        placeholder="vos@ejemplo.cr"
        placeholderTextColor={color.text.tertiary}
        style={s.input}
        value={email}
      />

      <Text style={s.label}>Contraseña</Text>
      <TextInput
        accessibilityLabel="Contraseña"
        /* The minimum only exists in the placeholder, which is gone as soon as
           there is a character in the field. */
        accessibilityHint="Mínimo 6 caracteres."
        autoCapitalize="none"
        autoComplete="new-password"
        onChangeText={setPassword}
        onSubmitEditing={submit}
        placeholder="Mínimo 6 caracteres"
        placeholderTextColor={color.text.tertiary}
        secureTextEntry
        style={s.input}
        value={password}
      />

      {/* The only feedback a failed signup has. It appears below the field the
          user just left, so without a role it lands silently. */}
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}

      <Pressable
        /* The label tracks the visible text: "Creando…" is how the button
           reports that the request is in flight, and a fixed label would hide
           the only sign that anything happened. */
        accessibilityRole="button"
        accessibilityLabel={busy ? 'Creando…' : 'Crear cuenta'}
        accessibilityState={{ disabled: !canSubmit }}
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
