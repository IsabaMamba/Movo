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
 */

import { Link, Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { formatSessionTime } from '../../lib/activities';
import {
  fetchNotifications,
  markNotificationRead,
  toInboxItem,
  type InboxItem,
} from '../../lib/notifications';
import { supabase } from '../../lib/supabase';
import { hitSlopFor, size } from '../../theme';
import { useAuth } from '../auth/AuthProvider';
import { inboxStyles as s } from './styles';

/** The mark-read link renders at 36px; the target is padded back up to 44. */
const MARK_HIT_SLOP = hitSlopFor(size.controlSm);

export function InboxScreen() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
   * on Descubrir, which reads the same column from the server.
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

  const open = (item: InboxItem) => {
    // Navigation first, and not inside a `.then()`. Reading the aviso is the
    // point; recording that it was read is bookkeeping.
    if (item.activityId !== null) {
      router.push({ pathname: '/sesion/[id]', params: { id: item.activityId } });
    }
    markRead(item.id);
  };

  if (loading) return <ActivityIndicator style={s.screen} />;
  if (!session) return <Redirect href="/sign-in" />;

  const rows = items ?? [];

  const body = (item: InboxItem) => (
    <>
      {/* The chip and the "sin leer" in the composed label encode the same
          thing, so to a screen reader the chip is decoration. */}
      {!item.read && (
        <View aria-hidden style={s.badge}>
          <Text style={s.badgeText}>Nuevo</Text>
        </View>
      )}
      <Text style={s.cardText}>{item.text}</Text>
      <Text style={s.cardWhen}>{formatSessionTime(item.createdAt)}</Text>
    </>
  );

  const card = (item: InboxItem) => {
    const label = [item.read ? null : 'Sin leer', item.text, formatSessionTime(item.createdAt)]
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
          accessibilityHint="Abre la sesión y marca el aviso como leído."
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
      <View key={item.id} style={[s.card, !item.read && s.cardUnread]}>
        <View accessible accessibilityLabel={label}>
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
      <Link href="/" style={s.back}>
        <Text style={s.backText}>← Descubrir</Text>
      </Link>

      <View>
        <Text style={s.title}>Avisos</Text>
        <Text style={s.subtitle}>Lo que pasó con las sesiones a las que ibas.</Text>
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
          <Text style={s.sectionTitle}>Acá te vamos a avisar</Text>
          <Text style={s.emptyBody}>
            Cuando se libere un lugar y entrés desde la lista de espera, y cuando alguien cancele
            una sesión a la que ibas. Nada más — no vas a recibir avisos de cosas que no te tocan.
          </Text>
          <Link href="/mis-sesiones" style={s.back}>
            <Text style={s.linkText}>Ver mis sesiones</Text>
          </Link>
        </View>
      ) : (
        // Newest first, read and unread in one run. Sorting the unread to the
        // top would move a row under the finger of somebody reading down the
        // list, and the order things happened in is what makes two avisos
        // about the same session readable.
        <View style={s.group}>{rows.map(card)}</View>
      )}
    </ScrollView>
  );
}
