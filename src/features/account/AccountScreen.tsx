/**
 * Mi cuenta — the person's own account, and the way out of it.
 *
 * Sign-out used to sit in Descubrir's header next to the email address, both
 * on the first screen anybody sees. It lives here now, with the name, the
 * attendance history and the community rules: the things that are about the
 * person rather than about sessions.
 *
 * Only the name is editable (see lib/account.ts). The photo waits for storage.
 *
 * «Tus datos» is the way out (0029): download everything Movo holds, or
 * delete the account. Deleting asks for a typed word rather than a second
 * tap, says what happens to sessions, groups and messages before it happens,
 * and is the same size and weight as everything else on the screen — leaving
 * is not hidden, and not dressed up as a warning either.
 */

import { Link, Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  confirmsDeletion,
  deleteMyAccount,
  DELETE_WORD,
  exportFileName,
  exportMyData,
  fetchMyName,
  NAME_MAX,
  nameProblem,
  updateMyName,
} from '../../lib/account';
import { disablePush } from '../../lib/push';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { createStyles as s } from '../create/styles';

/** Web saves a file; native hands the text to the share sheet. */
async function deliverExport(data: unknown): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFileName();
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ title: exportFileName(), message: json });
}

export function AccountScreen() {
  const { session, loading, signOut } = useAuth();
  const [stored, setStored] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);

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

  const download = () => {
    if (exporting) return;
    setExporting(true);
    setError(null);
    setNotice(null);
    exportMyData(supabase)
      .then(deliverExport)
      .then(() => {
        setNotice('Listo: ahí están todos tus datos en Movo.');
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudieron descargar tus datos.');
      })
      .finally(() => {
        setExporting(false);
      });
  };

  const canDelete = !deleting && confirmsDeletion(typed);

  const remove = () => {
    if (!canDelete) return;
    setDeleting(true);
    setError(null);
    setNotice(null);
    // Unsubscribe this device first, while there is still an account to
    // unregister it with. The rest of its devices go with the account.
    disablePush(supabase)
      .then(() => deleteMyAccount(supabase))
      .then(async () => {
        // Local only: the account no longer exists to sign out of.
        await supabase.auth.signOut({ scope: 'local' });
        router.replace('/');
      })
      .catch((cause: unknown) => {
        setDeleting(false);
        setError(cause instanceof Error ? cause.message : 'No se pudo borrar tu cuenta.');
      });
  };

  return (
    <ScrollView
      aria-busy={busy || exporting || deleting}
      contentContainerStyle={s.content}
      style={s.screen}
    >
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
        <Text accessibilityRole="header" style={s.label}>
          Tus datos
        </Text>
        <Text style={s.hint}>
          Un archivo con todo lo que Movo guarda de ti: tu perfil, tus sesiones, tus grupos, tus
          mensajes, tus reportes y tus avisos. De otras personas solo aparece un identificador,
          nunca su nombre.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={exporting ? 'Preparando tus datos' : 'Descargar mis datos'}
          aria-disabled={exporting}
          disabled={exporting}
          onPress={download}
          style={s.chip}
        >
          <Text style={s.chipText}>{exporting ? 'Preparando…' : 'Descargar mis datos'}</Text>
        </Pressable>

        {confirming ? (
          <View style={s.field}>
            <Text style={s.hint}>
              Al borrar tu cuenta se borran tu perfil, tus sesiones, tu historial y tus avisos. Las
              sesiones que organizas y todavía no pasan se cancelan, y a quienes iban les llega un
              aviso. Tu lugar en sesiones de otras personas pasa a quien esté en lista de espera. Si
              creaste un grupo, queda a cargo de otra persona del grupo. Tus mensajes en los chats
              se quedan, pero sin tu nombre. Esto no se puede deshacer.
            </Text>
            <Text style={s.label}>Escribe «{DELETE_WORD}» para confirmar</Text>
            <TextInput
              accessibilityLabel={`Escribe ${DELETE_WORD} para confirmar`}
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect={false}
              onChangeText={setTyped}
              onSubmitEditing={remove}
              style={s.input}
              value={typed}
            />
            <View style={s.chipRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  deleting ? 'Borrando tu cuenta' : 'Borrar mi cuenta para siempre'
                }
                aria-disabled={!canDelete}
                disabled={!canDelete}
                onPress={remove}
                style={[s.chip, !canDelete && s.publishDisabled]}
              >
                <Text style={s.chipText}>{deleting ? 'Borrando…' : 'Borrar mi cuenta'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="No borrar mi cuenta"
                disabled={deleting}
                onPress={() => {
                  setConfirming(false);
                  setTyped('');
                }}
                style={s.chip}
              >
                <Text style={s.chipText}>No, volver</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Borrar mi cuenta"
            onPress={() => {
              setNotice(null);
              setError(null);
              setConfirming(true);
            }}
            style={s.chip}
          >
            <Text style={s.chipText}>Borrar mi cuenta</Text>
          </Pressable>
        )}
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
