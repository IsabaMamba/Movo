/**
 * The bell at the top right of Descubrir, Mis sesiones and Perfil, with the
 * unread count as a red badge (2 November walkthrough). It counts on focus,
 * not on mount: the screens under /avisos stay mounted, and a count read
 * once would outlive what it counts.
 */

import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { countUnreadNotifications, unreadA11yLabel } from '../../lib/notifications';
import { supabase } from '../../lib/supabase';
import { color, hitSlopFor, radius, size, type } from '../../theme';
import { Icon } from './Icon';

export function BellLink({ userId }: { userId: string }) {
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      countUnreadNotifications(supabase, userId)
        .then((count) => {
          if (!cancelled) setUnread(count);
        })
        .catch(() => {
          // A failed count must not blank the screen under it.
        });
      return () => {
        cancelled = true;
      };
    }, [userId]),
  );

  return (
    <Link href="/avisos" asChild>
      <Pressable
        accessible
        accessibilityRole="link"
        accessibilityLabel={unreadA11yLabel(unread)}
        aria-live="polite"
        hitSlop={hitSlopFor(size.controlSm)}
        style={styles.bell}
      >
        <Icon color={color.text.primary} name="bell" size={24} />
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
  bell: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  badge: {
    alignItems: 'center',
    backgroundColor: color.semantic.danger,
    borderColor: color.bg.base,
    borderRadius: radius.full,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    minWidth: 20,
    paddingHorizontal: 3,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  badgeText: { ...type.caption, color: color.text.primary, fontSize: 12, fontWeight: '700' },
});
