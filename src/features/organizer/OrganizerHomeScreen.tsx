/**
 * The organizer's own sessions.
 *
 * Everything else in the app reads data. This branch is the only place that
 * writes attendance, which is the number an organizer eventually shows a
 * sponsor — so the list is ordered by what still needs doing rather than by
 * what looks tidy.
 */

import { Link, Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

import {
  fetchOrganizedActivities,
  formatSessionTime,
  type OrganizedActivity,
} from '../../lib/activities';
import { supabase } from '../../lib/supabase';
import { occupancyLabel } from '../../theme';
import { useAuth } from '../auth/AuthProvider';
import { organizerStyles as s } from './styles';

function stateOf(activity: OrganizedActivity): {
  label: string;
  chip: StyleProp<ViewStyle>;
  text: StyleProp<TextStyle>;
} {
  if (activity.status === 'completed') {
    return { label: 'Cerrada', chip: s.badgeDone, text: s.badgeDoneText };
  }
  if (activity.status === 'draft') {
    return { label: 'Borrador', chip: s.badgeDraft, text: s.badgeDraftText };
  }
  if (activity.status === 'cancelled') {
    return { label: 'Cancelada', chip: s.badgeDraft, text: s.badgeDraftText };
  }
  return { label: 'Publicada', chip: s.badgeLive, text: s.badgeLiveText };
}

export function OrganizerHomeScreen() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const [activities, setActivities] = useState<OrganizedActivity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchOrganizedActivities(supabase, userId)
      .then((rows) => {
        if (!cancelled) setActivities(rows);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setActivities([]);
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar tus sesiones.');
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return <ActivityIndicator style={s.screen} />;
  if (!session) return <Redirect href="/sign-in" />;

  const now = Date.now();
  // A session that has already started and is not closed is the one thing
  // that needs the organizer today — that is where check-in happens.
  const needsCloseOut = (activities ?? []).filter(
    (a) => a.status !== 'completed' && new Date(a.starts_at).getTime() <= now,
  );
  const upcoming = (activities ?? []).filter(
    (a) => a.status !== 'completed' && new Date(a.starts_at).getTime() > now,
  );
  const done = (activities ?? []).filter((a) => a.status === 'completed');

  const card = (activity: OrganizedActivity) => {
    const state = stateOf(activity);
    return (
      <Pressable
        key={activity.id}
        onPress={() => {
          router.push({ pathname: '/organizar/[id]', params: { id: activity.id } });
        }}
        style={s.card}
      >
        <View style={[s.badge, state.chip]}>
          <Text style={[s.badgeText, state.text]}>{state.label}</Text>
        </View>
        <Text style={s.cardTitle}>{activity.title}</Text>
        <Text style={s.cardMeta}>
          {formatSessionTime(activity.starts_at)} · {activity.location.name}
        </Text>
        <Text style={s.cardMeta}>
          {occupancyLabel(activity.joined_count, activity.max_participants)}
          {activity.waitlist_count > 0 ? ` · ${activity.waitlist_count} en espera` : ''}
        </Text>
      </Pressable>
    );
  };

  return (
    <ScrollView contentContainerStyle={s.content} style={s.screen}>
      <Link href="/" style={s.back}>
        <Text style={s.backText}>← Descubrir</Text>
      </Link>

      <View>
        <Text style={s.title}>Organizar</Text>
        <Text style={s.subtitle}>Tus sesiones, la lista de quién va y el check-in.</Text>
      </View>

      {error && <Text style={s.error}>{error}</Text>}

      {activities === null ? (
        <ActivityIndicator />
      ) : activities.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.sectionTitle}>Todavía no organizás nada</Text>
          <Text style={s.emptyBody}>
            Creá una sesión y acá vas a ver quién se apunta y quién llegó.
          </Text>
          <Link href="/crear" style={s.back}>
            <Text style={s.linkText}>Crear sesión</Text>
          </Link>
        </View>
      ) : (
        <>
          {needsCloseOut.length > 0 && (
            <View style={{ gap: 12 }}>
              <Text style={s.sectionTitle}>Pendientes de cerrar</Text>
              <Text style={s.hint}>
                Ya empezaron. Marcá quién llegó y cerrá la sesión — es lo que convierte una lista en
                asistencia.
              </Text>
              {needsCloseOut.map(card)}
            </View>
          )}

          {upcoming.length > 0 && (
            <View style={{ gap: 12 }}>
              <Text style={s.sectionTitle}>Próximas</Text>
              {upcoming.map(card)}
            </View>
          )}

          {done.length > 0 && (
            <View style={{ gap: 12 }}>
              <Text style={s.sectionTitle}>Cerradas</Text>
              {done.map(card)}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}
