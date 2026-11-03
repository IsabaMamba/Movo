/**
 * Grupos — the list, and creating one.
 *
 * People name themselves before they organise anything: Mejengueros, Real
 * Madrid Ticos. The schema has modelled that since the foundation and nothing
 * has ever written a row.
 *
 * Public groups are readable by anyone, including signed-out visitors, because
 * the read policy allows it — a stranger should be able to see that a club
 * exists before deciding to join.
 *
 * Layout from the 2 November walkthrough (step 11, Grupos v1): search and «+»
 * in the header, «Tus grupos» with each group's next session, then the open
 * groups with a sport filter and how many sessions they have this week.
 */

import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import {
  createCommunity,
  fetchCategories,
  fetchCommunities,
  formatSessionTime,
  slugify,
  type CommunityWithCount,
} from '../../lib/activities';
import {
  fetchGroupSessions,
  fetchMyGroupRoles,
  groupAgenda,
  groupInitials,
  roleWord,
  type GroupAgenda,
  type GroupRole,
} from '../../lib/groups';
import { supabase } from '../../lib/supabase';
import { color, hitSlopFor, size } from '../../theme';
import { sportColor } from '../../theme/sport';
import type { Category } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import { Icon } from '../nav/Icon';
import { gruposStyles as s } from './styles';

/**
 * The visibility chips render at `size.controlSm` (36px), so the target is
 * padded back up to 44 without changing how big the chips look.
 */
const CHIP_HIT_SLOP = hitSlopFor(size.controlSm);

export function GruposScreen() {
  const { session } = useAuth();
  const router = useRouter();

  const [communities, setCommunities] = useState<CommunityWithCount[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [roles, setRoles] = useState<Map<string, GroupRole>>(new Map());
  const [agenda, setAgenda] = useState<Map<string, GroupAgenda>>(new Map());
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [sport, setSport] = useState<string | null>(null);

  const load = () => {
    fetchCommunities(supabase, session !== null)
      .then(async (rows) => {
        setCommunities(rows);
        // The extras of the walkthrough's list. Allowed to fail quietly: the
        // groups themselves are what the screen is for.
        const [mine, sessions] = await Promise.all([
          session ? fetchMyGroupRoles(supabase, session.user.id).catch(() => new Map()) : new Map(),
          fetchGroupSessions(
            supabase,
            rows.map((r) => r.id),
          ).catch(() => []),
        ]);
        setRoles(mine as Map<string, GroupRole>);
        setAgenda(groupAgenda(sessions));
      })
      .catch((cause: unknown) => {
        setCommunities([]);
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los grupos.');
      });
  };

  useEffect(load, [session]);
  useEffect(() => {
    void fetchCategories(supabase)
      .then(setCategories)
      .catch(() => undefined);
  }, []);

  const slug = slugify(name);
  const canCreate = !busy && name.trim().length >= 2 && slug.length >= 2;

  const submit = () => {
    if (!canCreate || !session) return;
    setBusy(true);
    setError(null);
    createCommunity(supabase, session.user.id, { name, slug, description, isPublic })
      .then((community) => {
        setCreating(false);
        setName('');
        setDescription('');
        router.push({ pathname: '/grupos/[slug]', params: { slug: community.slug } });
      })
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? // The slug is unique; the constraint message is not a sentence.
              /duplicate|unique/i.test(cause.message)
              ? 'Ya existe un grupo con ese nombre. Prueba otro.'
              : cause.message
            : 'No se pudo crear el grupo.',
        );
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const createForm = (
    <View style={{ gap: 12 }}>
      <View style={s.field}>
        <Text style={s.label}>Nombre</Text>
        <TextInput
          accessibilityLabel="Nombre del grupo"
          maxLength={80}
          onChangeText={setName}
          placeholder="Mejengueros"
          placeholderTextColor={color.text.tertiary}
          style={s.input}
          value={name}
        />
        {slug.length > 0 && <Text style={s.hint}>movo.cr/grupos/{slug}</Text>}
      </View>

      <View style={s.field}>
        <Text style={s.label}>De qué se trata</Text>
        <TextInput
          accessibilityLabel="De qué se trata el grupo"
          multiline
          onChangeText={setDescription}
          placeholder="Partido los jueves en La Sabana, 7v7, todos los niveles."
          placeholderTextColor={color.text.tertiary}
          style={[s.input, { minHeight: 88 }]}
          value={description}
        />
      </View>

      <View style={s.field}>
        <Text style={s.label}>Quién puede entrar</Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Quién puede entrar"
          style={s.chipRow}
        >
          <Pressable
            accessibilityRole="radio"
            accessibilityLabel="Cualquiera puede entrar"
            aria-checked={isPublic}
            hitSlop={CHIP_HIT_SLOP}
            onPress={() => {
              setIsPublic(true);
            }}
            style={[s.chip, isPublic && s.chipOn]}
          >
            <Text style={[s.chipText, isPublic && s.chipTextOn]}>Cualquiera</Text>
          </Pressable>
          <Pressable
            accessibilityRole="radio"
            accessibilityLabel="Solo invitados"
            aria-checked={!isPublic}
            hitSlop={CHIP_HIT_SLOP}
            onPress={() => {
              setIsPublic(false);
            }}
            style={[s.chip, !isPublic && s.chipOn]}
          >
            <Text style={[s.chipText, !isPublic && s.chipTextOn]}>Solo invitados</Text>
          </Pressable>
        </View>
        <Text style={s.hint}>
          {isPublic
            ? 'Aparece aquí y cualquiera se puede unir.'
            : 'No aparece en la lista. Solo quien ya es parte lo ve.'}
        </Text>
      </View>

      {/* Disabled, the button gives no reason on screen either; the hint
                is the only place the requirement is stated. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={busy ? 'Creando…' : 'Crear grupo'}
        accessibilityHint={
          canCreate ? undefined : 'Escribe un nombre de al menos dos letras para continuar.'
        }
        aria-disabled={!canCreate}
        disabled={!canCreate}
        onPress={submit}
        style={[s.primary, !canCreate && s.primaryDisabled]}
      >
        <Text style={s.primaryText}>{busy ? 'Creando…' : 'Crear grupo'}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancelar"
        accessibilityHint="Cierra el formulario sin crear el grupo."
        onPress={() => {
          setCreating(false);
        }}
        style={s.secondary}
      >
        <Text style={s.secondaryText}>Cancelar</Text>
      </Pressable>
    </View>
  );

  const q = query.trim().toLowerCase();
  const visible = (communities ?? []).filter(
    (c) =>
      (q === '' || c.name.toLowerCase().includes(q)) && (sport === null || c.category_id === sport),
  );
  const mine = visible.filter((c) => roles.has(c.id));
  const others = visible.filter((c) => !roles.has(c.id));
  const sportsShown = categories.filter((cat) =>
    (communities ?? []).some((c) => !roles.has(c.id) && c.category_id === cat.id),
  );
  const sportOf = (id: string | null) => categories.find((c) => c.id === id)?.name_es ?? null;

  const tile = (community: CommunityWithCount, big = false) => (
    <View
      aria-hidden
      style={[
        big ? s.tileBig : s.tile,
        { backgroundColor: sportColor(community.category_id ?? '', color.accent.primary) },
      ]}
    >
      <Text style={big ? s.tileTextBig : s.tileText}>{groupInitials(community.name)}</Text>
    </View>
  );

  const people = (community: CommunityWithCount) =>
    community.member_count === null
      ? null
      : `${community.member_count} ${community.member_count === 1 ? 'persona' : 'personas'}`;

  const open = (community: CommunityWithCount) => {
    router.push({ pathname: '/grupos/[slug]', params: { slug: community.slug } });
  };

  return (
    <ScrollView contentContainerStyle={s.content} style={s.screen}>
      <View style={s.headerRow}>
        <Text accessibilityRole="header" style={s.title}>
          Grupos
        </Text>
        <View style={s.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={searching ? 'Cerrar la búsqueda' : 'Buscar un grupo'}
            hitSlop={CHIP_HIT_SLOP}
            onPress={() => {
              setSearching(!searching);
              setQuery('');
            }}
            style={s.iconButton}
          >
            <Icon color={color.text.primary} name="search" size={22} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={session ? 'Crear un grupo' : 'Inicia sesión para crear un grupo'}
            hitSlop={CHIP_HIT_SLOP}
            onPress={() => {
              if (!session) router.push('/sign-in');
              else setCreating(!creating);
            }}
            style={s.iconButton}
          >
            <Icon color={color.text.primary} name="plus" size={24} />
          </Pressable>
        </View>
      </View>

      {searching && (
        <TextInput
          accessibilityLabel="Buscar un grupo por nombre"
          autoFocus
          onChangeText={setQuery}
          placeholder="Busca un grupo"
          placeholderTextColor={color.text.tertiary}
          style={s.input}
          value={query}
        />
      )}

      {session && creating && createForm}

      {error !== null && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}

      {communities === null ? (
        <ActivityIndicator />
      ) : communities.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.sectionTitle}>Todavía no hay grupos</Text>
          <Text style={s.emptyBody}>
            El primero puede ser el tuyo. Un grupo es un nombre, unas reglas y la gente que aparece.
          </Text>
        </View>
      ) : (
        <>
          {mine.length > 0 && (
            <View style={s.section}>
              <Text style={s.overline}>TUS GRUPOS · {mine.length}</Text>
              {mine.map((community) => {
                const next = agenda.get(community.id)?.next ?? null;
                const facts = [
                  sportOf(community.category_id),
                  people(community),
                  roleWord(roles.get(community.id)),
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <Pressable
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={[
                      community.name,
                      facts,
                      next ? `Próxima: ${next.title}` : null,
                    ]
                      .filter(Boolean)
                      .join('. ')}
                    key={community.id}
                    onPress={() => {
                      open(community);
                    }}
                    style={s.myCard}
                  >
                    <View style={s.myTop}>
                      {tile(community, true)}
                      <View style={s.cardText}>
                        <Text numberOfLines={1} style={s.cardTitle}>
                          {community.name}
                        </Text>
                        <View style={s.factsRow}>
                          {community.category_id && (
                            <View
                              style={[
                                s.dot,
                                { backgroundColor: sportColor(community.category_id) },
                              ]}
                            />
                          )}
                          <Text numberOfLines={1} style={s.cardFacts}>
                            {facts}
                          </Text>
                        </View>
                      </View>
                      <Icon color={color.text.tertiary} name="chevronRight" size={18} />
                    </View>
                    <View style={s.nextRow}>
                      <Icon color={color.accent.cool} name="calendar" size={16} />
                      <Text numberOfLines={2} style={s.nextText}>
                        {next
                          ? `Próxima: ${formatSessionTime(next.starts_at)} · ${next.title}`
                          : 'Sin sesiones próximas.'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {others.length > 0 && (
            <View style={s.section}>
              <View style={s.sectionHead}>
                <Text style={s.overline}>{session ? 'MÁS GRUPOS' : 'GRUPOS'}</Text>
                <Text style={s.overlineHint}>Grupos abiertos</Text>
              </View>
              {sportsShown.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View accessibilityRole="radiogroup" style={s.filterRow}>
                    <Pressable
                      accessibilityRole="radio"
                      aria-checked={sport === null}
                      hitSlop={CHIP_HIT_SLOP}
                      onPress={() => {
                        setSport(null);
                      }}
                      style={[s.filterChip, sport === null && s.filterChipOn]}
                    >
                      <Text style={[s.filterChipText, sport === null && s.filterChipTextOn]}>
                        {sport === null ? '✓ ' : ''}Todos
                      </Text>
                    </Pressable>
                    {sportsShown.map((cat) => {
                      const on = sport === cat.id;
                      return (
                        <Pressable
                          accessibilityRole="radio"
                          aria-checked={on}
                          hitSlop={CHIP_HIT_SLOP}
                          key={cat.id}
                          onPress={() => {
                            setSport(on ? null : cat.id);
                          }}
                          style={[s.filterChip, on && s.filterChipOn]}
                        >
                          {!on && <View style={[s.dot, { backgroundColor: sportColor(cat.id) }]} />}
                          <Text style={[s.filterChipText, on && s.filterChipTextOn]}>
                            {on ? '✓ ' : ''}
                            {cat.name_es}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              )}
              <View style={s.list}>
                {others.map((community) => {
                  const week = agenda.get(community.id)?.thisWeek ?? 0;
                  const second = [
                    people(community),
                    week > 0 ? `${week} esta semana` : null,
                    community.is_public ? null : 'solo invitados',
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <Pressable
                      accessible
                      accessibilityRole="button"
                      accessibilityLabel={[
                        community.name,
                        sportOf(community.category_id),
                        second,
                        community.description,
                      ]
                        .filter(Boolean)
                        .join('. ')}
                      accessibilityHint="Abre el detalle del grupo"
                      key={community.id}
                      onPress={() => {
                        open(community);
                      }}
                      style={s.listRow}
                    >
                      {tile(community)}
                      <View style={s.cardText}>
                        <Text numberOfLines={1} style={s.rowTitle}>
                          {community.name}
                        </Text>
                        {community.category_id && (
                          <View style={s.factsRow}>
                            <View
                              style={[
                                s.dot,
                                { backgroundColor: sportColor(community.category_id) },
                              ]}
                            />
                            <Text style={s.cardFacts}>{sportOf(community.category_id)}</Text>
                          </View>
                        )}
                        {second ? <Text style={s.rowMeta}>{second}</Text> : null}
                        {!community.category_id && community.description ? (
                          <Text numberOfLines={1} style={s.rowMeta}>
                            {community.description}
                          </Text>
                        ) : null}
                      </View>
                      <Icon color={color.text.tertiary} name="chevronRight" size={18} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {visible.length === 0 && (
            <Text style={s.emptyBody}>Ningún grupo coincide con la búsqueda.</Text>
          )}

          {!session && (
            <Link href="/sign-in" style={s.back}>
              <Text style={s.linkText}>Inicia sesión para crear o unirte a un grupo</Text>
            </Link>
          )}
        </>
      )}
    </ScrollView>
  );
}
