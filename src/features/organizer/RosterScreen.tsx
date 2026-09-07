/**
 * Roster and check-in.
 *
 * The only screen in the product that creates data rather than reading it.
 * Attendance percentages, organizer reputation and every AI proposal
 * downstream read a number that nothing writes until somebody stands at a
 * portón and taps names here.
 *
 * Close-out is deliberately separate from check-in: closing turns everyone
 * still marked `joined` into `no_show` permanently, so it is a decision, not
 * a side effect of leaving the screen.
 */

import { Link, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import {
  checkIn,
  closeActivity,
  fetchActivityDetail,
  fetchOrganizerRoster,
  formatSessionTime,
  type ActivityDetail,
  type RosterEntry,
} from '../../lib/activities';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { organizerStyles as s } from './styles';

const STATE_LABEL: Record<string, string> = {
  joined: 'Va',
  waitlisted: 'En espera',
  attended: 'Llegó',
  no_show: 'No llegó',
};

export function RosterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();

  const [activity, setActivity] = useState<ActivityDetail | null | undefined>(undefined);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [detail, people] = await Promise.all([
      fetchActivityDetail(supabase, id),
      fetchOrganizerRoster(supabase, id).catch((): RosterEntry[] => []),
    ]);
    setActivity(detail);
    setRoster(people);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    load().catch((cause: unknown) => {
      if (cancelled) return;
      setActivity(null);
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar la sesión.');
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (activity === undefined) return <ActivityIndicator style={s.screen} />;

  if (activity === null || !session) {
    return (
      <ScrollView contentContainerStyle={s.content} style={s.screen}>
        <Text style={s.sectionTitle}>No encontramos esta sesión</Text>
        <Text style={s.emptyBody}>{error ?? 'Puede que ya no exista.'}</Text>
        <Link href="/organizar" style={s.back}>
          <Text style={s.linkText}>Volver a Organizar</Text>
        </Link>
      </ScrollView>
    );
  }

  // The RPCs enforce this too — this only avoids showing controls that would
  // fail with 42501 the moment they were used.
  const isOrganizer = activity.organizer_id === session.user.id;
  const closed = activity.status === 'completed';

  const attended = roster.filter((p) => p.status === 'attended').length;
  const expected = roster.filter((p) => p.status === 'joined').length;
  const waiting = roster.filter((p) => p.status === 'waitlisted').length;
  const absent = roster.filter((p) => p.status === 'no_show').length;

  const mark = (userId: string) => {
    setPending(userId);
    setError(null);
    checkIn(supabase, activity.id, userId)
      .then(() => load())
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo marcar la llegada.');
      })
      .finally(() => {
        setPending(null);
      });
  };

  const close = () => {
    setConfirming(false);
    setError(null);
    closeActivity(supabase, activity.id)
      .then((noShows) => {
        setNotice(
          noShows === 0
            ? 'Sesión cerrada. Todos los que se apuntaron llegaron.'
            : `Sesión cerrada. ${noShows} ${noShows === 1 ? 'persona quedó' : 'personas quedaron'} como no_show.`,
        );
        return load();
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo cerrar la sesión.');
      });
  };

  return (
    <ScrollView contentContainerStyle={s.content} style={s.screen}>
      <Link href="/organizar" style={s.back}>
        <Text style={s.backText}>← Organizar</Text>
      </Link>

      <View>
        <Text style={s.title}>{activity.title}</Text>
        <Text style={s.subtitle}>
          {formatSessionTime(activity.starts_at)} · {activity.location.name}
        </Text>
      </View>

      <View style={s.counts}>
        <View style={s.count}>
          <Text style={s.countValue}>{attended}</Text>
          <Text style={s.countLabel}>llegaron</Text>
        </View>
        <View style={s.count}>
          <Text style={s.countValue}>{expected}</Text>
          <Text style={s.countLabel}>sin marcar</Text>
        </View>
        <View style={s.count}>
          <Text style={s.countValue}>{waiting}</Text>
          <Text style={s.countLabel}>en espera</Text>
        </View>
        {absent > 0 && (
          <View style={s.count}>
            <Text style={s.countValue}>{absent}</Text>
            <Text style={s.countLabel}>no llegaron</Text>
          </View>
        )}
      </View>

      {notice && (
        <View style={s.banner}>
          <Text style={s.bannerText}>{notice}</Text>
        </View>
      )}
      {error && <Text style={s.error}>{error}</Text>}

      {!isOrganizer && (
        <Text style={s.hint}>Solo quien organiza puede marcar llegadas o cerrar la sesión.</Text>
      )}

      <View>
        <Text style={s.sectionTitle}>Quién va</Text>
        {roster.length === 0 ? (
          <Text style={s.emptyBody}>Todavía no se apuntó nadie.</Text>
        ) : (
          roster.map((person) => {
            const done = person.status === 'attended';
            return (
              <View key={person.user_id} style={s.row}>
                <Text style={s.rowName}>{person.profile.display_name}</Text>
                <Text style={s.rowState}>
                  {STATE_LABEL[person.status] ?? person.status}
                  {person.status === 'waitlisted' && person.waitlist_pos
                    ? ` · ${person.waitlist_pos}`
                    : ''}
                </Text>
                {isOrganizer && !closed && (
                  <Pressable
                    disabled={done || pending === person.user_id}
                    onPress={() => {
                      mark(person.user_id);
                    }}
                    style={[s.checkButton, done && s.checkButtonDone]}
                  >
                    <Text style={[s.checkText, done && s.checkTextDone]}>
                      {done ? 'Llegó' : pending === person.user_id ? '…' : 'Marcar'}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })
        )}
      </View>

      {isOrganizer && !closed && roster.length > 0 && (
        <>
          {confirming ? (
            <View style={s.confirm}>
              <Text style={s.confirmText}>
                Al cerrar, {expected === 0 ? 'nadie' : expected}{' '}
                {expected === 1 ? 'persona sin marcar queda' : 'personas sin marcar quedan'} como no
                llegó, y quien esté en espera pasa a cancelado. No se puede deshacer.
              </Text>
              <View style={s.confirmRow}>
                <Pressable onPress={close} style={[s.close, { flex: 1 }]}>
                  <Text style={s.closeText}>Cerrar de todas formas</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setConfirming(false);
                  }}
                  style={[s.checkButton, { flex: 1 }]}
                >
                  <Text style={s.checkText}>Volver</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                setConfirming(true);
              }}
              style={s.close}
            >
              <Text style={s.closeText}>Cerrar sesión y registrar asistencia</Text>
            </Pressable>
          )}
          <Text style={s.hint}>
            Marcá primero a quien llegó. Cerrar es lo que guarda la asistencia.
          </Text>
        </>
      )}
    </ScrollView>
  );
}
