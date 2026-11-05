/**
 * Cambiar correo and Cambiar contraseña (Perfil v3). One screen, two modes,
 * because they are the same shape: say what happens, ask, confirm.
 * The rules and the calls live in lib/credentials.
 */

import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  changeEmail,
  changePassword,
  emailProblem,
  hasPassword,
  newPasswordProblem,
} from '../../lib/credentials';
import { MIN_PASSWORD_LENGTH } from '../../lib/password';
import { supabase } from '../../lib/supabase';
import { color, hitSlopFor, size } from '../../theme';
import { useAuth } from '../auth/AuthProvider';
import { createStyles as s } from '../create/styles';
import { Icon } from '../nav/Icon';

export function CredentialsScreen({ mode }: { mode: 'email' | 'password' }) {
  const { session, loading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (loading) return <ActivityIndicator style={s.screen} />;
  if (!session) return <Redirect href="/sign-in" />;

  const user = session.user;
  const isEmail = mode === 'email';
  const problem = isEmail
    ? emailProblem(email, user.email)
    : newPasswordProblem(current, next, repeat);
  const touched = isEmail ? email !== '' : current !== '' || next !== '' || repeat !== '';

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/cuenta');
  };

  const save = () => {
    if (problem || busy) return;
    setBusy(true);
    setError(null);
    (isEmail
      ? changeEmail(supabase, email)
      : changePassword(supabase, user.email ?? '', current, next, signOutOthers)
    )
      .then(() => {
        setDone(
          isEmail
            ? `Te mandamos un correo a ${email.trim().toLowerCase()} para confirmarlo, y otro a tu correo actual para avisarte. Hasta que lo confirmes, sigues entrando con ${user.email ?? 'tu correo actual'}.`
            : signOutOthers
              ? 'Listo: tu contraseña cambió y cerramos tu sesión en tus otros teléfonos y navegadores.'
              : 'Listo: tu contraseña cambió.',
        );
        setCurrent('');
        setNext('');
        setRepeat('');
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo guardar.');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    secret: boolean,
    hint?: string,
  ) => (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        autoComplete={
          secret ? (label.includes('actual') ? 'current-password' : 'new-password') : 'email'
        }
        autoCorrect={false}
        inputMode={secret ? 'text' : 'email'}
        onChangeText={onChange}
        secureTextEntry={secret}
        style={s.input}
        value={value}
      />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );

  return (
    <ScrollView aria-busy={busy} contentContainerStyle={s.content} style={s.screen}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}>
        <Pressable
          accessibilityLabel="Volver a Perfil"
          accessibilityRole="button"
          hitSlop={hitSlopFor(size.controlSm)}
          onPress={back}
        >
          <Icon color={color.text.primary} name="back" size={22} />
        </Pressable>
        <Text accessibilityRole="header" style={s.title}>
          {isEmail ? 'Cambiar correo' : 'Cambiar contraseña'}
        </Text>
      </View>

      {!isEmail && !hasPassword(user) ? (
        <Text style={s.hint}>
          Entras con Google o Apple, así que no tienes contraseña en Movo. Para cambiar cómo entras,
          hazlo en tu cuenta de Google o Apple.
        </Text>
      ) : done ? (
        <View style={[s.banner, s.bannerOk]}>
          <Text accessibilityRole="alert" style={s.bannerText}>
            {done}
          </Text>
        </View>
      ) : (
        <>
          {isEmail ? (
            <>
              <Text style={s.hint}>Tu correo ahora: {user.email}</Text>
              {field(
                'Correo nuevo',
                email,
                setEmail,
                false,
                'Lo usas para entrar y para los avisos de tu cuenta. No es público.',
              )}
            </>
          ) : (
            <>
              {field('Contraseña actual', current, setCurrent, true)}
              {field(
                'Contraseña nueva',
                next,
                setNext,
                true,
                `${MIN_PASSWORD_LENGTH} caracteres o más.`,
              )}
              {field('Repite la nueva', repeat, setRepeat, true)}
              <View style={s.switchRow}>
                <Text style={s.switchLabel}>
                  Cerrar sesión en mis otros teléfonos y navegadores
                </Text>
                <Switch
                  accessibilityLabel="Cerrar sesión en mis otros teléfonos y navegadores"
                  onValueChange={setSignOutOthers}
                  thumbColor={signOutOthers ? color.accent.cool : color.text.tertiary}
                  trackColor={{ false: color.border.default, true: color.accent.deep }}
                  value={signOutOthers}
                />
              </View>
            </>
          )}

          {error !== null && (
            <View style={s.banner}>
              <Text accessibilityRole="alert" style={s.bannerText}>
                {error}
              </Text>
            </View>
          )}
          {touched && problem && <Text style={s.missing}>{problem}</Text>}

          <Pressable
            accessibilityRole="button"
            aria-disabled={busy || problem !== null}
            disabled={busy || problem !== null}
            onPress={save}
            style={[s.publish, (busy || problem !== null) && s.publishDisabled]}
          >
            <Text style={s.publishText}>
              {busy
                ? 'Guardando…'
                : isEmail
                  ? 'Mandar el correo para confirmar'
                  : 'Cambiar contraseña'}
            </Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}
