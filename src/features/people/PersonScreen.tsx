/**
 * Somebody else's profile (Perfiles v1 · 1, 2, 7).
 *
 * What helps decide whether to go with them — since when, their sports and
 * level, what they organize, their public groups — and nothing about where
 * they live or what they did. «⋯» shares, reports or blocks, in that order.
 * Somebody you blocked shows only that, with «Desbloquear».
 */

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  createReport,
  fetchCategories,
  formatSessionTime,
  reportReasonsFor,
  type ReportReason,
} from '../../lib/activities';
import { blockPerson, fetchBlockedPeople, unblockPerson } from '../../lib/blocks';
import { fetchPerson, memberSince, type Person } from '../../lib/people';
import { initials, levelLabel } from '../../lib/profile';
import { supabase } from '../../lib/supabase';
import { color, hitSlopFor, size } from '../../theme';
import { sportColor } from '../../theme/sport';
import type { Category } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import { Icon } from '../nav/Icon';
import { personStyles as s } from './styles';

type Sheet = null | 'menu' | 'report';

export function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, loading } = useAuth();
  const router = useRouter();

  const [person, setPerson] = useState<Person | null | undefined>(undefined);
  const [blocked, setBlocked] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [found, mine] = await Promise.all([
      fetchPerson(supabase, id),
      fetchBlockedPeople(supabase).catch(() => []),
    ]);
    setBlocked(mine.some((b) => b.id === id));
    setPerson(found);
  }, [id]);

  useEffect(() => {
    if (!session) return;
    load().catch(() => {
      setPerson(null);
    });
    void fetchCategories(supabase)
      .then(setCategories)
      .catch(() => undefined);
  }, [load, session]);

  if (loading) return <ActivityIndicator style={s.screen} />;
  if (!session) return <Redirect href="/sign-in" />;
  if (id === session.user.id) return <Redirect href="/perfil/publico" />;

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const run = (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    work()
      .then(() => load())
      .then(() => {
        setNotice(done);
        setSheet(null);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo hacer eso.');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const topBar = (
    <View style={s.topBar}>
      <Pressable
        accessibilityLabel="Volver"
        accessibilityRole="button"
        hitSlop={hitSlopFor(size.controlSm)}
        onPress={back}
      >
        <Icon color={color.text.primary} name="back" size={22} />
      </Pressable>
      {person && !blocked && (
        <Pressable
          accessibilityLabel="Más opciones"
          accessibilityRole="button"
          hitSlop={hitSlopFor(size.controlSm)}
          onPress={() => {
            setSheet('menu');
          }}
        >
          <Icon color={color.text.primary} name="more" size={22} />
        </Pressable>
      )}
    </View>
  );

  if (person === undefined) return <ActivityIndicator style={s.screen} />;

  if (person === null) {
    return (
      <ScrollView contentContainerStyle={s.content} style={s.screen}>
        {topBar}
        <Text style={s.empty}>
          No puedes ver este perfil. Se ven los perfiles de quienes organizan sesiones públicas y de
          quienes comparten una sesión o un grupo contigo.
        </Text>
      </ScrollView>
    );
  }

  const name = person.displayName;

  if (blocked) {
    return (
      <ScrollView contentContainerStyle={s.content} style={s.screen}>
        {topBar}
        <View style={s.blockedBox}>
          <Icon color={color.text.secondary} name="hand" size={36} />
          <Text accessibilityRole="header" style={s.name}>
            Bloqueaste a {name}
          </Text>
          <Text style={s.muted}>
            No ves su perfil ni sus sesiones, y no ve los tuyos. No sabe que lo bloqueaste.
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              run(
                () => unblockPerson(supabase, person.id),
                `Desbloqueaste a ${name}. No le avisamos.`,
              );
            }}
            style={s.secondary}
          >
            <Text style={s.secondaryText}>Desbloquear</Text>
          </Pressable>
          <Text style={s.small}>Si lo desbloqueas, no le avisamos.</Text>
        </View>
      </ScrollView>
    );
  }

  const share = () => {
    const url =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? `${window.location.origin}/persona/${person.id}`
        : `/persona/${person.id}`;
    const text = `${name} en Movo: ${url}`;
    setSheet(null);
    if (Platform.OS === 'web') {
      const nav = globalThis.navigator as Navigator | undefined;
      if (nav?.share) {
        void nav.share({ text }).catch(() => undefined);
        return;
      }
      void nav?.clipboard?.writeText(url).then(() => {
        setNotice('Copiamos el enlace. Solo lo abre quien tiene cuenta.');
      });
      return;
    }
    void Share.share({ message: text });
  };

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.content}>
        {topBar}

        <View style={s.identity}>
          <View aria-hidden style={s.avatar}>
            <Text style={s.avatarText}>{initials(name)}</Text>
          </View>
          <Text accessibilityRole="header" style={s.name}>
            {name}
          </Text>
          <Text style={s.muted}>{memberSince(person.createdAt)}</Text>
          {person.bio ? <Text style={s.bio}>{person.bio}</Text> : null}
        </View>

        {notice !== null && (
          <Text accessibilityRole="alert" style={s.notice}>
            {notice}
          </Text>
        )}
        {error !== null && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}

        {person.sports.length > 0 && (
          <View style={s.section}>
            <Text style={s.overline}>SUS DEPORTES</Text>
            <View style={s.chips}>
              {person.sports.map((sport) => (
                <View key={sport.category} style={s.chip}>
                  <View style={[s.dot, { backgroundColor: sportColor(sport.category) }]} />
                  <Text style={s.chipText}>
                    {categories.find((c) => c.id === sport.category)?.name_es ?? sport.category}
                    <Text style={s.chipLevel}> · {levelLabel(sport.level)}</Text>
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {person.organizes.length > 0 && (
          <View style={s.section}>
            <Text style={s.overline}>ORGANIZA</Text>
            {person.organizes.map((a) => (
              <Pressable
                accessibilityRole="link"
                key={a.id}
                onPress={() => {
                  router.push({ pathname: '/sesion/[id]', params: { id: a.id } });
                }}
                style={s.row}
              >
                <View style={[s.bar, { backgroundColor: sportColor(a.categoryId) }]} />
                <View style={s.rowText}>
                  <Text style={s.rowTitle}>{a.title}</Text>
                  <Text style={s.small}>
                    {formatSessionTime(a.startsAt)}
                    {a.seriesId ? ' · serie' : ''}
                  </Text>
                </View>
                <Icon color={color.text.tertiary} name="chevronRight" size={16} />
              </Pressable>
            ))}
          </View>
        )}

        {person.groups.length > 0 && (
          <View style={s.section}>
            <Text style={s.overline}>GRUPOS</Text>
            {person.groups.map((g) => (
              <Pressable
                accessibilityRole="link"
                key={g.id}
                onPress={() => {
                  router.push({ pathname: '/grupos/[slug]', params: { slug: g.slug } });
                }}
                style={s.row}
              >
                <Text style={[s.rowTitle, s.rowText]}>{g.name}</Text>
                <Icon color={color.text.tertiary} name="chevronRight" size={16} />
              </Pressable>
            ))}
          </View>
        )}

        <Text style={s.small}>No se ve su zona, su historial ni nada de su cuenta.</Text>
      </ScrollView>

      {sheet !== null && (
        <View style={s.sheet}>
          {sheet === 'menu' ? (
            <>
              <Pressable accessibilityRole="button" onPress={share} style={s.sheetRow}>
                <Icon color={color.text.primary} name="share" size={18} />
                <View style={s.rowText}>
                  <Text style={s.sheetText}>Compartir su perfil</Text>
                  <Text style={s.small}>Un enlace que solo abre quien tiene cuenta</Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setReason(null);
                  setDetails('');
                  setSheet('report');
                }}
                style={s.sheetRow}
              >
                <Icon color={color.semantic.dangerOnRaised} name="alert" size={18} />
                <Text style={[s.sheetText, s.danger]}>Reportar a {name}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => {
                  run(
                    () => blockPerson(supabase, person.id),
                    `Bloqueaste a ${name}. No le avisamos.`,
                  );
                }}
                style={s.sheetRow}
              >
                <Icon color={color.semantic.dangerOnRaised} name="hand" size={18} />
                <View style={s.rowText}>
                  <Text style={[s.sheetText, s.danger]}>Bloquear a {name}</Text>
                  <Text style={s.small}>No le avisamos</Text>
                </View>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={s.sheetTitle}>
                ¿Qué pasó? Lo lee el equipo de Movo; {name} no sabe quién lo reportó.
              </Text>
              {reportReasonsFor({ womenOnly: false }).map((option) => {
                const on = reason === option.value;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    aria-checked={on}
                    key={option.value}
                    onPress={() => {
                      setReason(option.value);
                    }}
                    style={[s.option, on && s.optionOn]}
                  >
                    <View style={[s.radio, on && s.radioOn]} />
                    <Text style={s.sheetText}>{option.label}</Text>
                  </Pressable>
                );
              })}
              <TextInput
                accessibilityLabel="Cuéntanos qué pasó, opcional"
                maxLength={2000}
                multiline
                onChangeText={setDetails}
                placeholder="Cuéntanos qué pasó (opcional)"
                placeholderTextColor={color.text.tertiary}
                style={s.input}
                value={details}
              />
              <Pressable
                accessibilityRole="button"
                aria-disabled={busy || reason === null}
                disabled={busy || reason === null}
                onPress={() => {
                  const why = reason;
                  if (!why) return;
                  run(
                    () => createReport(supabase, session.user.id, 'user', person.id, why, details),
                    'Reportaste este perfil. Te avisamos cuando el equipo lo revise.',
                  );
                }}
                style={[s.primary, (busy || reason === null) && s.off]}
              >
                <Text style={s.primaryText}>Enviar el reporte</Text>
              </Pressable>
            </>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setSheet(null);
            }}
            style={s.secondary}
          >
            <Text style={s.secondaryText}>Cancelar</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
