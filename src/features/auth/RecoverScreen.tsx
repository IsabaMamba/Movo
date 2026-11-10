/**
 * «¿Olvidaste tu contraseña?» — /recuperar, in two halves.
 *
 *   1. Asking: an email, and the same answer whether or not it has an account.
 *   2. Coming back from the link in the email: a new password, twice.
 *
 * Which half is decided by how the page was opened (`arrivedFromRecovery`),
 * not by whether there is a session: somebody who is simply signed in and
 * lands here is sent to «Cambiar contraseña», which asks for the current one.
 * The rules and the calls live in lib/recovery.
 */

import { Link, Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { MIN_PASSWORD_LENGTH } from '../../lib/password';
import {
  RECOVERY_SENT,
  recoveredPasswordProblem,
  requestRecovery,
  saveRecoveredPassword,
} from '../../lib/recovery';
import { arrivedFromRecovery, recoveryLinkExpired, supabase } from '../../lib/supabase';
import { color } from '../../theme';

import { useAuth } from './AuthProvider';
import { authStyles as s } from './styles';

function recoverRedirect(): string | undefined {
  return typeof window !== 'undefined' && window.location.origin
    ? `${window.location.origin}/recuperar`
    : undefined;
}

export function RecoverScreen() {
  const { session, loading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [saved, setSaved] = useState(false);

  if (loading) return <ActivityIndicator style={s.screen} />;

  // ------------------------------------------------ back from the email
  if (arrivedFromRecovery && session) {
    if (saved) {
      return (
        <View style={s.screen}>
          <Text accessibilityRole="header" style={s.title}>
            Tu contraseña cambió
          </Text>
          <Text accessibilityRole="alert" style={s.notice}>
            Ya estás dentro con la nueva. Cerramos tu sesión en tus otros teléfonos y navegadores.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              router.replace('/');
            }}
            style={s.button}
          >
            <Text style={s.buttonText}>Ir a Movo</Text>
          </Pressable>
        </View>
      );
    }

    const problem = recoveredPasswordProblem(next, repeat);
    const save = () => {
      if (problem || busy) return;
      setBusy(true);
      setError(null);
      saveRecoveredPassword(supabase, next)
        .then(() => {
          setSaved(true);
        })
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : 'No se pudo guardar.');
        })
        .finally(() => {
          setBusy(false);
        });
    };

    return (
      <View style={s.screen}>
        <Text accessibilityRole="header" style={s.title}>
          Elige una contraseña nueva
        </Text>
        <Text style={s.subtitle}>Para {session.user.email ?? 'tu cuenta'}.</Text>

        <Text style={s.label}>Contraseña nueva</Text>
        <TextInput
          accessibilityLabel="Contraseña nueva"
          autoCapitalize="none"
          autoComplete="new-password"
          onChangeText={setNext}
          placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
          placeholderTextColor={color.text.tertiary}
          secureTextEntry
          style={s.input}
          value={next}
        />
        <Text style={s.label}>Repítela</Text>
        <TextInput
          accessibilityLabel="Repite la contraseña nueva"
          autoCapitalize="none"
          autoComplete="new-password"
          onChangeText={setRepeat}
          onSubmitEditing={save}
          secureTextEntry
          style={s.input}
          value={repeat}
        />

        {(next !== '' || repeat !== '') && problem ? <Text style={s.hint}>{problem}</Text> : null}
        {error ? (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          aria-disabled={busy || problem !== null}
          disabled={busy || problem !== null}
          onPress={save}
          style={[s.button, (busy || problem !== null) && s.buttonDisabled]}
        >
          <Text style={s.buttonText}>{busy ? 'Guardando…' : 'Cambiar contraseña'}</Text>
        </Pressable>
      </View>
    );
  }

  // Signed in without a recovery link: the ordinary change, which asks for
  // the current password.
  if (session) return <Redirect href="/perfil/contrasena" />;

  // ------------------------------------------------------------ asking
  if (sent) {
    return (
      <View style={s.screen}>
        <Text accessibilityRole="header" style={s.title}>
          Revisa tu correo
        </Text>
        <Text accessibilityRole="alert" style={s.notice}>
          {RECOVERY_SENT}
        </Text>
        <Link href="/sign-in" style={s.link}>
          <Text style={s.linkText}>Volver a Entrar</Text>
        </Link>
      </View>
    );
  }

  const canAsk = email.trim() !== '' && !busy;
  const ask = () => {
    if (!canAsk) return;
    setBusy(true);
    setError(null);
    requestRecovery(supabase, email, recoverRedirect())
      .then(() => {
        setSent(true);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo mandar el correo.');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <View style={s.screen}>
      <Text accessibilityRole="header" style={s.title}>
        Cambia tu contraseña
      </Text>
      <Text style={s.subtitle}>
        Escribe el correo con el que entras y te mandamos un enlace para elegir una nueva.
      </Text>

      {recoveryLinkExpired ? (
        <Text accessibilityRole="alert" style={s.error}>
          Ese enlace ya se usó o venció. Pide uno nuevo.
        </Text>
      ) : null}

      <Text style={s.label}>Correo</Text>
      <TextInput
        accessibilityLabel="Correo"
        autoCapitalize="none"
        autoComplete="email"
        inputMode="email"
        onChangeText={setEmail}
        onSubmitEditing={ask}
        placeholder="tu@ejemplo.cr"
        placeholderTextColor={color.text.tertiary}
        style={s.input}
        value={email}
      />

      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        aria-disabled={!canAsk}
        disabled={!canAsk}
        onPress={ask}
        style={[s.button, !canAsk && s.buttonDisabled]}
      >
        <Text style={s.buttonText}>{busy ? 'Mandando…' : 'Mandar el enlace'}</Text>
      </Pressable>

      <Link href="/sign-in" style={s.link}>
        <Text style={s.linkText}>Volver a Entrar</Text>
      </Link>
    </View>
  );
}
