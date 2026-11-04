/**
 * Tus chats (Chat v1 · 5): one per session you go to and one per group
 * you're in. Silenced chats say so and their count stays grey. No private
 * messages, so nothing here starts a conversation with one person.
 */

import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { fetchMyChats, lastLine, type ChatSummary } from '../../lib/chat';
import { groupInitials } from '../../lib/groups';
import { supabase } from '../../lib/supabase';
import { color, hitSlopFor, size } from '../../theme';
import { sportColor } from '../../theme/sport';
import { useAuth } from '../auth/AuthProvider';
import { Icon } from '../nav/Icon';
import { chatTime } from './format';
import { chatStyles as s } from './styles';

export function ChatsScreen() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      fetchMyChats(supabase)
        .then(setChats)
        .catch((cause: unknown) => {
          setChats([]);
          setError(cause instanceof Error ? cause.message : 'No se pudieron cargar tus chats.');
        });
    }, [session]),
  );

  if (loading) return <ActivityIndicator style={s.screen} />;
  if (!session) return <Redirect href="/sign-in" />;

  const open = (chat: ChatSummary) => {
    if ('activityId' in chat.scope) {
      router.push({ pathname: '/chat/sesion/[id]', params: { id: chat.scope.activityId } });
    } else {
      router.push({ pathname: '/chat/grupo/[id]', params: { id: chat.scope.communityId } });
    }
  };

  return (
    <View style={s.screen}>
      <View style={s.topBar}>
        <Pressable
          accessibilityLabel="Volver"
          accessibilityRole="button"
          hitSlop={hitSlopFor(size.controlSm)}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/mis-sesiones');
          }}
          style={s.topButton}
        >
          <Icon color={color.text.primary} name="back" size={22} />
        </Pressable>
        <View style={s.topText}>
          <Text accessibilityRole="header" style={s.title}>
            Tus chats
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.listScreen}>
        {error !== null && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        {chats === null ? (
          <ActivityIndicator />
        ) : chats.length === 0 ? (
          <Text style={s.empty}>
            Aquí aparece el chat de cada sesión a la que vas y de cada grupo en el que estás.
          </Text>
        ) : (
          chats.map((chat) => {
            const muted = chat.notify === 'muted';
            const when = chat.last?.createdAt ?? chat.startsAt;
            const meta = [chat.kind === 'group' ? 'grupo' : null, muted ? 'silenciado' : null]
              .filter(Boolean)
              .join(' · ');
            return (
              <Pressable
                accessibilityLabel={[
                  chat.title,
                  chat.kind === 'group' ? 'grupo' : 'sesión',
                  chat.last ? lastLine(chat.last) : null,
                  chat.unread > 0 ? `${chat.unread} sin leer` : null,
                  muted ? 'silenciado' : null,
                  chat.closed ? 'cerrado' : null,
                ]
                  .filter(Boolean)
                  .join('. ')}
                accessibilityRole="button"
                key={'activityId' in chat.scope ? chat.scope.activityId : chat.scope.communityId}
                onPress={() => {
                  open(chat);
                }}
                style={s.row}
              >
                <View
                  aria-hidden
                  style={[
                    s.tile,
                    { backgroundColor: sportColor(chat.categoryId ?? '', color.accent.primary) },
                  ]}
                >
                  <Text style={s.tileText}>{groupInitials(chat.title)}</Text>
                </View>
                <View style={s.rowText}>
                  <Text numberOfLines={1} style={s.rowTitle}>
                    {chat.title}
                  </Text>
                  <Text numberOfLines={1} style={s.rowLast}>
                    {chat.last
                      ? lastLine(chat.last)
                      : chat.closed
                        ? 'Chat cerrado'
                        : 'Sin mensajes'}
                  </Text>
                </View>
                <View style={s.rowMeta}>
                  <Text style={s.rowWhen}>{meta || (when ? chatTime(when) : '')}</Text>
                  {chat.unread > 0 && (
                    <View style={[s.badge, muted && s.badgeMuted]}>
                      <Text style={s.badgeText}>{chat.unread}</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })
        )}
        <Text style={s.footnote}>
          Un chat por sesión a la que vas y uno por grupo. Sin mensajes privados: solo te escribe
          quien comparte una sesión o un grupo contigo.
        </Text>
      </ScrollView>
    </View>
  );
}
