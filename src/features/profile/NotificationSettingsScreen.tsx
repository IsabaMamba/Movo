/**
 * Perfil › Notificaciones (Avisos v3 · 6, 0049).
 *
 * Two things that are easy to confuse, kept apart: whether this phone gets
 * a push at all (the same PushSwitch as /avisos and /permisos), and which
 * notices Movo writes for you in the first place. A switch saves on tap —
 * there is no «Guardar» to forget — and goes back if the save fails.
 *
 * The «Siempre» rows are shown on purpose: knowing that a cancellation
 * always arrives is what makes switching the rest off feel safe.
 */

import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View } from 'react-native';

import {
  ALWAYS_ROWS,
  fetchNotificationPrefs,
  PREF_ROWS,
  saveNotificationPrefs,
  type NotificationPrefs,
  type PrefKey,
} from '../../lib/notificationPrefs';
import { supabase } from '../../lib/supabase';
import { color, hitSlopFor, size } from '../../theme';
import { useAuth } from '../auth/AuthProvider';
import { createStyles as c } from '../create/styles';
import { Icon } from '../nav/Icon';
import { PushSwitch } from '../notifications/PushSwitch';
import { blocksStyles as b, prefsStyles as s } from './styles';

export function NotificationSettingsScreen() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const userId = session?.user.id ?? null;
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    fetchNotificationPrefs(supabase, userId)
      .then(setPrefs)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar tus avisos.');
      });
  }, [userId]);

  if (loading) return <ActivityIndicator style={c.screen} />;
  if (!session || !userId) return <Redirect href="/sign-in" />;

  const flip = (key: PrefKey, value: boolean) => {
    if (!prefs) return;
    const before = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setError(null);
    saveNotificationPrefs(supabase, userId, next).catch(() => {
      setPrefs(before);
      setError('No se pudo guardar el cambio. Revisa tu conexión e intenta de nuevo.');
    });
  };

  return (
    <ScrollView contentContainerStyle={c.content} style={c.screen}>
      <View style={b.topBar}>
        <Pressable
          accessibilityLabel="Volver a Perfil"
          accessibilityRole="button"
          hitSlop={hitSlopFor(size.controlSm)}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/cuenta');
          }}
          style={b.topButton}
        >
          <Icon color={color.text.primary} name="back" size={22} />
        </Pressable>
        <Text accessibilityRole="header" style={b.title}>
          Notificaciones
        </Text>
      </View>

      <View style={c.section}>
        <Text style={s.overline}>EN ESTE TELÉFONO</Text>
        <PushSwitch />
      </View>

      <View style={c.section}>
        <Text style={s.overline}>QUÉ TE AVISAMOS</Text>
        {error !== null && (
          <View style={c.banner}>
            <Text accessibilityRole="alert" style={c.bannerText}>
              {error}
            </Text>
          </View>
        )}
        {prefs === null ? (
          error === null ? (
            <ActivityIndicator />
          ) : null
        ) : (
          <View style={s.group}>
            {PREF_ROWS.map((row) => (
              <View key={row.key} style={s.row}>
                <View style={s.rowText}>
                  <Text style={s.title}>{row.title}</Text>
                  <Text style={s.sub}>{row.sub}</Text>
                </View>
                <Switch
                  accessibilityLabel={row.title}
                  onValueChange={(value) => {
                    flip(row.key, value);
                  }}
                  thumbColor={prefs[row.key] ? color.accent.cool : color.text.tertiary}
                  trackColor={{ false: color.border.default, true: color.accent.deep }}
                  value={prefs[row.key]}
                />
              </View>
            ))}
            {ALWAYS_ROWS.map((row, i) => (
              <View key={row.title} style={[s.row, i === ALWAYS_ROWS.length - 1 && s.rowLast]}>
                <View style={s.rowText}>
                  <Text style={s.title}>{row.title}</Text>
                  <Text style={s.sub}>{row.sub}</Text>
                </View>
                <Text style={s.always}>Siempre</Text>
              </View>
            ))}
          </View>
        )}
        <Text style={c.hint}>
          Los que dicen «Siempre» no se apagan: sin ellos llegarías a una sesión cancelada o no
          sabrías qué cambió en el lugar. Siguen llegando solo a Avisos si apagas el teléfono.
        </Text>
      </View>
    </ScrollView>
  );
}
