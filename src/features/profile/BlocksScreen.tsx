/**
 * Perfil › Bloqueos (Perfil v3): the people you blocked, and unblocking.
 *
 * Only the public name and since when (0039 returns no more). Unblocking
 * asks once, says what changes, and tells nobody — in either direction.
 */

import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import {
  blockedSinceLabel,
  fetchBlockedPeople,
  unblockPerson,
  type BlockedPerson,
} from '../../lib/blocks';
import { supabase } from '../../lib/supabase';
import { color, hitSlopFor, size } from '../../theme';
import { useAuth } from '../auth/AuthProvider';
import { authorInitials } from '../chat/format';
import { createStyles as c } from '../create/styles';
import { Icon } from '../nav/Icon';
import { blocksStyles as s } from './styles';

export function BlocksScreen() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const [people, setPeople] = useState<BlockedPerson[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    fetchBlockedPeople(supabase)
      .then(setPeople)
      .catch((cause: unknown) => {
        setPeople([]);
        setError(cause instanceof Error ? cause.message : 'No se pudo cargar la lista.');
      });
  }, [session]);

  if (loading) return <ActivityIndicator style={c.screen} />;
  if (!session) return <Redirect href="/sign-in" />;

  const unblock = (person: BlockedPerson) => {
    setConfirming(null);
    setError(null);
    unblockPerson(supabase, person.id)
      .then(() => {
        setPeople((list) => (list ?? []).filter((p) => p.id !== person.id));
        setNotice(`Desbloqueaste a ${person.displayName}. No le avisamos.`);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo desbloquear.');
      });
  };

  return (
    <ScrollView contentContainerStyle={c.content} style={c.screen}>
      <View style={s.topBar}>
        <Pressable
          accessibilityLabel="Volver a Perfil"
          accessibilityRole="button"
          hitSlop={hitSlopFor(size.controlSm)}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/cuenta');
          }}
          style={s.topButton}
        >
          <Icon color={color.text.primary} name="back" size={22} />
        </Pressable>
        <Text accessibilityRole="header" style={s.title}>
          Bloqueos
        </Text>
      </View>

      <Text style={c.hint}>
        No ves a estas personas ni ellas a ti: ni en Descubrir, ni en listas, ni en chats. No saben
        que las bloqueaste.
      </Text>

      {notice !== null && (
        <View style={[c.banner, c.bannerOk]}>
          <Text accessibilityRole="alert" style={c.bannerText}>
            {notice}
          </Text>
        </View>
      )}
      {error !== null && (
        <View style={c.banner}>
          <Text accessibilityRole="alert" style={c.bannerText}>
            {error}
          </Text>
        </View>
      )}

      {people === null ? (
        <ActivityIndicator />
      ) : people.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No bloqueaste a nadie</Text>
          <Text style={c.hint}>
            Si alguien te incomoda, puedes bloquearle desde un mensaje del chat. Deja de verte y no
            le avisamos.
          </Text>
        </View>
      ) : (
        <View style={s.list}>
          {people.map((person) => (
            <View key={person.id} style={s.row}>
              <View style={s.rowTop}>
                <View aria-hidden style={s.avatar}>
                  <Text style={s.avatarText}>{authorInitials(person.displayName)}</Text>
                </View>
                <View style={s.rowText}>
                  <Text style={s.name}>{person.displayName}</Text>
                  <Text style={s.since}>{blockedSinceLabel(person.blockedAt)}</Text>
                </View>
                {confirming !== person.id && (
                  <Pressable
                    accessibilityLabel={`Desbloquear a ${person.displayName}`}
                    accessibilityRole="button"
                    onPress={() => {
                      setConfirming(person.id);
                      setNotice(null);
                    }}
                    style={s.unblock}
                  >
                    <Text style={s.unblockText}>Desbloquear</Text>
                  </Pressable>
                )}
              </View>
              {confirming === person.id && (
                <View style={s.confirm}>
                  <Text style={c.hint}>
                    Van a poder verse otra vez en sesiones, listas y chats. No le avisamos.
                  </Text>
                  <View style={s.confirmActions}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        unblock(person);
                      }}
                      style={s.confirmYes}
                    >
                      <Text style={s.confirmYesText}>Sí, desbloquear</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setConfirming(null);
                      }}
                      style={s.unblock}
                    >
                      <Text style={s.unblockText}>No</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
