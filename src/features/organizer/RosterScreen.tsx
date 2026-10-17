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
 *
 * Asistencia v2 (0033): people now mark their own arrival with the session's
 * code, so this screen shows the code, refreshes itself while check-in is
 * open, says how each person was marked («con código» or «por ti»), and lets
 * the organizer undo either before closing.
 */

import { Link, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { checkedInBy, undoCheckIn } from '../../lib/checkIn';
import {
  cancelActivity,
  checkIn,
  closeActivity,
  fetchActivityDetail,
  fetchOrganizerRoster,
  formatSessionTime,
  type ActivityDetail,
  type RosterEntry,
} from '../../lib/activities';
import { supabase } from '../../lib/supabase';
import { color, hitSlopFor, size } from '../../theme';
import { useAuth } from '../auth/AuthProvider';
import { CodePanel } from '../checkin/CodePanel';
import { checkInStyles as cs } from '../checkin/styles';
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
type Filter = 'all' | 'arrived' | 'missing';

/** «05:52», in Costa Rica time, for the moment somebody was marked. */
function clock(iso: string): string {
  return new Intl.DateTimeFormat('es-CR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Costa_Rica',
  }).format(new Date(iso));
}

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
  const [cancelling, setCancelling] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

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

  // While people can still mark themselves, the list refreshes on its own,
  // every 10 seconds. Polling rather than a realtime channel: nothing else in
  // Movo holds a socket open, and ten seconds is fast enough to watch.
  const live =
    activity != null &&
    session != null &&
    activity.organizer_id === session.user.id &&
    (activity.status === 'published' || activity.status === 'full') &&
    Date.now() >= new Date(activity.starts_at).getTime() - 30 * 60_000 &&
    Date.now() <= new Date(activity.starts_at).getTime() + 3 * 60 * 60_000;
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      void load().catch(() => undefined);
    }, 10_000);
    return () => {
      clearInterval(timer);
    };
  }, [live, load]);

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
  const cancelled = activity.status === 'cancelled';
  const started = new Date(activity.starts_at).getTime() <= Date.now();
  // Mirrors check_in() and close_activity() since 0010: marking opens 30
  // minutes before the start, closing at the start. Attendance written days
  // ahead is not attendance.
  const checkInOpensAt = new Date(new Date(activity.starts_at).getTime() - 30 * 60_000);
  const checkInOpen = checkInOpensAt.getTime() <= Date.now();

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

  const undo = (userId: string) => {
    setPending(userId);
    setError(null);
    undoCheckIn(supabase, activity.id, userId)
      .then(() => load())
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo deshacer la llegada.');
      })
      .finally(() => {
        setPending(null);
      });
  };

  const shown = roster.filter((p) =>
    filter === 'arrived'
      ? p.status === 'attended'
      : filter === 'missing'
        ? p.status === 'joined'
        : true,
  );

  const close = () => {
    setConfirming(false);
    setError(null);
    closeActivity(supabase, activity.id)
      .then((noShows) => {
        setNotice(
          noShows === 0
            ? 'Sesión cerrada. Llegaron todas las personas que iban.'
            : // `no_show` is a column value, not a word anybody says. STATE_LABEL
              // already translates it; this was the one place the raw enum
              // reached a person, in the sentence confirming the only
              // irreversible action in the product.
              `Sesión cerrada. ${noShows} ${noShows === 1 ? 'persona quedó' : 'personas quedaron'} como ${STATE_LABEL.no_show?.toLowerCase() ?? 'no llegó'}.`,
        );
        return load();
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo cerrar la sesión.');
      });
  };

  const onRoster = expected + waiting + attended;

  const cancel = () => {
    setCancelBusy(true);
    setError(null);
    cancelActivity(supabase, activity.id, reason)
      .then((count) => {
        setCancelling(false);
        setReason('');
        // Honest about the channel: the inbox row exists, but nothing
        // delivers it to a phone yet.
        setNotice(
          count === 0
            ? 'Sesión cancelada. No iba nadie.'
            : `Sesión cancelada. ${count} ${count === 1 ? 'persona la va' : 'personas la van'} a ver cancelada en Mis sesiones, pero Movo todavía no manda avisos: escríbeles.`,
        );
        return load();
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo cancelar la sesión.');
      })
      .finally(() => {
        setCancelBusy(false);
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

      {cancelled && (
        <View style={s.cancelledBanner}>
          <Text style={s.cancelledTitle}>Cancelada</Text>
          <Text style={s.cancelledBody}>
            {activity.cancelled_by_staff
              ? 'La canceló el equipo de Movo por no cumplir las normas de la comunidad.'
              : activity.cancel_reason
                ? `«${activity.cancel_reason}»`
                : 'Sin motivo escrito.'}
          </Text>
          {/* The sentence cites the rules; the organizer should be one tap
              from reading which. */}
          {activity.cancelled_by_staff && (
            <Link href="/normas" style={s.back}>
              <Text style={s.linkText}>Leer las normas de la comunidad</Text>
            </Link>
          )}
        </View>
      )}

      {isOrganizer && !closed && !cancelled && !started && (
        <Link href={{ pathname: '/editar/[id]', params: { id: activity.id } }} style={s.back}>
          <Text style={s.linkText}>Editar sesión</Text>
        </Link>
      )}

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

      {isOrganizer && !closed && !cancelled && checkInOpen && roster.length > 0 && (
        <CodePanel activityId={activity.id} arrived={attended} total={attended + expected} />
      )}

      {roster.length > 0 && (
        <View accessibilityRole="radiogroup" accessibilityLabel="Mostrar" style={cs.filters}>
          {(
            [
              ['all', `Todas · ${roster.length}`],
              ['arrived', `Llegaron · ${attended}`],
              ['missing', `Faltan · ${expected}`],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              accessibilityRole="radio"
              aria-checked={filter === value}
              accessibilityLabel={label}
              hitSlop={CHECK_HIT_SLOP}
              key={value}
              onPress={() => {
                setFilter(value);
              }}
              style={[cs.filter, filter === value && cs.filterOn]}
            >
              <Text style={[cs.filterText, filter === value && cs.filterTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View>
        <Text style={s.sectionTitle}>Quién va</Text>
        {roster.length === 0 ? (
          <Text style={s.emptyBody}>Todavía no se unió nadie.</Text>
        ) : shown.length === 0 ? (
          <Text style={s.emptyBody}>
            {filter === 'arrived' ? 'Todavía no llegó nadie.' : 'No falta nadie.'}
          </Text>
        ) : (
          shown.map((person) => {
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
                  aria-hidden
                  style={s.rowState}
                >
                  {STATE_LABEL[person.status] ?? person.status}
                  {person.status === 'waitlisted' && person.waitlist_pos
                    ? ` · ${person.waitlist_pos}`
                    : ''}
                </Text>
                {done && person.checked_in_at && (
                  <Text style={cs.how}>
                    {clock(person.checked_in_at)} ·{' '}
                    {checkedInBy(person.user_id, person.checked_in_by) === 'self'
                      ? 'con código'
                      : 'por ti'}
                  </Text>
                )}
                {done && isOrganizer && !closed && !cancelled && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Deshacer la llegada de ${name}`}
                    accessibilityHint="Vuelve a dejarla sin marcar. Solo antes de cerrar."
                    disabled={pending === person.user_id}
                    hitSlop={CHECK_HIT_SLOP}
                    onPress={() => {
                      undo(person.user_id);
                    }}
                  >
                    <Text style={cs.undo}>{pending === person.user_id ? '…' : 'Deshacer'}</Text>
                  </Pressable>
                )}
                {isOrganizer && !closed && !cancelled && checkInOpen && (
                  <Pressable
                    /* A button, not a checkbox. It is `disabled` the moment it
                       is done, so there is no unchecked state to go back to,
                       and a checkbox that cannot be cleared announces itself
                       wrongly. The state lives in the label, which flips with
                       it — and on web that matters twice over, because a
                       role="checkbox" with no aria-checked reads as
                       *unchecked*, which is the opposite of the truth for
                       somebody already marked present. */
                    accessibilityRole="button"
                    accessibilityLabel={done ? `${name} ya llegó` : `Marcar llegada de ${name}`}
                    accessibilityHint={done ? undefined : 'Se puede deshacer antes de cerrar'}
                    aria-disabled={done || pending === person.user_id}
                    aria-busy={pending === person.user_id}
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

      {/* Says when the controls arrive, so an organizer opening the roster
          the night before does not read their absence as a broken screen. */}
      {isOrganizer && !closed && !cancelled && !started && roster.length > 0 && (
        <Text style={s.hint}>
          {checkInOpen
            ? 'Ya puedes marcar quién llegó. Cerrar la sesión se habilita a la hora de inicio.'
            : `Marcar llegadas se habilita 30 minutos antes de empezar: ${formatSessionTime(checkInOpensAt.toISOString())}.`}
        </Text>
      )}

      {isOrganizer && !closed && !cancelled && started && roster.length > 0 && (
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
            Marca primero a quien llegó. Cerrar es lo que guarda la asistencia.
          </Text>
        </>
      )}

      {/* Last on the screen and separate from close-out: the two are both
          irreversible and mean opposite things — one records who came, the
          other says nobody should. */}
      {isOrganizer && !closed && !cancelled && (
        <View style={s.cancelZone}>
          {cancelling ? (
            <View style={s.confirm}>
              <Text accessibilityRole="alert" style={s.confirmText}>
                {onRoster === 0
                  ? 'No va nadie. La sesión deja de aparecer en Descubrir.'
                  : `${onRoster} ${onRoster === 1 ? 'persona la va' : 'personas la van'} a ver cancelada en Mis sesiones. Movo todavía no manda avisos al teléfono: escríbeles tú.`}{' '}
                No se puede deshacer.
              </Text>
              <TextInput
                accessibilityLabel="Motivo, opcional"
                accessibilityHint="Lo ven todas las personas que van."
                maxLength={280}
                onChangeText={setReason}
                placeholder="Motivo (opcional): llueve, cancha cerrada…"
                placeholderTextColor={color.text.tertiary}
                style={s.input}
                value={reason}
              />
              <View style={s.confirmRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={cancelBusy ? 'Cancelando' : 'Cancelar la sesión'}
                  aria-disabled={cancelBusy}
                  disabled={cancelBusy}
                  onPress={cancel}
                  style={[s.close, { flex: 1 }]}
                >
                  <Text style={s.closeText}>
                    {cancelBusy ? 'Cancelando…' : 'Cancelar la sesión'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="No, mantenerla"
                  hitSlop={CHECK_HIT_SLOP}
                  onPress={() => {
                    setCancelling(false);
                  }}
                  style={[s.checkButton, { flex: 1 }]}
                >
                  <Text style={s.checkText}>No, mantenerla</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancelar esta sesión"
              accessibilityHint="Pide confirmación y un motivo opcional antes de cancelar."
              onPress={() => {
                setCancelling(true);
              }}
              style={s.back}
            >
              <Text style={s.cancelLinkText}>Cancelar esta sesión</Text>
            </Pressable>
          )}
        </View>
      )}
    </ScrollView>
  );
}
