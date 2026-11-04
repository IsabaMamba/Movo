/**
 * A single group: what it is, its rules, who is in it, and the one action
 * that matters — joining or leaving.
 *
 * Layout from the 2 November walkthrough (step 12, Grupos v1): a coloured
 * band with back and share, the group's tile and name with sport · people ·
 * «organizas», then three tabs — Sesiones, Personas, Reglas — and the join
 * or leave button at the bottom.
 *
 * The member list is visible only to members, which the read policy enforces.
 * A visitor sees the group and its rules but not the roll, and is told so
 * rather than shown an empty list that looks like nobody is there.
 */

import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import {
  fetchCategories,
  fetchCommunity,
  fetchCommunityMembers,
  joinCommunity,
  leaveCommunity,
  type CommunityMemberEntry,
} from '../../lib/activities';
import {
  fetchGroupUpcoming,
  groupInitials,
  groupSports,
  roleWord,
  type GroupSession,
} from '../../lib/groups';
import { supabase } from '../../lib/supabase';
import { color, hitSlopFor } from '../../theme';
import { sportColor } from '../../theme/sport';
import type { Category, Community } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import { dateColumn } from '../discover/format';
import { Icon } from '../nav/Icon';
import { gruposStyles as s } from './styles';

const ROLE_LABEL: Record<string, string> = {
  owner: 'Administra',
  organizer: 'Organiza',
  member: 'Miembro',
};

type Tab = 'sesiones' | 'personas' | 'reglas';

export function GrupoDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { session } = useAuth();
  const router = useRouter();

  const [community, setCommunity] = useState<Community | null | undefined>(undefined);
  const [members, setMembers] = useState<CommunityMemberEntry[]>([]);
  const [sessions, setSessions] = useState<GroupSession[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('sesiones');

  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!slug) return;
    const found = await fetchCommunity(supabase, slug);
    setCommunity(found);
    if (!found) return;

    // Members-only by policy: a non-member legitimately gets nothing back.
    const [roll, upcoming] = await Promise.all([
      fetchCommunityMembers(supabase, found.id).catch((): CommunityMemberEntry[] => []),
      fetchGroupUpcoming(supabase, found.id).catch((): GroupSession[] => []),
    ]);
    setMembers(roll);
    setSessions(upcoming);
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

  useEffect(() => {
    void fetchCategories(supabase)
      .then(setCategories)
      .catch(() => undefined);
  }, []);

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
  const tint = sportColor(community.category_id ?? '', color.accent.primary);
  // Every sport of the group (0037), in its order: «Running, Trail running».
  const sport =
    groupSports(community)
      .map((id) => categories.find((c) => c.id === id)?.name_es)
      .filter(Boolean)
      .join(', ') || null;
  const facts = [
    sport,
    members.length > 0
      ? `${members.length} ${members.length === 1 ? 'persona' : 'personas'}`
      : null,
    roleWord(mine?.role),
  ]
    .filter(Boolean)
    .join(' · ');

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

  const share = () => {
    const text = `Mira el grupo ${community.name} en Movo.`;
    if (Platform.OS === 'web') {
      const nav = globalThis.navigator as Navigator | undefined;
      if (nav?.share) void nav.share({ text }).catch(() => undefined);
      else void nav?.clipboard?.writeText(text).catch(() => undefined);
      return;
    }
    void Share.share({ message: text });
  };

  return (
    <ScrollView contentContainerStyle={s.detailContent} style={s.screen}>
      <View style={[s.hero, { backgroundColor: tint }]}>
        {/* The board's band: the group's colour into dusk, with a few contour
            lines — a hint of terrain, not a map. */}
        <Svg
          height="100%"
          preserveAspectRatio="none"
          style={s.heroArt}
          viewBox="0 0 390 120"
          width="100%"
        >
          <Defs>
            <LinearGradient id="hero" x1="0" x2="1" y1="1" y2="0">
              <Stop offset="0" stopColor="#3B2A6B" />
              <Stop offset="0.55" stopColor="#8A3F7A" />
              <Stop offset="1" stopColor={tint} />
            </LinearGradient>
          </Defs>
          <Rect fill="url(#hero)" height="120" width="390" />
          {[30, 55, 80].map((y) => (
            <Path
              d={`M0 ${y} C 80 ${y - 18}, 160 ${y + 18}, 240 ${y} S 360 ${y - 14}, 390 ${y + 4}`}
              fill="none"
              key={y}
              stroke="#FFFFFF"
              strokeOpacity={0.14}
              strokeWidth={1.2}
            />
          ))}
        </Svg>
        <View style={s.heroShade} />
        <View style={s.heroBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver a Grupos"
            hitSlop={hitSlopFor(32)}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/grupos');
            }}
          >
            <Icon color={color.text.primary} name="back" size={22} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Compartir el grupo"
            hitSlop={hitSlopFor(32)}
            onPress={share}
          >
            <Icon color={color.text.primary} name="share" size={20} />
          </Pressable>
        </View>
      </View>

      <View style={s.detailBody}>
        <View style={s.identity}>
          <View aria-hidden style={[s.tileBig, { backgroundColor: tint }]}>
            <Text style={s.tileTextBig}>{groupInitials(community.name)}</Text>
          </View>
          <View style={s.cardText}>
            <Text accessibilityRole="header" style={s.groupName}>
              {community.name}
            </Text>
            <View style={s.factsRow}>
              {community.category_id && <View style={[s.dot, { backgroundColor: tint }]} />}
              <Text style={s.cardFacts}>
                {facts || (community.is_public ? 'Grupo abierto' : 'Solo invitados')}
              </Text>
            </View>
          </View>
        </View>

        {community.description ? <Text style={s.cardBody}>{community.description}</Text> : null}

        <View accessibilityRole="tablist" style={s.tabs}>
          {(
            [
              ['sesiones', 'Sesiones'],
              ['personas', 'Personas'],
              ['reglas', 'Reglas'],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              accessibilityRole="tab"
              aria-selected={tab === value}
              key={value}
              onPress={() => {
                setTab(value);
              }}
              style={[s.tab, tab === value && s.tabOn]}
            >
              <Text style={[s.tabText, tab === value && s.tabTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'sesiones' &&
          (sessions.length > 0 ? (
            <View>
              {sessions.map((item) => {
                const when = dateColumn(item.starts_at);
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${item.title}, ${when.weekday} ${when.day} ${when.time}`}
                    key={item.id}
                    onPress={() => {
                      router.push({ pathname: '/sesion/[id]', params: { id: item.id } });
                    }}
                    style={s.sessionRow}
                  >
                    <View style={s.sessionDate}>
                      <Text style={s.sessionWeekday}>
                        {when.weekday} {when.day.split(' ')[0]}
                      </Text>
                      <Text style={s.sessionTime}>{when.time}</Text>
                    </View>
                    <View style={s.cardText}>
                      <Text numberOfLines={1} style={s.rowTitle}>
                        {item.title}
                      </Text>
                      <Text style={s.rowMeta}>
                        {[
                          item.series_id ? 'Serie' : null,
                          item.max_participants
                            ? `${item.joined_count} de ${item.max_participants}`
                            : `${item.joined_count} ${item.joined_count === 1 ? 'va' : 'van'}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                      {item.visibility === 'community' && (
                        <View style={s.groupOnly}>
                          <Icon color={color.accent.cool} name="lock" size={12} />
                          <Text style={s.groupOnlyText}>Solo el grupo</Text>
                        </View>
                      )}
                    </View>
                    <View
                      style={[s.sessionBar, { backgroundColor: sportColor(item.category_id) }]}
                    />
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={s.emptyBody}>
              {isMember || community.is_public
                ? 'Este grupo no tiene sesiones próximas.'
                : 'Las sesiones de este grupo son solo para quienes son parte.'}
            </Text>
          ))}

        {tab === 'personas' && (
          <View
            accessibilityRole={members.length > 0 ? 'list' : undefined}
            accessibilityLabel={
              members.length > 0
                ? `Quién está: ${members.length} ${members.length === 1 ? 'persona' : 'personas'}`
                : undefined
            }
          >
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
                  : 'Inicia sesión para ver quién está.'}
              </Text>
            )}
          </View>
        )}

        {tab === 'reglas' && (
          <View style={s.rules}>
            <Text style={s.rulesLabel}>Reglas del grupo</Text>
            <Text style={s.rulesText}>
              {community.rules ?? 'Este grupo no tiene reglas propias.'}
            </Text>
            <Text style={s.hint}>Se suman a las normas de la comunidad de Movo.</Text>
            <Link href="/normas" style={s.back}>
              <Text style={s.linkText}>Leer las normas de Movo</Text>
            </Link>
          </View>
        )}

        {error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}

        {session ? (
          community.is_public || isMember ? (
            <>
              {/* Leaving also drops access to the member-only sessions and to
                  the roll, which the word «Salir» does not say. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={busy ? 'Un momento…' : isMember ? 'Salir del grupo' : 'Unirme'}
                accessibilityHint={
                  isMember
                    ? 'Dejas de ser parte del grupo y pierdes acceso a sus sesiones para miembros.'
                    : undefined
                }
                aria-disabled={busy}
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
                  Organizas este grupo. Las sesiones que crees pueden ser solo para miembros.
                </Text>
              )}
            </>
          ) : (
            <Text style={s.hint}>Este grupo es solo por invitación.</Text>
          )
        ) : (
          <Link href="/sign-in" asChild>
            <Pressable accessibilityRole="link" style={s.primary}>
              <Text style={s.primaryText}>Inicia sesión para unirte</Text>
            </Pressable>
          </Link>
        )}
      </View>
    </ScrollView>
  );
}
