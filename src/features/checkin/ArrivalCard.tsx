/**
 * «Tu próxima» (2 November walkthrough, steps 6 and 19; Mis sesiones v4,
 * Asistencia v2).
 *
 * The next session, always first: when, what, where, who is going, and the
 * two things you need — how to get there and the details. From 15 minutes
 * before the start to 45 after, «Llegué» takes the top, and the code is
 * typed on the board's drawn keypad (self_check_in(), 0033).
 *
 * «Invitar a alguien» shares a sentence, not a link: Movo has no domain yet,
 * so the invite page in the walkthrough (step 10) cannot exist. «No puedo ir»
 * leaves the session, after saying so.
 */

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Share, Text, View } from 'react-native';

import { fetchRoster, leaveActivity, type MyParticipation } from '../../lib/activities';
import { directionsUrl, eyebrowDay, inviteText, startsIn } from '../../lib/agenda';
import {
  checkInWindow,
  CLOSES_MINUTES_AFTER,
  OPENS_MINUTES_BEFORE,
  outcomeText,
  selfCheckIn,
} from '../../lib/checkIn';
import {
  isDecision,
  loadPending,
  queueCheckIn,
  syncPendingCheckIns,
} from '../../lib/pendingCheckIns';
import { initials } from '../../lib/profile';
import { fetchSessionLink, sessionLinkUrl, siteOrigin } from '../../lib/sessionLinks';
import { supabase } from '../../lib/supabase';
import { pointOf } from '../../lib/venues';
import { color, priceLabel } from '../../theme';
import { Icon } from '../nav/Icon';
import { CodeKeypad } from './CodeKeypad';
import { checkInStyles as s } from './styles';

interface Props {
  entry: MyParticipation;
  /** Sport name for «Running · Principiante · Gratis». */
  sport?: string;
  onChanged: () => void;
}

/** «06:58», Costa Rica time. */
function clockOf(iso: string): string {
  return new Intl.DateTimeFormat('es-CR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'America/Costa_Rica',
  }).format(new Date(iso));
}

const AVATAR_TINTS = ['#FFC56B', '#FF9F45', '#F3E6D2', '#F0644F'];
const SKILL: Record<string, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
};

export function ArrivalCard({ entry, sport, onChanged }: Props) {
  const router = useRouter();
  const { activity } = entry;
  const [now, setNow] = useState(() => new Date());
  const [typing, setTyping] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [people, setPeople] = useState<string[]>([]);
  // 0055: fetched ahead, because a browser only lets a tap open the share
  // sheet, not a tap followed by a network round trip.
  const [link, setLink] = useState<string | null>(null);
  /** 0042: a «Llegué» kept on the phone because there was no signal. */
  const [queuedAt, setQueuedAt] = useState<string | null>(null);

  // The window opens while the screen is open; re-read the clock.
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 30_000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  // A tap kept without signal: show it, and send it whenever we can. The
  // server judges it by the time of the tap, not the time it arrives.
  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      void loadPending()
        .then((queue) => {
          if (cancelled) return;
          setQueuedAt(queue.find((q) => q.activityId === activity.id)?.tappedAt ?? null);
          if (queue.length === 0) return;
          return syncPendingCheckIns(supabase).then((results) => {
            if (cancelled) return;
            const mine = results.find((r) => r.activityId === activity.id);
            if (!mine) return;
            setQueuedAt(null);
            if ('refused' in mine) {
              setMessage({ text: mine.refused, ok: false });
            } else {
              setMessage({
                text:
                  mine.outcome === 'checked_in' || mine.outcome === 'already'
                    ? 'Llegó tu «Llegué» de cuando no había señal. Quien organiza lo confirma.'
                    : outcomeText(mine.outcome),
                ok: mine.outcome === 'checked_in' || mine.outcome === 'already',
              });
              if (mine.outcome === 'checked_in' || mine.outcome === 'already') onChanged();
            }
          });
        })
        .catch(() => undefined);
    };
    sync();
    const online = globalThis as {
      addEventListener?: (e: string, f: () => void) => void;
      removeEventListener?: (e: string, f: () => void) => void;
    };
    online.addEventListener?.('online', sync);
    return () => {
      cancelled = true;
      online.removeEventListener?.('online', sync);
    };
  }, [activity.id, onChanged]);

  // Who is going: initials only, the way the board draws them. The roster is
  // readable by whoever is on it (activities_read / roster policy).
  useEffect(() => {
    let cancelled = false;
    fetchRoster(supabase, activity.id)
      .then((rows) => {
        if (cancelled) return;
        setPeople(
          rows
            .filter((r) => r.status === 'joined' || r.status === 'attended')
            .map((r) => r.profile.display_name),
        );
      })
      .catch(() => {
        if (!cancelled) setPeople([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activity.id]);

  const phase = checkInWindow(activity.starts_at, now);
  const attended = entry.status === 'attended';
  const waiting = entry.status === 'waitlisted';
  const badge = startsIn(activity.starts_at, now);
  const point = pointOf(activity.location.geog);
  const showArrive = !attended && !waiting && phase === 'open';

  const send = (value: string) => {
    if (busy || value.length !== 4) return;
    setBusy(true);
    setMessage(null);
    selfCheckIn(supabase, activity.id, value)
      .then((outcome) => {
        setMessage({
          text: outcomeText(outcome),
          ok: outcome === 'checked_in' || outcome === 'already',
        });
        if (outcome === 'checked_in' || outcome === 'already') {
          setTyping(false);
          onChanged();
        } else {
          setCode('');
        }
      })
      .catch((cause: unknown) => {
        setCode('');
        // No signal (anything that is not the server deciding): keep the tap
        // with its time and send it later, instead of losing the arrival.
        if (!isDecision(cause)) {
          const tappedAt = new Date().toISOString();
          void queueCheckIn({ activityId: activity.id, code: value, tappedAt })
            .then(() => {
              setQueuedAt(tappedAt);
              setTyping(false);
              setMessage({
                text: 'No hay señal. Guardamos tu llegada con la hora de ahora y la enviamos cuando vuelva.',
                ok: true,
              });
            })
            .catch(() => {
              setMessage({
                text: 'No hay señal. Vuelve a marcar cuando tengas conexión.',
                ok: false,
              });
            });
          return;
        }
        setMessage({
          text: cause instanceof Error ? cause.message : 'No se pudo marcar tu llegada.',
          ok: false,
        });
      })
      .finally(() => {
        setBusy(false);
      });
  };

  useEffect(() => {
    let cancelled = false;
    fetchSessionLink(supabase, activity.id)
      .then((code) => {
        if (!cancelled) setLink(sessionLinkUrl(code, siteOrigin()));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activity.id]);

  const invite = () => {
    const text = inviteText(activity.title, activity.starts_at, now, link);
    if (Platform.OS === 'web') {
      const nav = globalThis.navigator as Navigator | undefined;
      if (nav?.share) {
        void nav.share({ text }).catch(() => undefined);
        return;
      }
      void nav?.clipboard
        ?.writeText(text)
        .then(() => {
          setMessage({ text: 'Copiamos la invitación. Pégala donde quieras.', ok: true });
        })
        .catch(() => undefined);
      return;
    }
    void Share.share({ message: text });
  };

  const leave = () => {
    setBusy(true);
    leaveActivity(supabase, activity.id)
      .then(() => {
        onChanged();
      })
      .catch((cause: unknown) => {
        setMessage({
          text: cause instanceof Error ? cause.message : 'No se pudo salir de la sesión.',
          ok: false,
        });
      })
      .finally(() => {
        setBusy(false);
        setLeaving(false);
      });
  };

  const facts = [
    sport,
    activity.skill && activity.skill !== 'any' ? SKILL[activity.skill] : null,
    priceLabel(activity.price_minor, activity.currency),
  ].filter(Boolean);
  const shown = people.slice(0, 4);
  const more = people.length - shown.length;

  return (
    <View style={s.next}>
      <View style={s.nextTop}>
        <Text style={s.eyebrow}>TU PRÓXIMA · {eyebrowDay(activity.starts_at, now)}</Text>
        {badge && !attended ? (
          <View style={s.startsBadge}>
            <Text style={s.startsBadgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="link"
        accessibilityHint="Abre la sesión"
        onPress={() => {
          router.push({ pathname: '/sesion/[id]', params: { id: activity.id } });
        }}
        style={s.nextHead}
      >
        <Text style={s.time}>
          {new Intl.DateTimeFormat('es-CR', {
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
            timeZone: 'America/Costa_Rica',
          }).format(new Date(activity.starts_at))}
        </Text>
        <Text numberOfLines={2} style={s.title}>
          {activity.title}
        </Text>
      </Pressable>

      <View style={s.whereRow}>
        <Icon color={color.text.secondary} name="pin" size={16} />
        <Text numberOfLines={1} style={s.meta}>
          {activity.location.name}
          {activity.meeting_point ? ` · ${activity.meeting_point}` : ''}
        </Text>
      </View>
      {facts.length > 0 && <Text style={s.facts}>{facts.join(' · ')}</Text>}

      {people.length > 0 && (
        <View style={s.peopleRow}>
          <View accessible accessibilityLabel={`Van ${people.join(', ')}`} style={s.avatars}>
            {shown.map((name, i) => (
              <View
                key={`${name}-${i}`}
                style={[
                  s.avatar,
                  {
                    backgroundColor: AVATAR_TINTS[i % AVATAR_TINTS.length],
                    marginLeft: i === 0 ? 0 : -8,
                  },
                ]}
              >
                <Text style={s.avatarText}>{initials(name)}</Text>
              </View>
            ))}
            {more > 0 && <Text style={s.more}>+{more}</Text>}
          </View>
          <Text style={s.going}>
            <Text style={s.goingStrong}>{activity.joined_count}</Text>
            {activity.max_participants ? ` de ${activity.max_participants} van` : ' van'}
          </Text>
        </View>
      )}

      {attended ? (
        <Text accessibilityRole="alert" style={s.ok}>
          ✓ Tu llegada quedó marcada.
        </Text>
      ) : queuedAt ? (
        <Text accessibilityRole="alert" style={s.note}>
          Tu llegada quedó guardada a las {clockOf(queuedAt)}, sin señal. La enviamos cuando vuelva.
        </Text>
      ) : showArrive && !typing ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Llegué"
          accessibilityHint="Pide el código de hoy para marcar tu llegada"
          onPress={() => {
            setMessage(null);
            setTyping(true);
          }}
          style={s.arrive}
        >
          <Icon color={color.text.inverse} name="hand" size={20} />
          <Text style={s.arriveText}>Llegué</Text>
        </Pressable>
      ) : null}

      {showArrive && !typing && !queuedAt && (
        <Text style={s.note}>
          Disponible desde {OPENS_MINUTES_BEFORE} minutos antes hasta {CLOSES_MINUTES_AFTER} minutos
          después del inicio.
        </Text>
      )}

      {typing ? (
        <View style={s.keypadSheet}>
          <Text style={s.sheetTitle}>Escribe el código de hoy</Text>
          <Text style={s.note}>Lo tiene quien organiza. Pídeselo o míralo en su teléfono.</Text>
          <CodeKeypad
            disabled={busy}
            onChange={(next) => {
              setCode(next);
              if (next.length === 4) send(next);
            }}
            value={code}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setTyping(false);
              setCode('');
            }}
            style={s.secondary}
          >
            <Text style={s.secondaryText}>{busy ? 'Revisando…' : 'Cancelar'}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={s.row}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Cómo llegar"
            accessibilityHint="Abre tu app de mapas con el lugar"
            disabled={point === null}
            onPress={() => {
              if (point) void Linking.openURL(directionsUrl(point.lat, point.lng));
            }}
            style={[showArrive ? s.secondary : s.primary, point === null && s.disabled]}
          >
            <Icon
              color={showArrive ? color.text.primary : color.text.inverse}
              name="route"
              size={18}
            />
            <Text style={showArrive ? s.secondaryText : s.primaryText}>Cómo llegar</Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Ver detalles"
            onPress={() => {
              router.push({ pathname: '/sesion/[id]', params: { id: activity.id } });
            }}
            style={s.secondary}
          >
            <Text style={s.secondaryText}>Ver detalles</Text>
          </Pressable>
        </View>
      )}

      {message !== null && (
        <Text accessibilityRole="alert" style={message.ok ? s.ok : s.bad}>
          {message.text}
        </Text>
      )}

      {!typing && !attended && (
        <View style={s.footer}>
          <Pressable accessibilityRole="button" onPress={invite} style={s.footerLink}>
            <Icon color={color.accent.cool} name="share" size={16} />
            <Text style={s.inviteText}>Invitar a alguien</Text>
          </Pressable>
          {leaving ? (
            <View style={s.footerConfirm}>
              <Pressable accessibilityRole="button" disabled={busy} onPress={leave}>
                <Text style={s.leaveYes}>{busy ? '…' : 'Sí, no voy'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setLeaving(false);
                }}
              >
                <Text style={s.leaveText}>Volver</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Te pregunta antes de sacarte de la sesión"
              onPress={() => {
                setLeaving(true);
              }}
            >
              <Text style={s.leaveText}>No puedo ir</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
