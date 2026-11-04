/**
 * Avisos — the screen that finally delivers what the database has been writing.
 *
 * Since 0008 a row lands here every time somebody is promoted off a waitlist
 * and every time a session is cancelled. Nothing read them, so two product
 * decisions were made around the gap: the time and the venue lock once anybody
 * has joined, because moving them told nobody, and cancelling ends with an
 * instruction to message the roster by hand. Both were the honest answer while
 * this screen did not exist.
 *
 * Every row is a fact about a session the user is already on the roster of, so
 * the list is deliberately not a feed: there is nothing to browse, only things
 * to find out and then be done with.
 *
 * Laid out as step 20 of the 2 November walkthrough: a back arrow and
 * «Marcar todo» in the header, three filters, «Nuevos» above «Antes», and one
 * row per aviso with an icon for its kind, the sentence and how long ago.
 */

import { Link, Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import {
  fetchNotifications,
  inFilter,
  markNotificationRead,
  timeAgo,
  toInboxItem,
  type InboxFilter,
  type InboxItem,
} from '../../lib/notifications';
import { supabase } from '../../lib/supabase';
import { color, hitSlopFor, size } from '../../theme';
import { useAuth } from '../auth/AuthProvider';
import { Icon, type IconName } from '../nav/Icon';
import { PushSwitch } from './PushSwitch';
import { inboxStyles as s } from './styles';

/** The mark-read link renders at 36px; the target is padded back up to 44. */
const MARK_HIT_SLOP = hitSlopFor(size.controlSm);

const FILTERS: { id: InboxFilter; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'sesiones', label: 'Mis sesiones' },
  { id: 'organizar', label: 'Organizar' },
];

/** The walkthrough's icon circle: what kind of news it is, before the words. */
function kindIcon(kind: string): { name: IconName; tint: string } {
  switch (kind) {
    case 'waitlist_promoted':
    case 'account_restored':
      return { name: 'check', tint: color.semantic.success };
    case 'activity_cancelled':
    case 'activity_cancelled_weather':
    case 'activity_cancelled_by_movo':
      return { name: 'close', tint: color.semantic.dangerOnRaised };
    case 'account_suspended':
      return { name: 'alert', tint: color.semantic.dangerOnRaised };
    case 'activity_link_changed':
      return { name: 'link', tint: color.accent.cool };
    case 'close_reminder':
      return { name: 'clipboard', tint: color.accent.primary };
    case 'solo_session_organizer':
    case 'solo_session_participant':
    case 'group_handed_over':
      return { name: 'people', tint: color.accent.cool };
    case 'report_resolved':
      return { name: 'flag', tint: color.accent.cool };
    case 'chat_reply':
    case 'chat_organizer':
    case 'chat_message':
      return { name: 'chat', tint: color.accent.cool };
    case 'chat_message_removed':
      return { name: 'alert', tint: color.semantic.dangerOnRaised };
    case 'blocked_person_going':
      return { name: 'hand', tint: color.text.secondary };
    case 'venue_returned':
      return { name: 'pin', tint: color.accent.primary };
    case 'terms_updated':
      return { name: 'book', tint: color.accent.cool };
    default:
      return { name: 'bell', tint: color.accent.cool };
  }
}

export function InboxScreen() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<InboxFilter>('todos');

  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    fetchNotifications(supabase, userId)
      .then((rows) => {
        if (!cancelled) setItems(rows.map(toInboxItem));
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setItems([]);
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar tus avisos.');
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  /**
   * Mark read, optimistically.
   *
   * The write is never awaited before anything else happens: a waitlist
   * promotion is worth opening on a bad connection, and a spinner between the
   * tap and the session would make the slow request the user's problem.
   *
   * Which leaves the failure. Showing nothing would be a lie the user acts on
   * — they would believe the inbox was clear and stop looking — so a failed
   * write puts the row back to unread and says so. The row is the real signal:
   * it survives coming back from the session, which is where the person
   * usually is by the time the request gives up, and it agrees with the badge
   * on the bell, which reads the same column from the server.
   */
  const markRead = (id: string) => {
    setItems((current) =>
      current === null ? current : current.map((i) => (i.id === id ? { ...i, read: true } : i)),
    );
    setError(null);

    markNotificationRead(supabase, id).catch((cause: unknown) => {
      setItems((current) =>
        current === null ? current : current.map((i) => (i.id === id ? { ...i, read: false } : i)),
      );
      setError(
        cause instanceof Error
          ? `El aviso sigue sin leer: ${cause.message}`
          : 'No se pudo marcar el aviso como leído. Sigue sin leer.',
      );
    });
  };

  /** Every unread one, each through the same optimistic path as a single tap. */
  const markAll = () => {
    for (const item of items ?? []) if (!item.read) markRead(item.id);
  };

  const open = (item: InboxItem) => {
    // Navigation first, and not inside a `.then()`. Reading the aviso is the
    // point; recording that it was read is bookkeeping.
    if (item.activityId !== null) {
      router.push(
        item.opensRoster
          ? { pathname: '/organizar/[id]', params: { id: item.activityId } }
          : { pathname: '/sesion/[id]', params: { id: item.activityId } },
      );
    }
    markRead(item.id);
  };

  if (loading) return <ActivityIndicator style={s.screen} />;
  if (!session) return <Redirect href="/sign-in" />;

  const rows = items ?? [];
  const shown = rows.filter((item) => inFilter(item, filter));
  const fresh = shown.filter((item) => !item.read);
  const before = shown.filter((item) => item.read);
  const unread = rows.filter((item) => !item.read).length;

  const body = (item: InboxItem) => {
    const icon = kindIcon(item.kind);
    return (
      <>
        <View aria-hidden style={[s.iconCircle, { borderColor: icon.tint }]}>
          <Icon color={icon.tint} name={icon.name} size={18} />
        </View>
        <View style={s.rowText}>
          <Text style={[s.cardText, item.read && s.cardTextRead]}>{item.text}</Text>
          <Text style={s.cardWhen}>{timeAgo(item.createdAt)}</Text>
        </View>
        {/* The dot and the «Sin leer» in the composed label say the same
            thing, so to a screen reader the dot is decoration. */}
        {!item.read && <View aria-hidden style={s.unreadDot} />}
      </>
    );
  };

  const card = (item: InboxItem) => {
    const label = [item.read ? null : 'Sin leer', item.text, timeAgo(item.createdAt)]
      .filter((part) => part !== null)
      .join('. ');

    if (item.activityId !== null) {
      return (
        <Pressable
          /* One aviso is one decision — is this something I have to do
             something about — and the sentence, the state and the time only
             mean that together. */
          accessible
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={
            item.opensRoster
              ? 'Abre la lista de asistencia y marca el aviso como leído.'
              : 'Abre la sesión y marca el aviso como leído.'
          }
          key={item.id}
          onPress={() => {
            open(item);
          }}
          style={[s.card, !item.read && s.cardUnread]}
        >
          {body(item)}
        </Pressable>
      );
    }

    /*
      Nothing to open — a resolved report has no screen, and an aviso this
      build cannot read has no destination it could trust. Tapping the card
      would then mark it read while appearing to do nothing, so the card is
      inert and the one thing it can do is an explicit control instead.
    */
    return (
      <View key={item.id} style={[s.cardColumn, !item.read && s.cardUnread]}>
        <View accessible accessibilityLabel={label} style={s.cardInner}>
          {body(item)}
        </View>
        {!item.read && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Marcar este aviso como leído"
            hitSlop={MARK_HIT_SLOP}
            onPress={() => {
              markRead(item.id);
            }}
            style={s.markRead}
          >
            <Text style={s.markReadText}>Marcar como leído</Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <ScrollView aria-busy={items === null} contentContainerStyle={s.content} style={s.screen}>
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          hitSlop={MARK_HIT_SLOP}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/');
          }}
          style={s.headerBack}
        >
          <Icon color={color.text.primary} name="back" size={22} />
        </Pressable>
        <Text accessibilityRole="header" style={s.title}>
          Avisos
        </Text>
        {unread > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Marcar todo como leído, ${unread} sin leer`}
            hitSlop={MARK_HIT_SLOP}
            onPress={markAll}
            style={s.markAll}
          >
            <Text style={s.markAllText}>Marcar todo</Text>
          </Pressable>
        )}
      </View>

      <View accessibilityRole="radiogroup" style={s.chipRow}>
        {FILTERS.map((f) => {
          const on = filter === f.id;
          return (
            <Pressable
              accessibilityRole="radio"
              aria-checked={on}
              hitSlop={MARK_HIT_SLOP}
              key={f.id}
              onPress={() => {
                setFilter(f.id);
              }}
              style={[s.chip, on && s.chipOn]}
            >
              <Text style={[s.chipText, on && s.chipTextOn]}>
                {on ? '✓ ' : ''}
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error !== null && (
        <Text accessibilityRole="alert" aria-live="assertive" style={s.error}>
          {error}
        </Text>
      )}

      {items === null ? (
        <ActivityIndicator />
      ) : rows.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.sectionTitle}>Aquí te vamos a avisar</Text>
          <Text style={s.emptyBody}>
            Cuando se libere un lugar y entres desde la lista de espera, y cuando alguien cancele
            una sesión a la que ibas. Nada más — no vas a recibir avisos de cosas que no te tocan.
          </Text>
          <Link href="/mis-sesiones" style={s.back}>
            <Text style={s.linkText}>Ver mis sesiones</Text>
          </Link>
        </View>
      ) : shown.length === 0 ? (
        <Text style={s.emptyBody}>Nada por aquí con este filtro.</Text>
      ) : (
        // Newest first inside each block. «Nuevos» above «Antes» is the
        // walkthrough's split; a row only moves between them when it is
        // opened, which takes the person off this screen anyway — or by
        // «Marcar todo», which is asking for exactly that.
        <>
          {fresh.length > 0 && (
            <View style={s.group}>
              <Text style={s.overline}>NUEVOS · {fresh.length}</Text>
              {fresh.map(card)}
            </View>
          )}
          {before.length > 0 && (
            <View style={s.group}>
              <Text style={s.overline}>ANTES</Text>
              {before.map(card)}
            </View>
          )}
        </>
      )}

      <PushSwitch />
    </ScrollView>
  );
}
