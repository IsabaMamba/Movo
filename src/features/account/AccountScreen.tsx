/**
 * Mi cuenta — the person's own account, and the way out of it.
 *
 * Sign-out used to sit in Descubrir's header next to the email address, both
 * on the first screen anybody sees. It lives here now, with the name, the
 * attendance history and the community rules: the things that are about the
 * person rather than about sessions.
 *
 * Only the name is editable (see lib/account.ts). The photo waits for storage.
 */

import { Link, Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { fetchMyName, NAME_MAX, nameProblem, updateMyName } from '../../lib/account';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { createStyles as s } from '../create/styles';

export function AccountScreen() {
  const { session, loading, signOut } = useAuth();
  const [stored, setStored] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchMyName(supabase, userId)
      .then((value) => {
        if (cancelled) return;
        setStored(value);
        setName(value ?? '');
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setStored(null);
        setError(cause instanceof Error ? cause.message : 'No se pudo cargar tu cuenta.');
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return <ActivityIndicator style={s.screen} />;
  if (!session || !userId) return <Redirect href="/sign-in" />;

  const problem = nameProblem(name);
  const changed = stored !== undefined && name.trim() !== (stored ?? '');
  const canSave = !busy && changed && problem === null;

  const save = () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    updateMyName(supabase, userId, name)
      .then((value) => {
        setStored(value);
        setName(value);
        setNotice('Nombre guardado. Así te ven en las listas de las sesiones.');
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo guardar el nombre.');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <ScrollView aria-busy={busy} contentContainerStyle={s.content} style={s.screen}>
      <Link href="/" style={s.link}>
        <Text style={s.linkText}>← Descubrir</Text>
      </Link>

      <View style={s.header}>
        <Text accessibilityRole="header" style={s.title}>
          Mi cuenta
        </Text>
        <Text style={s.subtitle}>{session.user.email}</Text>
      </View>

      {notice !== null && (
        <View style={[s.banner, s.bannerOk]}>
          <Text accessibilityRole="alert" style={s.bannerText}>
            {notice}
          </Text>
        </View>
      )}
      {error !== null && (
        <View style={s.banner}>
          <Text accessibilityRole="alert" style={s.bannerText}>
            {error}
          </Text>
        </View>
      )}

      <View style={s.section}>
        <View style={s.field}>
          <Text style={s.label}>Nombre</Text>
          {stored === undefined ? (
            <ActivityIndicator />
          ) : (
            <TextInput
              accessibilityLabel="Nombre"
              accessibilityHint="Así te ven quien organiza y el resto de la sesión."
              autoComplete="name"
              maxLength={NAME_MAX}
              onChangeText={setName}
              onSubmitEditing={save}
              style={s.input}
              value={name}
            />
          )}
          <Text style={s.hint}>
            {changed && problem !== null
              ? problem
              : 'Así te ven quien organiza y el resto de la sesión. La foto de perfil todavía no está disponible.'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={busy ? 'Guardando' : 'Guardar el nombre'}
          aria-disabled={!canSave}
          disabled={!canSave}
          onPress={save}
          style={[s.publish, !canSave && s.publishDisabled]}
        >
          <Text style={s.publishText}>{busy ? 'Guardando…' : 'Guardar el nombre'}</Text>
        </Pressable>
      </View>

      <View style={s.section}>
        <Link href="/historial" style={s.link}>
          <Text style={s.linkText}>Mi historial de asistencia</Text>
        </Link>
        <Link href="/mis-sesiones" style={s.link}>
          <Text style={s.linkText}>Mis sesiones</Text>
        </Link>
        <Link href="/normas" style={s.link}>
          <Text style={s.linkText}>Normas de la comunidad</Text>
        </Link>
      </View>

      <View style={s.section}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesión"
          onPress={() => {
            void signOut();
          }}
          style={s.chip}
        >
          <Text style={s.chipText}>Cerrar sesión</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
