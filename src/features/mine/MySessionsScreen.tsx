/**
 * Mis sesiones — the way back to something you joined.
 *
 * Descubrir lists what is nearby and still ahead, so a session left reach the
 * moment it started: the one you were on your way to was already gone from
 * the only screen that had ever shown it. Organizar solved that for the
 * person who created the session. This is the same need for everybody else,
 * who are going to be most of the people using Movo.
 *
 * The screen answers three questions in order, which is why it is split the
 * way it is: what is next, where do I stand in a waitlist, and did the
 * organizer ever record that I showed up.
 */

import { Link, Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

import {
  fetchMyParticipations,
  formatSessionTime,
  type MyParticipation,
} from '../../lib/activities';
import { supabase } from '../../lib/supabase';
import { priceLabel } from '../../theme';
import { useAuth } from '../auth/AuthProvider';
import { mineStyles as s } from './styles';

interface Standing {
  label: string;
  chip: StyleProp<ViewStyle>;
  text: StyleProp<TextStyle>;
  /** Said out loud only when the state is not self-evident from the word. */
  note: string | null;
}

function standingOf(entry: MyParticipation, past: boolean): Standing {
  if (entry.status === 'waitlisted') {
    return {
      label: entry.waitlist_pos === null ? 'En espera' : `En espera · puesto ${entry.waitlist_pos}`,
      chip: s.badgeWait,
      text: s.badgeWaitText,
      // The position exists nowhere else in the product, and "en espera" on
      // its own reads as a refusal rather than as a queue that moves.
      note: past
        ? 'No se liberó un campo a tiempo.'
        : 'Si alguien cancela, entrás automáticamente.',
    };
  }

  if (entry.status === 'attended') {
    return { label: 'Llegaste', chip: s.badgeDone, text: s.badgeDoneText, note: null };
  }

  if (entry.status === 'no_show') {
    return {
      label: 'Marcada como ausente',
      chip: s.badgeMiss,
      text: s.badgeMissText,
      // Somebody else wrote this about you. Saying who, and that it can be
      // disputed, is the difference between a record and an accusation.
      note: 'Lo marcó quien organiza al cerrar la sesión. Si no es así, escribile.',
    };
  }

  if (past) {
    return {
      label: 'Sin cerrar',
      chip: s.badgeOpen,
      text: s.badgeOpenText,
      // Not the participant's problem to solve, but their record is stuck
      // until somebody else acts, and that should not look like their fault.
      note: 'Ya pasó y quien organiza todavía no registró la asistencia.',
    };
  }

  return { label: 'Vas', chip: s.badgeGoing, text: s.badgeGoingText, note: null };
}

export function MySessionsScreen() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const [entries, setEntries] = useState<MyParticipation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    fetchMyParticipations(supabase, userId)
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setEntries([]);
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar tus sesiones.');
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return <ActivityIndicator style={s.screen} />;
  if (!session) return <Redirect href="/sign-in" />;

  const now = Date.now();
  const rows = entries ?? [];
  const upcoming = rows.filter((e) => new Date(e.activity.starts_at).getTime() > now);
  // Reversed: the most recent thing you did is the one you might still need
  // to sort out, and the run from three months ago is not.
  const past = rows
    .filter((e) => new Date(e.activity.starts_at).getTime() <= now)
    .slice()
    .reverse();

  const card = (entry: MyParticipation, isPast: boolean) => {
    const { activity } = entry;
    const standing = standingOf(entry, isPast);

    return (
      <Pressable
        /* The card is one decision — is this still mine to show up to — and
           the state, the time and the venue only mean that together. */
        accessible
        accessibilityRole="button"
        accessibilityLabel={[
          activity.title,
          standing.label,
          formatSessionTime(activity.starts_at),
          activity.location.name,
          `organiza ${activity.organizer.display_name}`,
        ].join('. ')}
        accessibilityHint="Abre la sesión, con el punto de encuentro y la opción de salirte."
        key={`${entry.activity_id}-${entry.user_id}`}
        onPress={() => {
          router.push({ pathname: '/sesion/[id]', params: { id: activity.id } });
        }}
        style={s.card}
      >
        <View style={[s.badge, standing.chip]}>
          <Text style={[s.badgeText, standing.text]}>{standing.label}</Text>
        </View>

        <Text style={s.cardTitle}>{activity.title}</Text>
        <Text style={s.cardMeta}>
          {formatSessionTime(activity.starts_at)} · {activity.location.name}
          {activity.location.district ? `, ${activity.location.district}` : ''}
        </Text>
        <Text style={s.cardMeta}>
          Organiza {activity.organizer.display_name} ·{' '}
          {priceLabel(activity.price_minor, activity.currency)}
        </Text>

        {standing.note !== null && <Text style={s.cardNote}>{standing.note}</Text>}
      </Pressable>
    );
  };

  return (
    <ScrollView contentContainerStyle={s.content} style={s.screen}>
      <Link href="/" style={s.back}>
        <Text style={s.backText}>← Descubrir</Text>
      </Link>

      <View>
        <Text style={s.title}>Mis sesiones</Text>
        <Text style={s.subtitle}>A lo que te apuntaste, antes y después de que pase.</Text>
      </View>

      {error !== null && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}

      {entries === null ? (
        <ActivityIndicator />
      ) : rows.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.sectionTitle}>Todavía no te apuntaste a nada</Text>
          <Text style={s.emptyBody}>
            Cuando digas que vas a una sesión, acá la vas a volver a encontrar — incluso después de
            que empiece.
          </Text>
          <Link href="/" style={s.back}>
            <Text style={s.linkText}>Ver qué hay cerca</Text>
          </Link>
        </View>
      ) : (
        <>
          {upcoming.length > 0 && (
            <View style={s.group}>
              <Text style={s.sectionTitle}>Lo que viene</Text>
              {upcoming.map((entry) => card(entry, false))}
            </View>
          )}

          {/* Above the history, not below it: read after the past list, "lo de
              abajo ya pasó" points at nothing. */}
          {upcoming.length === 0 && (
            <View style={s.empty}>
              <Text style={s.emptyBody}>No tenés nada por delante. Lo de abajo ya pasó.</Text>
              <Link href="/" style={s.back}>
                <Text style={s.linkText}>Ver qué hay cerca</Text>
              </Link>
            </View>
          )}

          {past.length > 0 && (
            <View style={s.group}>
              <Text style={s.sectionTitle}>Ya pasaron</Text>
              {past.map((entry) => card(entry, true))}
            </View>
          )}
        </>
      )}

      {/*
        A session you left is not here, on purpose: leaving is a decision
        already taken, and the row would only be clutter. Being marked absent
        stays, because somebody else wrote that about you.
      */}
    </ScrollView>
  );
}
