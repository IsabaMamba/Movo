/**
 * The chat icon beside the bell in Mis sesiones (Chat v2 · 1), with the
 * unread count of every chat that isn't silenced. Counted on focus, like
 * the bell. A failed count leaves the icon without a number.
 */

import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fetchMyChats, totalUnread } from '../../lib/chat';
import { supabase } from '../../lib/supabase';
import { color, hitSlopFor, radius, size, type } from '../../theme';
import { Icon } from './Icon';

export function ChatLink() {
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchMyChats(supabase)
        .then((chats) => {
          if (!cancelled) setUnread(totalUnread(chats));
        })
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <Link href="/chats" asChild>
      <Pressable
        accessible
        accessibilityLabel={
          unread > 0
            ? `Tus chats. ${unread} ${unread === 1 ? 'mensaje nuevo' : 'mensajes nuevos'}.`
            : 'Tus chats'
        }
        accessibilityRole="link"
        hitSlop={hitSlopFor(size.controlSm)}
        style={styles.icon}
      >
        <Icon color={color.text.primary} name="chat" size={24} />
        {unread > 0 && (
          <View aria-hidden style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        )}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  /** Sun, not the bell's red: a chat is conversation, not something that needs you. */
  badge: {
    alignItems: 'center',
    backgroundColor: color.accent.primary,
    borderColor: color.bg.base,
    borderRadius: radius.full,
    borderWidth: 2,
    height: 18,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 3,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  badgeText: { ...type.caption, color: color.text.inverse, fontSize: 10, fontWeight: '700' },
});
