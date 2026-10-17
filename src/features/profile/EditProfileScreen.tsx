/**
 * Editar perfil (Perfil v2, phone 2): name, «Sobre ti», your zone and your
 * sports, saved together.
 *
 * The zone is chosen from the distritos Movo already has — typed to search,
 * never typed as an address — and the hint says what it is for and what it
 * is not: «Solo el distrito, nunca tu dirección».
 *
 * Not here yet: the photo or sport avatar (they need storage, moderation and
 * an avatar provider: decisions still open) and the «Tema» switch on the
 * board, which nothing in the handoff explains.
 */

import { Link, Redirect, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { NAME_MAX, nameProblem } from '../../lib/account';
import {
  BIO_MAX,
  bioProblem,
  fetchDistrictOptions,
  MAX_SPORTS,
  saveMyProfile,
  searchDistricts,
  type DistrictOption,
} from '../../lib/profile';
import { supabase } from '../../lib/supabase';
import { color, hitSlopFor, size } from '../../theme';
import { useAuth } from '../auth/AuthProvider';
import { createStyles as s } from '../create/styles';
import { useMyProfile } from './useMyProfile';

export function EditProfileScreen() {
  const { session, loading } = useAuth();
  const userId = session?.user.id;
  const { profile, categories, error: loadError } = useMyProfile(userId);

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [district, setDistrict] = useState<DistrictOption | null>(null);
  const [query, setQuery] = useState('');
  const [sports, setSports] = useState<string[]>([]);
  const [options, setOptions] = useState<DistrictOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchDistrictOptions(supabase)
      .then(setOptions)
      .catch(() => {
        setOptions([]);
      });
  }, []);

  // Prefill once the profile and the distrito list have both arrived.
  useEffect(() => {
    if (!profile) return;
    setName(profile.display_name);
    setBio(profile.bio ?? '');
    setSports(profile.interests);
  }, [profile]);
  useEffect(() => {
    if (!profile?.home_district || options.length === 0) return;
    setDistrict(options.find((o) => o.code === profile.home_district) ?? null);
  }, [profile, options]);

  const matches = useMemo(() => searchDistricts(options, query), [options, query]);

  if (loading) return <ActivityIndicator style={s.screen} />;
  if (!session || !userId) return <Redirect href="/sign-in" />;
  if (profile === undefined) return <ActivityIndicator style={s.screen} />;

  const problem = nameProblem(name) ?? bioProblem(bio);
  const canSave = !busy && problem === null && profile !== null;

  const toggleSport = (id: string) => {
    setSports((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= MAX_SPORTS
          ? prev
          : [...prev, id],
    );
  };

  const save = () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    saveMyProfile(supabase, {
      userId,
      displayName: name,
      bio,
      homeDistrict: district?.code ?? null,
      interests: sports,
    })
      .then(() => {
        router.replace('/cuenta');
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudo guardar tu perfil.');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <ScrollView contentContainerStyle={s.content} style={s.screen}>
      <Link href="/cuenta" style={s.link}>
        <Text style={s.linkText}>← Perfil</Text>
      </Link>
      <Text accessibilityRole="header" style={s.title}>
        Editar perfil
      </Text>

      {(error ?? loadError) !== null && (
        <View style={s.banner}>
          <Text accessibilityRole="alert" style={s.bannerText}>
            {error ?? loadError}
          </Text>
        </View>
      )}

      <View style={s.field}>
        <Text style={s.label}>Nombre</Text>
        <TextInput
          accessibilityLabel="Nombre"
          autoComplete="name"
          maxLength={NAME_MAX}
          onChangeText={setName}
          style={s.input}
          value={name}
        />
        <Text style={s.hint}>
          {nameProblem(name) ?? 'Así apareces en las sesiones y los grupos.'}
        </Text>
      </View>

      <View style={s.field}>
        <View style={s.labelRow}>
          <Text style={s.label}>Sobre ti</Text>
          <Text style={s.optional}>
            {bio.trim().length} / {BIO_MAX}
          </Text>
        </View>
        <TextInput
          accessibilityLabel="Sobre ti, opcional"
          maxLength={BIO_MAX + 40}
          multiline
          onChangeText={setBio}
          placeholder="Corro de madrugada y busco gente para senderismo de fin de semana."
          placeholderTextColor={color.text.tertiary}
          style={[s.input, { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' }]}
          value={bio}
        />
        {bioProblem(bio) !== null && <Text style={s.error}>{bioProblem(bio)}</Text>}
      </View>

      <View style={s.field}>
        <View style={s.labelRow}>
          <Text style={s.label}>Tu zona</Text>
          <Text style={s.optional}>opcional</Text>
        </View>
        {district ? (
          <View style={s.chipRow}>
            <View style={[s.chip, s.chipOn]}>
              <Text style={[s.chipText, s.chipTextOn]}>{district.label}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cambiar o quitar tu zona"
              hitSlop={hitSlopFor(size.controlSm)}
              onPress={() => {
                setDistrict(null);
                setQuery('');
              }}
              style={s.link}
            >
              <Text style={s.linkText}>Cambiar</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <TextInput
              accessibilityLabel="Busca tu distrito"
              autoCorrect={false}
              onChangeText={setQuery}
              placeholder="Escribe tu distrito: Tibás, Mata Redonda…"
              placeholderTextColor={color.text.tertiary}
              style={s.input}
              value={query}
            />
            {matches.map((option) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={option.label}
                key={option.code}
                onPress={() => {
                  setDistrict(option);
                  setQuery('');
                }}
                style={s.venue}
              >
                <Text style={s.venueName}>{option.label}</Text>
              </Pressable>
            ))}
          </>
        )}
        <Text style={s.hint}>
          Solo el distrito, nunca tu dirección. No aparece en tu perfil público: sirve para
          mostrarte sesiones cerca.
        </Text>
      </View>

      <View style={s.field}>
        <Text style={s.label}>Tus deportes</Text>
        <View style={s.chipRow}>
          {categories.map((category) => {
            const on = sports.includes(category.id);
            return (
              <Pressable
                accessibilityRole="checkbox"
                aria-checked={on}
                accessibilityLabel={category.name_es}
                hitSlop={hitSlopFor(size.controlSm)}
                key={category.id}
                onPress={() => {
                  toggleSport(category.id);
                }}
                style={[s.chip, on && s.chipOn]}
              >
                <Text style={[s.chipText, on && s.chipTextOn]}>
                  {on ? '✓ ' : ''}
                  {category.name_es}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={s.hint}>Se ven en tu perfil público.</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={busy ? 'Guardando' : 'Guardar'}
        aria-disabled={!canSave}
        disabled={!canSave}
        onPress={save}
        style={[s.publish, !canSave && s.publishDisabled]}
      >
        <Text style={s.publishText}>{busy ? 'Guardando…' : 'Guardar'}</Text>
      </Pressable>
    </ScrollView>
  );
}
