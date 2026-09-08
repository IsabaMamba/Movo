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
import { hitSlopFor, size } from '../../theme';
import { useAuth } from '../auth/AuthProvider';
import { organizerStyles as s } from './styles';

const STATE_LABEL: Record<string, string> = {
  joined: 'Va',
  waitlisted: 'En espera',
  attended: 'Llegó',
  no_show: 'No llegó',
};

/** `checkButton` renders at `size.controlSm`; the target is padded back up to 44. */
const CHECK_HIT_SLOP = hitSlopFor(size.controlSm);

/**
 * What closing does, in words. The button says "cerrar", which sounds like
 * leaving the screen — the consequence is that everyone still unmarked becomes
 * a permanent no-show, so it is the hint on every control that can trigger it.
 */
const CLOSE_HINT =
  'Marca como no llegó a quien quede sin marcar y cancela a quien esté en espera. No se puede deshacer.';

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

      {/* A count is a number and its noun; read as two stops they arrive as
          "12" and, later, "llegaron" — which is not a count. */}
      <View style={s.counts}>
        <View accessible accessibilityLabel={`${attended} llegaron`} style={s.count}>
          <Text style={s.countValue}>{attended}</Text>
          <Text style={s.countLabel}>llegaron</Text>
        </View>
        <View accessible accessibilityLabel={`${expected} sin marcar`} style={s.count}>
          <Text style={s.countValue}>{expected}</Text>
          <Text style={s.countLabel}>sin marcar</Text>
        </View>
        <View accessible accessibilityLabel={`${waiting} en espera`} style={s.count}>
          <Text style={s.countValue}>{waiting}</Text>
          <Text style={s.countLabel}>en espera</Text>
        </View>
        {absent > 0 && (
          <View accessible accessibilityLabel={`${absent} no llegaron`} style={s.count}>
            <Text style={s.countValue}>{absent}</Text>
            <Text style={s.countLabel}>no llegaron</Text>
          </View>
        )}
      </View>

      {notice && (
        <View style={s.banner}>
          {/* Close-out reports how many people it turned into no-shows, and the
              button that caused it is gone by the time this renders. */}
          <Text accessibilityRole="alert" style={s.bannerText}>
            {notice}
          </Text>
        </View>
      )}
      {error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}

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
            const name = person.profile.display_name;
            const state = STATE_LABEL[person.status] ?? person.status;
            const position =
              person.status === 'waitlisted' && person.waitlist_pos
                ? `, puesto ${person.waitlist_pos} en la lista de espera`
                : '';
            return (
              <View key={person.user_id} style={s.row}>
                {/* Name and state are one fact about one person. They are folded
                    into this label rather than into the row, because grouping
                    the row would take the check-in control out of the tab
                    order — and that control is the work this screen exists for. */}
                <Text accessibilityLabel={`${name}. ${state}${position}`} style={s.rowName}>
                  {name}
                </Text>
                <Text
                  /* Said aloud by the name above; here it is a second reading of
                     the same field. */
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={s.rowState}
                >
                  {STATE_LABEL[person.status] ?? person.status}
                  {person.status === 'waitlisted' && person.waitlist_pos
                    ? ` · ${person.waitlist_pos}`
                    : ''}
                </Text>
                {isOrganizer && !closed && (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel={done ? `${name} ya llegó` : `Marcar llegada de ${name}`}
                    /* Check-in is what writes attendance, and this screen offers
                       no way back once it is written. */
                    accessibilityHint={
                      done ? undefined : 'No se puede deshacer desde esta pantalla'
                    }
                    accessibilityState={{
                      checked: done,
                      disabled: done || pending === person.user_id,
                      busy: pending === person.user_id,
                    }}
                    disabled={done || pending === person.user_id}
                    hitSlop={CHECK_HIT_SLOP}
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
              {/* The consequence arrives as a count that did not exist a moment
                  ago, so it has to be announced, not only rendered. */}
              <Text accessibilityRole="alert" style={s.confirmText}>
                Al cerrar, {expected === 0 ? 'nadie' : expected}{' '}
                {expected === 1 ? 'persona sin marcar queda' : 'personas sin marcar quedan'} como no
                llegó, y quien esté en espera pasa a cancelado. No se puede deshacer.
              </Text>
              <View style={s.confirmRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar de todas formas"
                  accessibilityHint={CLOSE_HINT}
                  onPress={close}
                  style={[s.close, { flex: 1 }]}
                >
                  <Text style={s.closeText}>Cerrar de todas formas</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Volver"
                  /* "Volver" reads as navigation; here it abandons the close. */
                  accessibilityHint="Cancela el cierre y vuelve a la lista"
                  hitSlop={CHECK_HIT_SLOP}
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
              accessibilityRole="button"
              accessibilityLabel="Cerrar sesión y registrar asistencia"
              accessibilityHint={`Pide confirmación antes de cerrar. ${CLOSE_HINT}`}
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
