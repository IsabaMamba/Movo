/**
 * Ajustes del grupo (Grupos v6 · 5), for whoever organizes.
 *
 * El grupo: name, what it is about, up to three sports and the rules.
 * Chat del grupo: who writes. Quién entra: open or by invitation, and who
 * organizes. Everything here is a write the policies already allow an
 * organizer (0003, 0037, 0040); handing the group over and deleting it need
 * functions of their own and are not here yet.
 */

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import {
  fetchCategories,
  fetchCommunity,
  fetchCommunityMembers,
  type CommunityMemberEntry,
} from '../../lib/activities';
import { setChatMode, type ChatMode } from '../../lib/chat';
import {
  groupEditProblem,
  groupSports,
  MAX_GROUP_SPORTS,
  setMemberRole,
  toggleSport,
  updateGroup,
} from '../../lib/groups';
import { supabase } from '../../lib/supabase';
import { color, hitSlopFor, size } from '../../theme';
import { sportColor } from '../../theme/sport';
import type { Category, Community } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import { Icon } from '../nav/Icon';
import { gruposStyles as s } from './styles';

const HIT_SLOP = hitSlopFor(size.controlSm);

export function GroupSettingsScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { session, loading } = useAuth();
  const router = useRouter();

  const [group, setGroup] = useState<Community | null | undefined>(undefined);
  const [members, setMembers] = useState<CommunityMemberEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState('');
  const [sports, setSports] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!slug) return;
    const found = await fetchCommunity(supabase, slug);
    setGroup(found);
    if (!found) return;
    setName(found.name);
    setDescription(found.description ?? '');
    setRules(found.rules ?? '');
    setSports(groupSports(found));
    setIsPublic(found.is_public);
    setMembers(await fetchCommunityMembers(supabase, found.id).catch(() => []));
  }, [slug]);

  useEffect(() => {
    load().catch((cause: unknown) => {
      setGroup(null);
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el grupo.');
    });
    void fetchCategories(supabase)
      .then(setCategories)
      .catch(() => undefined);
  }, [load]);

  if (loading || group === undefined) return <ActivityIndicator style={s.screen} />;
  if (!session) return <Redirect href="/sign-in" />;

  const me = members.find((m) => m.user_id === session.user.id);
  const organizes = me?.role === 'owner' || me?.role === 'organizer';

  if (group === null || !organizes) {
    return (
      <ScrollView contentContainerStyle={s.content} style={s.screen}>
        <Text style={s.error}>
          {error ?? 'Solo quien organiza el grupo puede cambiar sus ajustes.'}
        </Text>
      </ScrollView>
    );
  }

  const problem = groupEditProblem({ name, categoryIds: sports });

  const run = (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    work()
      .then(() => load())
      .then(() => {
        setNotice(done);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo guardar.');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const save = () => {
    if (problem || busy) return;
    run(
      () =>
        updateGroup(supabase, group.id, {
          name,
          description,
          rules,
          categoryIds: sports,
          isPublic,
        }),
      'Guardado.',
    );
  };

  const changeMode = (mode: ChatMode) => {
    run(
      () => setChatMode(supabase, group.id, mode),
      mode === 'organizers'
        ? 'Ahora solo quienes organizan escriben en el chat.'
        : 'Ahora todo el grupo escribe en el chat.',
    );
  };

  const changeRole = (person: CommunityMemberEntry, role: 'member' | 'organizer') => {
    run(
      () => setMemberRole(supabase, group.id, person.user_id, role),
      role === 'organizer'
        ? `${person.profile.display_name} ahora organiza.`
        : `${person.profile.display_name} ya no organiza.`,
    );
  };

  const choice = <T extends string | boolean>(
    value: T,
    current: T,
    label: string,
    onPress: () => void,
  ) => {
    const on = value === current;
    return (
      <Pressable
        accessibilityRole="radio"
        aria-checked={on}
        aria-disabled={busy}
        disabled={busy}
        hitSlop={HIT_SLOP}
        key={String(value)}
        onPress={onPress}
        style={[s.filterChip, on && s.filterChipOn]}
      >
        <Text style={[s.filterChipText, on && s.filterChipTextOn]}>
          {on ? '✓ ' : ''}
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <ScrollView aria-busy={busy} contentContainerStyle={s.content} style={s.screen}>
      <View style={s.settingsTop}>
        <Pressable
          accessibilityLabel="Volver al grupo"
          accessibilityRole="button"
          hitSlop={HIT_SLOP}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace({ pathname: '/grupos/[slug]', params: { slug: group.slug } });
          }}
        >
          <Icon color={color.text.primary} name="back" size={22} />
        </Pressable>
        <View style={s.cardText}>
          <Text accessibilityRole="header" style={s.settingsTitle}>
            Ajustes del grupo
          </Text>
          <Text style={s.hint}>{group.name}</Text>
        </View>
      </View>

      {notice !== null && (
        <Text accessibilityRole="alert" style={s.settingsNotice}>
          {notice}
        </Text>
      )}
      {error !== null && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}

      {/* ---------------------------------------------------- El grupo */}
      <Text style={s.overline}>EL GRUPO</Text>
      <View style={s.field}>
        <Text style={s.label}>Nombre</Text>
        <TextInput
          accessibilityLabel="Nombre del grupo"
          maxLength={80}
          onChangeText={setName}
          style={s.input}
          value={name}
        />
        <Text style={s.hint}>El enlace del grupo no cambia.</Text>
      </View>
      <View style={s.field}>
        <Text style={s.label}>De qué se trata</Text>
        <TextInput
          accessibilityLabel="De qué se trata el grupo"
          multiline
          onChangeText={setDescription}
          style={[s.input, { minHeight: 88 }]}
          value={description}
        />
      </View>
      <View style={s.field}>
        <View style={s.labelRow}>
          <Text style={s.label}>Deporte</Text>
          <Text style={s.hint}>
            {sports.length}/{MAX_GROUP_SPORTS}
          </Text>
        </View>
        <View accessibilityLabel="Deportes del grupo, hasta tres" style={s.chipRow}>
          {categories.map((cat) => {
            const on = sports.includes(cat.id);
            const full = !on && sports.length >= MAX_GROUP_SPORTS;
            return (
              <Pressable
                accessibilityLabel={cat.name_es}
                accessibilityRole="checkbox"
                aria-checked={on}
                aria-disabled={full}
                disabled={full}
                hitSlop={HIT_SLOP}
                key={cat.id}
                onPress={() => {
                  setSports((current) => toggleSport(current, cat.id));
                }}
                style={[s.filterChip, on && s.filterChipOn, full && s.chipFull]}
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
        <Text style={s.hint}>La marca del grupo toma el color de su primer deporte.</Text>
      </View>
      <View style={s.field}>
        <Text style={s.label}>Reglas del grupo</Text>
        <TextInput
          accessibilityLabel="Reglas del grupo"
          multiline
          onChangeText={setRules}
          placeholder="Puntualidad: salimos a la hora. Nadie se queda atrás."
          placeholderTextColor={color.text.tertiary}
          style={[s.input, { minHeight: 88 }]}
          value={rules}
        />
        <Text style={s.hint}>Se suman a las normas de Movo, no las reemplazan.</Text>
      </View>

      {/* ---------------------------------------------------- Quién entra */}
      <Text style={s.overline}>QUIÉN ENTRA</Text>
      <View style={s.field}>
        <Text style={s.label}>Quién puede entrar</Text>
        <View
          accessibilityLabel="Quién puede entrar"
          accessibilityRole="radiogroup"
          style={s.chipRow}
        >
          {choice(true, isPublic, 'Cualquiera', () => {
            setIsPublic(true);
          })}
          {choice(false, isPublic, 'Con invitación', () => {
            setIsPublic(false);
          })}
        </View>
        <Text style={s.hint}>
          {isPublic
            ? 'Aparece en Grupos y cualquiera se puede unir.'
            : 'No aparece en búsquedas ni en «Cerca de ti». Hasta que llegue el enlace de invitación, nadie nuevo puede entrar.'}
        </Text>
      </View>

      <Pressable
        accessibilityLabel={busy ? 'Guardando' : 'Guardar los cambios del grupo'}
        accessibilityRole="button"
        aria-disabled={busy || problem !== null}
        disabled={busy || problem !== null}
        onPress={save}
        style={[s.primary, (busy || problem !== null) && s.primaryDisabled]}
      >
        <Text style={s.primaryText}>{busy ? 'Guardando…' : 'Guardar'}</Text>
      </Pressable>
      {problem && <Text style={s.hint}>{problem}</Text>}

      <View style={s.field}>
        <Text style={s.label}>Quiénes organizan</Text>
        <Text style={s.hint}>Quien organiza crea sesiones para el grupo y modera su chat.</Text>
        {members.map((person) => {
          const owner = person.role === 'owner';
          const organizer = person.role === 'organizer';
          return (
            <View key={person.user_id} style={s.memberRow}>
              <View style={s.cardText}>
                <Text style={s.rowTitle}>
                  {person.profile.display_name}
                  {person.user_id === session.user.id ? ' (tú)' : ''}
                </Text>
                <Text style={s.rowMeta}>
                  {owner ? 'Creó el grupo' : organizer ? 'Organiza' : 'Miembro'}
                </Text>
              </View>
              {!owner && (
                <Pressable
                  accessibilityLabel={
                    organizer
                      ? `Quitarle a ${person.profile.display_name} que organice`
                      : `Hacer que ${person.profile.display_name} organice`
                  }
                  accessibilityRole="button"
                  disabled={busy}
                  hitSlop={HIT_SLOP}
                  onPress={() => {
                    changeRole(person, organizer ? 'member' : 'organizer');
                  }}
                  style={s.filterChip}
                >
                  <Text style={s.filterChipText}>
                    {organizer ? 'Quitar' : 'Hacer que organice'}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>

      {/* ---------------------------------------------------- Chat */}
      <Text style={s.overline}>CHAT DEL GRUPO</Text>
      <View style={s.field}>
        <Text style={s.label}>Quién escribe</Text>
        <View
          accessibilityLabel="Quién escribe en el chat"
          accessibilityRole="radiogroup"
          style={s.chipRow}
        >
          {choice<ChatMode>('everyone', group.chat_mode, 'Todo el grupo', () => {
            if (group.chat_mode !== 'everyone') changeMode('everyone');
          })}
          {choice<ChatMode>('organizers', group.chat_mode, 'Solo quienes organizan', () => {
            if (group.chat_mode !== 'organizers') changeMode('organizers');
          })}
        </View>
        <Text style={s.hint}>
          {group.chat_mode === 'organizers'
            ? 'Todo el grupo lee; solo quienes organizan escriben. Sirve para avisos.'
            : 'Todo el grupo lee y escribe. Para fijar un mensaje o quitarlo, mantenlo presionado en el chat.'}
        </Text>
      </View>
    </ScrollView>
  );
}
