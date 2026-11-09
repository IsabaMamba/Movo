/**
 * movo.app/s/<code>: what somebody sees when they open an invitation to a
 * session (Enlace v1, 2 November; 0055).
 *
 * The one part of Movo meant for somebody with no account and no app.
 * Readable signed out; the eight states of the board are the states of
 * session_link_preview(). It never names who is going — only how many —
 * and a group's session shows nothing but that it is one. The tab title is
 * «Sesión · Movo», never the session's name, and the page is noindex like
 * every path outside the allowlist (src/lib/robots.ts).
 *
 * «Unirme» is join_activity(), the same as in the app. Signed out, it goes
 * through sign-in and comes back here.
 */

import Head from 'expo-router/head';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { joinActivity } from '../../lib/activities';
import { fetchLinkPreview, goingLine, type LinkPreview } from '../../lib/sessionLinks';
import { supabase } from '../../lib/supabase';
import { color, priceLabel } from '../../theme';
import { sportColor } from '../../theme/sport';
import { useAuth } from '../auth/AuthProvider';
import { Icon, type IconName } from '../nav/Icon';
import { linkPageStyles as s } from './linkPageStyles';

const TZ = 'America/Costa_Rica';

const SKILL: Record<string, string> = {
  any: 'Todos los niveles',
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
};

/** «Sáb 7 nov · 07:00 a 08:30». */
function when(startsAt: string, endsAt: string): string {
  const day = new Intl.DateTimeFormat('es-CR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: TZ,
  })
    .format(new Date(startsAt))
    .replace(/[.,]/g, '');
  const clock = new Intl.DateTimeFormat('es-CR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: TZ,
  });
  const cap = day.charAt(0).toUpperCase() + day.slice(1);
  return endsAt
    ? `${cap} · ${clock.format(new Date(startsAt))} a ${clock.format(new Date(endsAt))}`
    : `${cap} · ${clock.format(new Date(startsAt))}`;
}

/** «sábado 14 de noviembre». */
function longDay(iso: string): string {
  return new Intl.DateTimeFormat('es-CR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: TZ,
  }).format(new Date(iso));
}

export function SessionLinkScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session } = useAuth();
  const router = useRouter();

  const [preview, setPreview] = useState<LinkPreview | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!code) return;
    setPreview(
      await fetchLinkPreview(supabase, code).catch((): LinkPreview => ({
        ...EMPTY,
        state: 'missing',
      })),
    );
  }, [code]);

  useEffect(() => {
    void load();
  }, [load, session]);

  const here = `/s/${code ?? ''}`;
  const signIn = () => {
    router.push({ pathname: '/sign-in', params: { next: here } });
  };

  const join = () => {
    if (!preview?.activityId) return;
    if (!session) {
      signIn();
      return;
    }
    setBusy(true);
    setError(null);
    joinActivity(supabase, preview.activityId)
      .then(() => load())
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error ? cause.message : 'No se pudo completar. Intenta de nuevo.',
        );
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const openSession = (id: string) => {
    router.push({ pathname: '/sesion/[id]', params: { id } });
  };

  const findOthers = (
    <Pressable
      accessibilityRole="link"
      onPress={() => {
        router.push('/');
      }}
      style={s.primary}
    >
      <Text style={s.primaryText}>Encuentra con quién moverte</Text>
    </Pressable>
  );

  const summary = (p: LinkPreview, faded = false) => (
    <View style={[s.mini, faded && s.miniFaded]}>
      <Text style={s.sport}>
        <Text style={{ color: sportColor(p.categoryId) }}>● </Text>
        {SKILL[p.skill] ?? 'Todos los niveles'}
      </Text>
      <Text style={s.miniTitle}>{p.title}</Text>
      <Text style={s.miniMeta}>
        {when(p.startsAt, p.endsAt)} · {p.venue}
      </Text>
      <Text style={s.miniMeta}>
        {goingLine(p)} · organiza {p.organizer}
      </Text>
    </View>
  );

  const state = (icon: IconName, title: string, body: string, children?: React.ReactNode) => (
    <View style={s.state}>
      <View style={s.stateIcon}>
        <Icon color={color.text.primary} name={icon} size={22} />
      </View>
      <Text accessibilityRole="header" style={s.stateTitle}>
        {title}
      </Text>
      <Text style={s.stateBody}>{body}</Text>
      {children}
    </View>
  );

  let body: React.ReactNode;
  const p = preview;
  if (p === undefined) {
    body = <ActivityIndicator />;
  } else if (p.state === 'missing') {
    body = state(
      'external',
      'Este enlace no funciona',
      'Puede que esté incompleto o que la sesión se haya borrado.',
      <>
        {findOthers}
        <Text style={s.hint}>Revisa que termine en las 6 letras y números que te mandaron.</Text>
      </>,
    );
  } else if (p.state === 'group') {
    body = state(
      'lock',
      'Esta sesión es de un grupo',
      'Solo quienes están en el grupo ven el día, la hora y el lugar.',
      <>
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            if (!session) signIn();
            else if (p.activityId) openSession(p.activityId);
          }}
          style={s.primary}
        >
          <Text style={s.primaryText}>Ya estoy en el grupo: entrar</Text>
        </Pressable>
        <Text style={s.hint}>¿No estás? Pídele a quien te mandó el enlace que te agregue.</Text>
      </>,
    );
  } else if (p.state === 'cancelled') {
    body = state(
      'close',
      'Esta sesión se canceló',
      `${p.organizer} la canceló. No tienes que hacer nada más.`,
      <>
        {summary(p, true)}
        {findOthers}
      </>,
    );
  } else if (p.state === 'past') {
    body = state(
      'history',
      'Esta fecha ya pasó',
      p.next
        ? `Fue el ${longDay(p.startsAt)}. Es parte de una serie: la siguiente fecha es el ${longDay(p.next.startsAt)}.`
        : `Fue el ${longDay(p.startsAt)}.`,
      <>
        {summary(p, true)}
        {p.next ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => {
              if (p.next) openSession(p.next.activityId);
            }}
            style={s.primary}
          >
            <Text style={s.primaryText}>Ver el {longDay(p.next.startsAt)}</Text>
          </Pressable>
        ) : (
          findOthers
        )}
      </>,
    );
  } else if (p.mine === 'joined' || p.mine === 'waitlisted') {
    body = state(
      'check',
      p.mine === 'joined' ? '¡Listo, te uniste!' : 'Quedaste en la lista de espera',
      p.mine === 'joined'
        ? `${p.title}, ${longDay(p.startsAt)}. Ahora ${goingLine(p)}.`
        : 'Si alguien sale, entras en orden y te avisamos.',
      <Pressable
        accessibilityRole="link"
        onPress={() => {
          if (p.activityId) openSession(p.activityId);
        }}
        style={s.primary}
      >
        <Text style={s.primaryText}>Abrir la sesión</Text>
      </Pressable>,
    );
  } else if (p.state === 'full') {
    body = state(
      'people',
      'Esta vez se llenó',
      `Las ${String(p.maxParticipants ?? p.joinedCount)} personas ya están. Si alguien sale, entras en orden y te avisamos.`,
      <>
        {summary(p)}
        <Pressable
          accessibilityRole="button"
          aria-disabled={busy}
          disabled={busy}
          onPress={join}
          style={[s.primary, busy && s.off]}
        >
          <Text style={s.primaryText}>
            {session ? 'Unirme a la lista de espera' : 'Inicia sesión para la lista de espera'}
          </Text>
        </Pressable>
        {p.waitlistCount > 0 && (
          <Text style={s.hint}>
            {p.waitlistCount === 1
              ? 'Hay 1 persona antes que tú.'
              : `Hay ${String(p.waitlistCount)} personas antes que tú.`}
          </Text>
        )}
      </>,
    );
  } else {
    body = (
      <View style={s.open}>
        {p.invitedBy && (
          <Text style={s.invited}>
            <Text style={s.invitedName}>{p.invitedBy}</Text> te invita a
          </Text>
        )}
        <Text style={s.sport}>
          <Text style={{ color: sportColor(p.categoryId) }}>● </Text>
          {SKILL[p.skill] ?? 'Todos los niveles'}
        </Text>
        <Text accessibilityRole="header" style={s.title}>
          {p.title}
        </Text>
        <View style={s.rows}>
          <Row icon="calendar" title={when(p.startsAt, p.endsAt)} />
          <Row icon="pin" sub={p.district} title={p.venue} />
          <Row icon="people" sub="Quiénes van se ve después de unirte" title={goingLine(p)} />
          <Row icon="money" title={priceLabel(p.priceMinor, p.currency)} />
        </View>
        {p.description ? (
          <View style={s.organizer}>
            <Text style={s.organizerName}>Organiza {p.organizer}</Text>
            <Text style={s.organizerText}>{p.description}</Text>
          </View>
        ) : (
          <Text style={s.hint}>Organiza {p.organizer}</Text>
        )}
        {error !== null && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          aria-disabled={busy}
          disabled={busy}
          onPress={join}
          style={[s.primary, busy && s.off]}
        >
          <Text style={s.primaryText}>
            {busy ? 'Un momento…' : session ? 'Unirme' : 'Inicia sesión para unirte'}
          </Text>
        </Pressable>
        <Text style={s.hint}>
          Unirte no instala nada. Si no tienes cuenta, la creas en un minuto.
        </Text>

        <View style={s.steps}>
          <Text style={s.overline}>CUANDO TE UNES</Text>
          {[
            ['Crea tu cuenta.', 'Con tu correo. Es gratis y es para mayores de 18.'],
            ['Quedas en la lista.', 'Te llega un aviso el día antes.'],
            ['Al llegar, marcas «Llegué».', 'Con el código de 4 números que tiene quien organiza.'],
          ].map(([strong, rest], i) => (
            <View key={strong} style={s.step}>
              <View style={s.stepNumber}>
                <Text style={s.stepNumberText}>{i + 1}</Text>
              </View>
              <Text style={s.stepText}>
                <Text style={s.stepStrong}>{strong}</Text> {rest}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.content} style={s.screen}>
      <Head>
        <title>Sesión · Movo</title>
      </Head>
      <View style={s.top}>
        <Text style={s.logo}>movo</Text>
      </View>
      {body}
      <View style={s.about}>
        <Text style={s.aboutTitle}>¿Qué es Movo?</Text>
        <Text style={s.aboutText}>
          Sesiones de deporte en grupo, con gente real y en lugares públicos.
        </Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            router.push('/');
          }}
        >
          <Text style={s.aboutLink}>Conoce Movo ›</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Row({ icon, title, sub }: { icon: IconName; title: string; sub?: string | null }) {
  return (
    <View style={s.row}>
      <Icon color={color.text.secondary} name={icon} size={18} />
      <View style={s.rowText}>
        <Text style={s.rowTitle}>{title}</Text>
        {sub ? <Text style={s.rowSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

const EMPTY: LinkPreview = {
  state: 'missing',
  activityId: null,
  seriesId: null,
  title: '',
  categoryId: '',
  skill: 'any',
  startsAt: '',
  endsAt: '',
  description: null,
  joinedCount: 0,
  waitlistCount: 0,
  maxParticipants: null,
  priceMinor: 0,
  currency: 'CRC',
  venue: '',
  district: null,
  organizer: '',
  invitedBy: null,
  mine: null,
  next: null,
};
