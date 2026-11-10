/**
 * Mis sesiones — the way back to something you joined.
 *
 * Descubrir lists what is nearby and still ahead, so a session left reach the
 * moment it started: the one you were on your way to was already gone from
 * the only screen that had ever shown it. This is the way back, for everybody
 * who goes rather than organizes.
 *
 * Mis sesiones v4, as the 2 November walkthrough draws it (steps 6–8):
 * «Próximas» and «Pasadas», the week at a glance with a dot on the days you
 * have something, the next session first as «Tu próxima» — with «Llegué»
 * when it is time — and the rest grouped by day. Tapping a day shows only
 * that day. «Pasadas» keeps what happened, including being marked absent:
 * somebody else wrote that about you, and hiding it would let the two
 * records disagree with no way to notice.
 */

import { Link, Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

import { fetchCategories, fetchMyParticipations, type MyParticipation } from '../../lib/activities';
import { dayHeading, localDay, weekStrip, weekTitle } from '../../lib/agenda';
import { nextArrival } from '../../lib/checkIn';
import {
  fetchMonthlyAttendance,
  monthLine,
  RETENTION_NOTE,
  type MonthCount,
} from '../../lib/monthlyAttendance';
import { supabase } from '../../lib/supabase';
import { color } from '../../theme';
import { sportColor } from '../../theme/sport';
import type { Category } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import { ArrivalCard } from '../checkin/ArrivalCard';
import { BellLink } from '../nav/BellLink';
import { ChatLink } from '../nav/ChatLink';
import { Icon } from '../nav/Icon';
import { mineStyles as s } from './styles';

interface Standing {
  label: string;
  chip: StyleProp<ViewStyle>;
  text: StyleProp<TextStyle>;
  /** Said out loud only when the state is not self-evident from the word. */
  note: string | null;
}

function standingOf(entry: MyParticipation, past: boolean): Standing {
  // Checked first: «Vas» on a session that is not happening is the one label
  // on this screen that would send somebody somewhere for nothing.
  if (entry.activity.status === 'cancelled') {
    return {
      label: 'Cancelada',
      chip: s.badgeMiss,
      text: s.badgeMissText,
      note: entry.activity.cancelled_by_staff
        ? 'La canceló el equipo de Movo.'
        : entry.activity.cancel_reason
          ? `Quien organiza escribió: «${entry.activity.cancel_reason}»`
          : 'Quien organiza la canceló.',
    };
  }
  if (entry.status === 'waitlisted') {
    return {
      label: entry.waitlist_pos === null ? 'En espera' : `En espera · puesto ${entry.waitlist_pos}`,
      chip: s.badgeWait,
      text: s.badgeWaitText,
      note: past
        ? 'No se liberó un lugar a tiempo.'
        : 'Si alguien cancela, entras automáticamente.',
    };
  }
  if (entry.status === 'attended') {
    return { label: 'Llegaste', chip: s.badgeDone, text: s.badgeDoneText, note: null };
  }
  if (entry.status === 'no_show') {
    return {
      label: 'No llegaste',
      chip: s.badgeMiss,
      text: s.badgeMissText,
      note: 'Lo marcó quien organiza al cerrar la sesión. Si no es así, escríbele.',
    };
  }
  if (past) {
    return {
      label: 'Sin cerrar',
      chip: s.badgeOpen,
      text: s.badgeOpenText,
      note: 'Ya pasó y quien organiza todavía no registró la asistencia.',
    };
  }
  return { label: 'Vas', chip: s.badgeDone, text: s.badgeDoneText, note: null };
}

const TIME = new Intl.DateTimeFormat('es-CR', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/Costa_Rica',
});

/** Entries grouped under their day, in the order given. */
function byDay(entries: readonly MyParticipation[]): [string, MyParticipation[]][] {
  const groups = new Map<string, MyParticipation[]>();
  for (const entry of entries) {
    const day = localDay(entry.activity.starts_at);
    groups.set(day, [...(groups.get(day) ?? []), entry]);
  }
  return [...groups.entries()];
}

type Tab = 'proximas' | 'pasadas';

export function MySessionsScreen() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const [entries, setEntries] = useState<MyParticipation[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('proximas');
  const [day, setDay] = useState<string | null>(null);

  const [months, setMonths] = useState<MonthCount[]>([]);
  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!userId) return;
    const [mine, counts] = await Promise.all([
      fetchMyParticipations(supabase, userId),
      // 0058. Unread — or the migration not applied yet — Pasadas is the
      // list alone, as before.
      fetchMonthlyAttendance(supabase).catch((): MonthCount[] => []),
    ]);
    setEntries(mine);
    setMonths(counts);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      load().catch((cause: unknown) => {
        if (cancelled) return;
        setEntries([]);
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar tus sesiones.');
      });
      return () => {
        cancelled = true;
      };
    }, [load]),
  );

  useEffect(() => {
    void fetchCategories(supabase)
      .then(setCategories)
      .catch(() => undefined);
  }, []);

  if (loading) return <ActivityIndicator style={s.screen} />;
  if (!session || !userId) return <Redirect href="/sign-in" />;

  const now = new Date();
  const all = entries ?? [];
  const sportName = (id: string) => categories.find((c) => c.id === id)?.name_es;

  // «Próximas» keeps a session for 45 minutes after it starts — as long as
  // «Llegué» is open — so the card does not vanish while you are walking in.
  const upcomingAll = all.filter(
    (e) => new Date(e.activity.starts_at).getTime() > now.getTime() - 45 * 60_000,
  );
  const pastAll = all
    .filter((e) => !upcomingAll.includes(e))
    .slice()
    .reverse();

  // «Tu próxima» is always first; inside its check-in window it is the one
  // with «Llegué».
  const next =
    nextArrival(upcomingAll) ??
    upcomingAll.find((e) => e.activity.status !== 'cancelled' && e.status !== 'waitlisted') ??
    null;

  const week = weekStrip(
    now,
    upcomingAll.map((e) => localDay(e.activity.starts_at)),
  );

  const upcoming = upcomingAll.filter(
    (e) => e !== next && (day === null || localDay(e.activity.starts_at) === day),
  );
  const showNext = next !== null && (day === null || localDay(next.activity.starts_at) === day);

  // What is left of the sessions older than six months (0058): a count per
  // month, and the sentence that says the detail was not lost by accident.
  const olderMonths = (
    <View style={s.months}>
      <Text style={s.pastNote}>{RETENTION_NOTE}</Text>
      {months.map((m) => (
        <Text key={m.month} style={s.emptyBody}>
          {monthLine(m, now.getFullYear())}
        </Text>
      ))}
    </View>
  );

  const row = (entry: MyParticipation, past: boolean) => {
    const { activity } = entry;
    const standing = standingOf(entry, past);
    return (
      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel={[
          activity.title,
          standing.label,
          TIME.format(new Date(activity.starts_at)),
          activity.location.name,
        ].join('. ')}
        accessibilityHint="Abre la sesión"
        key={`${entry.activity_id}-${entry.user_id}`}
        onPress={() => {
          router.push({ pathname: '/sesion/[id]', params: { id: activity.id } });
        }}
        style={s.item}
      >
        <View style={[s.itemBar, { backgroundColor: sportColor(activity.category_id) }]} />
        <Text style={s.itemTime}>{TIME.format(new Date(activity.starts_at))}</Text>
        <View style={s.itemBody}>
          <Text numberOfLines={1} style={s.itemTitle}>
            {activity.title}
          </Text>
          <Text numberOfLines={1} style={s.itemMeta}>
            {activity.location.name}
            {activity.location.district ? ` · ${activity.location.district}` : ''}
          </Text>
          <View style={[s.badge, standing.chip]}>
            <Text style={[s.badgeText, standing.text]}>{standing.label}</Text>
          </View>
          {standing.note !== null && past && <Text style={s.cardNote}>{standing.note}</Text>}
        </View>
      </Pressable>
    );
  };

  const groups = (list: readonly MyParticipation[], past: boolean) =>
    byDay(list).map(([ymd, items]) => {
      const heading = dayHeading(items[0]!.activity.starts_at, now);
      return (
        <View key={ymd} style={s.group}>
          <View style={s.dayHead}>
            <Text style={s.dayLabel}>{heading.label}</Text>
            {heading.relative ? <Text style={s.dayRelative}>{heading.relative}</Text> : null}
          </View>
          {items.map((entry) => row(entry, past))}
        </View>
      );
    });

  return (
    <ScrollView contentContainerStyle={s.content} style={s.screen}>
      <View style={s.headerRow}>
        <Text accessibilityRole="header" style={s.title}>
          Mis sesiones
        </Text>
        <View style={s.headerIcons}>
          <ChatLink />
          <BellLink userId={userId} />
        </View>
      </View>

      <View accessibilityRole="tablist" style={s.segment}>
        {(
          [
            ['proximas', 'Próximas'],
            ['pasadas', 'Pasadas'],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            accessibilityRole="tab"
            aria-selected={tab === value}
            key={value}
            onPress={() => {
              setTab(value);
              setDay(null);
            }}
            style={[s.segmentItem, tab === value && s.segmentItemOn]}
          >
            <Text style={[s.segmentText, tab === value && s.segmentTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {error !== null && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}

      {entries === null ? (
        <ActivityIndicator />
      ) : tab === 'proximas' ? (
        upcomingAll.length === 0 ? (
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <Icon color={color.text.secondary} name="calendar" size={28} />
            </View>
            <Text style={s.sectionTitle}>Todavía no tienes sesiones</Text>
            <Text style={s.emptyBody}>
              Cuando te unas a una, aparece aquí con su día y su hora, incluso después de que
              empiece.
            </Text>
            <Link href="/" asChild>
              <Pressable accessibilityRole="link" style={s.emptyButton}>
                <Text style={s.emptyButtonText}>Encuentra con quién moverte</Text>
              </Pressable>
            </Link>
          </View>
        ) : (
          <>
            <View style={s.weekHead}>
              <Text style={s.weekTitle}>{weekTitle(now)}</Text>
              <Text style={s.weekHint}>Toca un día</Text>
            </View>
            <View accessibilityRole="radiogroup" accessibilityLabel="Esta semana" style={s.week}>
              {week.map((d) => {
                const on = day === d.ymd;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    aria-checked={on}
                    accessibilityLabel={`${d.number}${d.isToday ? ', hoy' : ''}${d.hasSession ? ', tienes una sesión' : ''}`}
                    key={d.ymd}
                    onPress={() => {
                      setDay(on ? null : d.ymd);
                    }}
                    style={s.weekDay}
                  >
                    <Text style={s.weekLetter}>{d.letter}</Text>
                    <View
                      style={[s.weekNumber, d.isToday && s.weekNumberToday, on && s.weekNumberOn]}
                    >
                      <Text style={[s.weekNumberText, (d.isToday || on) && s.weekNumberTextOn]}>
                        {d.number}
                      </Text>
                    </View>
                    <View style={[s.weekDot, d.hasSession && s.weekDotOn]} />
                  </Pressable>
                );
              })}
            </View>

            {showNext && next && (
              <ArrivalCard
                entry={next}
                onChanged={() => {
                  void load().catch(() => undefined);
                }}
                sport={sportName(next.activity.category_id)}
              />
            )}

            {groups(upcoming, false)}

            {day !== null && upcoming.length === 0 && !showNext && (
              <Text style={s.emptyBody}>Ese día no tienes nada.</Text>
            )}
          </>
        )
      ) : pastAll.length === 0 ? (
        <View style={s.empty}>
          {months.length === 0 ? (
            <>
              <Text style={s.sectionTitle}>Todavía no hay sesiones pasadas</Text>
              <Text style={s.emptyBody}>
                Aquí quedan las sesiones a las que fuiste, solo para ti.
              </Text>
            </>
          ) : (
            olderMonths
          )}
        </View>
      ) : (
        <>
          <Text style={s.pastNote}>
            Solo tú ves esta lista. No se publica ni se usa para recomendarte nada.
          </Text>
          {groups(pastAll, true)}
          {olderMonths}
          <Link href="/historial" style={s.back}>
            <Text style={s.linkText}>Mi historial de asistencia</Text>
          </Link>
        </>
      )}
    </ScrollView>
  );
}
