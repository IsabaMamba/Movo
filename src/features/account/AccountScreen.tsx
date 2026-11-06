/**
 * Perfil — the person, their settings, and the way out (Perfil v2, phone 1).
 *
 * The card at the top is the same one the public preview shows, plus the
 * zone only its owner sees. Editing moved to /perfil/editar; this screen is
 * the index: Tu actividad, Ajustes, Tu cuenta.
 *
 * Earlier notes, still true:
 *
 * Sign-out used to sit in Descubrir's header next to the email address, both
 * on the first screen anybody sees. It lives here now, with the name, the
 * attendance history and the community rules: the things that are about the
 * person rather than about sessions.
 *
 * The photo waits for storage, moderation and an avatar provider.
 *
 * «Tus datos» is the way out (0029): download everything Movo holds, or
 * delete the account. Deleting asks for a typed word rather than a second
 * tap, says what happens to sessions, groups and messages before it happens,
 * and is the same size and weight as everything else on the screen — leaving
 * is not hidden, and not dressed up as a warning either.
 *
 * Step 22 of the 2 November walkthrough: the bell beside the title, the avatar
 * with its camera badge, icons on every row, the state of Avisos as the row's
 * value, and «Tus datos» and «Cerrar sesión» as rows of «Tu cuenta» — the
 * download and the delete open under «Tus datos» rather than sitting open.
 *
 * Perfil v3 (4 November): the menu in three blocks — Seguridad y privacidad
 * (Bloqueos with its count, Tus permisos, Notificaciones), Ayuda y normas,
 * Tu cuenta — and «Cerrar sesión» and «Eliminar la cuenta» as two plain
 * buttons at the end, not rows. Signing out asks once, and says nothing is
 * lost. «Verificar identidad» and «Legal y privacidad» join the menu when
 * their screens exist; a row that leads nowhere is worse than no row.
 */

import { Link, Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
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
} from '../../lib/account';
import { hasPassword } from '../../lib/credentials';
import { fetchBlockedPeople } from '../../lib/blocks';
import { fetchNotificationPrefs, prefsSummary } from '../../lib/notificationPrefs';
import { levelLabel, mySports } from '../../lib/profile';
import { disablePush } from '../../lib/push';
import { supabase } from '../../lib/supabase';
import { color } from '../../theme';
import { sportColor } from '../../theme/sport';
import { useAuth } from '../auth/AuthProvider';
import { createStyles as s } from '../create/styles';
import { BellLink } from '../nav/BellLink';
import { Icon, type IconName } from '../nav/Icon';
import { ProfileCard } from '../profile/ProfileCard';
import { profileStyles as p } from '../profile/styles';
import { useMyProfile } from '../profile/useMyProfile';

type RowHref =
  | '/historial'
  | '/organizar'
  | '/avisos'
  | '/permisos'
  | '/normas'
  | '/mis-sesiones'
  | '/perfil/bloqueos'
  | '/perfil/correo'
  | '/perfil/contrasena'
  | '/perfil/notificaciones'
  | '/lugares'
  | '/ayuda';

/** The inside of a settings row: icon, label, optional value, chevron. */
function RowBody({
  icon,
  label,
  sub,
  value,
  quiet,
  chevron = true,
}: {
  icon: IconName;
  label: string;
  sub?: string;
  value?: string | null;
  quiet?: boolean;
  chevron?: boolean;
}) {
  return (
    <>
      <View aria-hidden style={p.rowIcon}>
        <Icon color={quiet ? color.text.tertiary : color.text.secondary} name={icon} size={20} />
      </View>
      {sub ? (
        <View style={p.rowStack}>
          <Text style={[p.rowText, quiet && p.rowTextQuiet]}>{label}</Text>
          <Text style={p.rowSub}>{sub}</Text>
        </View>
      ) : (
        <Text style={[p.rowText, quiet && p.rowTextQuiet]}>{label}</Text>
      )}
      {value ? <Text style={p.rowValue}>{value}</Text> : null}
      {chevron && <Icon color={color.text.tertiary} name="chevronRight" size={16} />}
    </>
  );
}

/** One row of a settings group that goes somewhere. */
function Row({
  href,
  icon,
  label,
  sub,
  value,
  last,
}: {
  href: RowHref;
  icon: IconName;
  label: string;
  sub?: string;
  value?: string | null;
  last?: boolean;
}) {
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={value ? `${label}, ${value}` : label}
        style={[p.row, last && p.rowLast]}
      >
        <RowBody icon={icon} label={label} sub={sub} value={value} />
      </Pressable>
    </Link>
  );
}

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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [blockCount, setBlockCount] = useState<number | null>(null);
  const [prefsValue, setPrefsValue] = useState<string | null>(null);

  const userId = session?.user.id;

  // Both values are decoration on a row; a failure leaves the row bare.
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      void fetchBlockedPeople(supabase)
        .then((list) => {
          setBlockCount(list.length);
        })
        .catch(() => undefined);
      void fetchNotificationPrefs(supabase, userId)
        .then((prefs) => {
          setPrefsValue(prefsSummary(prefs));
        })
        .catch(() => undefined);
    }, [userId]),
  );
  const { profile, categories, zone, error: loadError, reload } = useMyProfile(userId);
  const categoryName = (id: string) => categories.find((k) => k.id === id)?.name_es ?? id;

  // Back from Editar perfil, the card should show what was just saved.
  useFocusEffect(
    useCallback(() => {
      void reload().catch(() => undefined);
    }, [reload]),
  );

  if (loading) return <ActivityIndicator style={s.screen} />;
  if (!session || !userId) return <Redirect href="/sign-in" />;

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
      aria-busy={exporting || deleting}
      contentContainerStyle={s.content}
      style={s.screen}
    >
      <View style={p.headerRow}>
        <Text accessibilityRole="header" style={s.title}>
          Perfil
        </Text>
        <BellLink userId={userId} />
      </View>

      {profile === undefined ? (
        <ActivityIndicator />
      ) : profile === null ? (
        <Text style={s.error}>{loadError ?? 'No se pudo cargar tu perfil.'}</Text>
      ) : (
        <ProfileCard
          name={profile.display_name}
          onPhoto={() => {
            router.push('/perfil/editar');
          }}
          // The sports are a section of their own here, with a level each
          // (Deportes v2 · 3); the card keeps them for the public preview.
          sports={[]}
          zone={zone}
        />
      )}

      <View style={p.actions}>
        <Link href="/perfil/editar" asChild>
          <Pressable accessibilityRole="link" style={p.action}>
            <Icon color={color.text.primary} name="pencil" size={16} />
            <Text style={p.actionText}>Editar perfil</Text>
          </Pressable>
        </Link>
        <Link href="/perfil/publico" asChild>
          <Pressable accessibilityRole="link" style={p.action}>
            <Icon color={color.text.primary} name="eye" size={16} />
            <Text style={p.actionText}>Ver perfil público</Text>
          </Pressable>
        </Link>
      </View>

      {profile ? (
        <View style={s.section}>
          <View style={p.headerRow}>
            <Text style={p.groupLabel}>TUS DEPORTES</Text>
            <Link href="/perfil/deportes" style={p.sectionLink}>
              <Text style={p.sectionLinkText}>
                {mySports(profile).length > 0 ? 'Editar' : 'Elegir'}
              </Text>
            </Link>
          </View>
          {mySports(profile).length === 0 ? (
            <Text style={s.hint}>Elige tus deportes y tu nivel en cada uno.</Text>
          ) : (
            <View style={p.group}>
              {mySports(profile).map((sport, i, all) => (
                <View
                  accessible
                  accessibilityLabel={`${categoryName(sport.category)}, ${levelLabel(sport.level)}`}
                  key={sport.category}
                  style={[p.row, i === all.length - 1 && p.rowLast]}
                >
                  <View aria-hidden style={p.rowIcon}>
                    <View style={[p.chipDot, { backgroundColor: sportColor(sport.category) }]} />
                  </View>
                  <Text style={p.rowText}>{categoryName(sport.category)}</Text>
                  <Text style={p.rowValue}>{levelLabel(sport.level)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ) : null}

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
        <Text style={p.groupLabel}>TU ACTIVIDAD</Text>
        <View style={p.group}>
          <Row href="/mis-sesiones" icon="calendar" label="Mis sesiones" />
          <Row href="/historial" icon="history" label="Historial de asistencia" />
          {/* Organizar lives here since the tab bar (16 October): most people
              organise nothing, so it is a row, not a tab. */}
          <Row href="/organizar" icon="clipboard" label="Organizar" />
          <Row href="/lugares" icon="pin" label="Mis lugares" last />
        </View>
      </View>

      <View style={s.section}>
        <Text style={p.groupLabel}>SEGURIDAD Y PRIVACIDAD</Text>
        <View style={p.group}>
          <Row
            href="/perfil/bloqueos"
            icon="hand"
            label="Bloqueos"
            value={blockCount === null ? null : String(blockCount)}
          />
          <Row
            href="/permisos"
            icon="shield"
            label="Tus permisos"
            sub="Ubicación, avisos y normas aceptadas"
          />
          <Row
            href="/perfil/notificaciones"
            icon="bell"
            label="Notificaciones"
            sub={prefsValue ?? 'Qué te avisamos y en qué chats'}
            last
          />
        </View>
      </View>

      <View style={s.section}>
        <Text style={p.groupLabel}>AYUDA Y NORMAS</Text>
        <View style={p.group}>
          <Row href="/ayuda" icon="search" label="Ayuda" />
          <Row href="/normas" icon="book" label="Normas de la comunidad" last />
        </View>
      </View>

      <View style={s.section}>
        <Text style={p.groupLabel}>TU CUENTA</Text>
        <View style={p.group}>
          <Row
            href="/perfil/correo"
            icon="pencil"
            label="Correo"
            value={session.user.email ?? null}
          />
          {hasPassword(session.user) && (
            <Row href="/perfil/contrasena" icon="lock" label="Contraseña" />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Descargar tus datos"
            aria-expanded={dataOpen}
            onPress={() => {
              setDataOpen(!dataOpen);
            }}
            style={p.row}
          >
            <RowBody icon="download" label="Descargar tus datos" />
          </Pressable>
        </View>

        <View style={p.endActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setSigningOut(true);
            }}
            style={p.endAction}
          >
            <Icon color={color.text.secondary} name="logout" size={16} />
            <Text style={p.endActionText}>Cerrar sesión</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setNotice(null);
              setError(null);
              setDataOpen(true);
              setConfirming(true);
            }}
            style={p.endAction}
          >
            <Icon color={color.semantic.dangerOnRaised} name="close" size={16} />
            <Text style={[p.endActionText, p.endActionDanger]}>Eliminar la cuenta</Text>
          </Pressable>
        </View>

        {signingOut && (
          <View accessibilityViewIsModal style={p.confirmBox}>
            <Text accessibilityRole="header" style={s.label}>
              ¿Cerrar sesión en este teléfono?
            </Text>
            <Text style={s.hint}>
              Dejan de llegarte avisos aquí. Tus sesiones, grupos y chats siguen igual cuando
              vuelvas a entrar.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setSigningOut(false);
                void signOut();
              }}
              style={p.confirmYes}
            >
              <Text style={p.confirmYesText}>Cerrar sesión</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setSigningOut(false);
              }}
              style={p.confirmNo}
            >
              <Text style={p.confirmNoText}>Cancelar</Text>
            </Pressable>
          </View>
        )}

        {dataOpen && (
          <View style={s.section}>
            <Text style={s.hint}>{session.user.email}</Text>
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
                  Al borrar tu cuenta se borran tu perfil, tus sesiones, tu historial y tus avisos.
                  Las sesiones que organizas y todavía no pasan se cancelan, y a quienes iban les
                  llega un aviso. Tu lugar en sesiones de otras personas pasa a quien esté en lista
                  de espera. Si creaste un grupo, queda a cargo de otra persona del grupo. Tus
                  mensajes en los chats se quedan, pero sin tu nombre. Esto no se puede deshacer.
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
        )}
      </View>
    </ScrollView>
  );
}
