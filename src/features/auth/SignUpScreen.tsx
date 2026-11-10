/**
 * Crear cuenta (Registro v3 · 1–3).
 *
 *   1. Bienvenida: Apple, Google or email.
 *   2. Con correo: the email and a password of 8 or more.
 *   3. Revisa tu correo.
 *
 * Everything else — name, date of birth, gender, sports, zone, the rules —
 * comes after the account exists, in /registro, because Apple and Google
 * create the account before Movo can ask anything (0060). An account under
 * 18 is deleted there, before anything about the person is kept.
 */

import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { passwordOk, passwordProblem } from '../../lib/password';
import { color } from '../../theme';
import { useAuth } from './AuthProvider';
import { OAuthButtons } from './OAuthButtons';
import { authStyles as s } from './styles';

type Phase = 'welcome' | 'email' | 'sent';

export function SignUpScreen() {
  const { session, loading, signUp } = useAuth();
  const [phase, setPhase] = useState<Phase>('welcome');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <ActivityIndicator style={s.screen} />;
  if (session) return <Redirect href="/registro" />;

  if (phase === 'sent') {
    return (
      <View style={s.screen}>
        <Text style={s.title}>Revisa tu correo</Text>
        {/* Nothing else marks the transition: the form is replaced in place, so
            this text is the whole outcome of pressing the button. */}
        <Text accessibilityRole="alert" style={s.notice}>
          Mandamos un enlace a {email.trim()}. Ábrelo en este teléfono y sigues donde quedaste.
        </Text>
        <Text style={s.hint}>¿No llegó? Revisa en correo no deseado.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setPhase('email');
          }}
          style={s.link}
        >
          <Text style={s.linkText}>Cambiar el correo</Text>
        </Pressable>
        <Link href="/sign-in" style={s.link}>
          <Text style={s.linkText}>Volver a entrar</Text>
        </Link>
      </View>
    );
  }

  if (phase === 'welcome') {
    return (
      <ScrollView contentContainerStyle={s.scrollContent} style={s.scroll}>
        <Text style={s.label}>COSTA RICA · MAYORES DE 18</Text>
        <Text accessibilityRole="header" style={s.title}>
          Encuentra con quién moverte
        </Text>
        <Text style={s.subtitle}>
          Correr, jugar, pedalear, remar o entrenar cerca de ti, con gente real y en lugares
          públicos.
        </Text>

        <OAuthButtons />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setPhase('email');
          }}
          style={[s.button, s.buttonGhost]}
        >
          <Text style={[s.buttonText, s.buttonGhostText]}>Continuar con correo</Text>
        </Pressable>

        <Link href="/sign-in" style={s.link}>
          <Text style={s.linkText}>¿Ya tienes cuenta? Entrar</Text>
        </Link>
        {/* Terms and privacy join this line when /terminos and /privacidad
            exist (Legal v1); a link to a page that is not there is worse. */}
        <Text style={s.hint}>Antes de entrar te mostramos las normas de la comunidad.</Text>
      </ScrollView>
    );
  }

  const canSubmit = email.trim().length > 0 && passwordOk(password) && !busy;
  const passwordHint = passwordProblem(password);

  const submit = () => {
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    signUp(email.trim(), password)
      .then((outcome) => {
        // With email confirmation on, signUp returns no session. With it off,
        // the session arrives and the redirect above takes over.
        if (outcome === 'confirmation-required') setPhase('sent');
      })
      .catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : '';
        setError(
          /already registered/i.test(message)
            ? 'Ya hay una cuenta con ese correo. Entra con él.'
            : message || 'No se pudo crear la cuenta.',
        );
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <ScrollView contentContainerStyle={s.scrollContent} style={s.scroll}>
      <Pressable
        accessibilityLabel="Volver"
        accessibilityRole="button"
        onPress={() => {
          setPhase('welcome');
        }}
        style={s.link}
      >
        <Text style={s.linkText}>Volver</Text>
      </Pressable>
      <Text accessibilityRole="header" style={s.title}>
        Tu correo y una contraseña
      </Text>
      <Text style={s.subtitle}>Te mandamos un enlace para confirmar que el correo es tuyo.</Text>

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
        accessibilityHint="Mínimo 8 caracteres."
        accessibilityLabel="Contraseña"
        autoCapitalize="none"
        autoComplete="new-password"
        onChangeText={setPassword}
        onSubmitEditing={submit}
        placeholder="Mínimo 8 caracteres"
        placeholderTextColor={color.text.tertiary}
        secureTextEntry
        style={s.input}
        value={password}
      />
      {passwordHint ? (
        <Text accessibilityLiveRegion="polite" style={s.hint}>
          {passwordHint}
        </Text>
      ) : null}
      <Text style={s.hint}>
        Nadie más ve tu correo: ni quien organiza ni las otras personas de una sesión.
      </Text>

      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}

      <Pressable
        accessibilityLabel={busy ? 'Creando…' : 'Crear cuenta'}
        accessibilityRole="button"
        aria-disabled={!canSubmit}
        disabled={!canSubmit}
        onPress={submit}
        style={[s.button, !canSubmit && s.buttonDisabled]}
      >
        <Text style={s.buttonText}>{busy ? 'Creando…' : 'Crear cuenta'}</Text>
      </Pressable>
    </ScrollView>
  );
}
