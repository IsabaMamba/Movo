/**
 * A single group: what it is, its rules, who is in it, and the one action
 * that matters — joining or leaving.
 *
 * The member list is visible only to members, which the read policy enforces.
 * A visitor sees the group and its rules but not the roll, and is told so
 * rather than shown an empty list that looks like nobody is there.
 */

import { Link, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import {
  fetchCommunity,
  fetchCommunityMembers,
  joinCommunity,
  leaveCommunity,
  type CommunityMemberEntry,
} from '../../lib/activities';
import { supabase } from '../../lib/supabase';
import type { Community } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import { gruposStyles as s } from './styles';

const ROLE_LABEL: Record<string, string> = {
  owner: 'Dueña o dueño',
  organizer: 'Organiza',
  member: 'Miembro',
};

export function GrupoDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { session } = useAuth();

  const [community, setCommunity] = useState<Community | null | undefined>(undefined);
  const [members, setMembers] = useState<CommunityMemberEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!slug) return;
    const found = await fetchCommunity(supabase, slug);
    setCommunity(found);
    if (!found) return;

    // Members-only by policy: a non-member legitimately gets nothing back.
    const roll = await fetchCommunityMembers(supabase, found.id).catch(
      (): CommunityMemberEntry[] => [],
    );
    setMembers(roll);
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    load().catch((cause: unknown) => {
      if (cancelled) return;
      setCommunity(null);
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el grupo.');
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (community === undefined) return <ActivityIndicator style={s.screen} />;

  if (community === null) {
    return (
      <ScrollView contentContainerStyle={s.content} style={s.screen}>
        <Text style={s.sectionTitle}>No encontramos este grupo</Text>
        <Text style={s.emptyBody}>{error ?? 'Puede que sea privado o que ya no exista.'}</Text>
        <Link href="/grupos" style={s.back}>
          <Text style={s.linkText}>Volver a Grupos</Text>
        </Link>
      </ScrollView>
    );
  }

  const mine = members.find((m) => m.user_id === userId) ?? null;
  const isMember = mine !== null;

  const toggle = () => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    const run = isMember
      ? leaveCommunity(supabase, community.id, userId)
      : joinCommunity(supabase, community.id, userId);

    run
      .then(() => load())
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo completar la acción.');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <ScrollView contentContainerStyle={s.content} style={s.screen}>
      <Link href="/grupos" style={s.back}>
        <Text style={s.backText}>← Grupos</Text>
      </Link>

      <View>
        <View style={s.badge}>
          <Text style={s.badgeText}>{community.is_public ? 'Abierto' : 'Solo invitados'}</Text>
        </View>
        <Text style={s.title}>{community.name}</Text>
        <Text style={s.subtitle}>/{community.slug}</Text>
      </View>

      {community.description && <Text style={s.cardBody}>{community.description}</Text>}

      {community.rules && (
        <View style={s.rules}>
          <Text style={s.rulesLabel}>Reglas del grupo</Text>
          <Text style={s.rulesText}>{community.rules}</Text>
        </View>
      )}

      {error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}

      {/* The count is only true when the roll came back; for a non-member the
          empty list means hidden, not empty, so it gets no list role. */}
      <View
        accessibilityRole={members.length > 0 ? 'list' : undefined}
        accessibilityLabel={
          members.length > 0
            ? `Quién está: ${members.length} ${members.length === 1 ? 'persona' : 'personas'}`
            : undefined
        }
      >
        <Text style={s.sectionTitle}>Quién está</Text>
        {members.length > 0 ? (
          members.map((member) => (
            /* Name and role are one person, not two readings. */
            <View
              accessible
              accessibilityLabel={`${member.profile.display_name}. ${ROLE_LABEL[member.role] ?? member.role}`}
              key={member.user_id}
              style={s.row}
            >
              <Text style={s.rowName}>{member.profile.display_name}</Text>
              <Text style={[s.rowRole, member.role !== 'member' && s.rowRoleOwner]}>
                {ROLE_LABEL[member.role] ?? member.role}
              </Text>
            </View>
          ))
        ) : (
          <Text style={s.emptyBody}>
            {session
              ? 'La lista es visible para quienes ya son parte del grupo.'
              : 'Iniciá sesión para ver quién está.'}
          </Text>
        )}
      </View>

      {session ? (
        community.is_public || isMember ? (
          <>
            {/* Leaving also drops access to the member-only sessions and to the
                roll above, which the word "Salir" does not say. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={busy ? 'Un momento…' : isMember ? 'Salir del grupo' : 'Unirme'}
              accessibilityHint={
                isMember
                  ? 'Dejás de ser parte del grupo y perdés acceso a sus sesiones para miembros.'
                  : undefined
              }
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={toggle}
              style={[isMember ? s.secondary : s.primary, busy && s.primaryDisabled]}
            >
              <Text style={isMember ? s.secondaryText : s.primaryText}>
                {busy ? 'Un momento…' : isMember ? 'Salir del grupo' : 'Unirme'}
              </Text>
            </Pressable>
            {mine?.role !== 'member' && isMember && (
              <Text style={s.hint}>
                Organizás este grupo. Las sesiones que crees pueden ser solo para miembros.
              </Text>
            )}
          </>
        ) : (
          <Text style={s.hint}>Este grupo es solo por invitación.</Text>
        )
      ) : (
        <Link href="/sign-in" style={s.back}>
          <Text style={s.linkText}>Iniciá sesión para unirte</Text>
        </Link>
      )}
    </ScrollView>
  );
}
