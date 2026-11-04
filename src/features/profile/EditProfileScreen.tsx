/**
 * Editar perfil (Perfil v2, phone 2): name, «Sobre ti», your zone and your
 * gender, saved together. Your sports moved to their own screen with a
 * level each (Deportes v2 · 4, /perfil/deportes); this one links to it.
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
import { GENDER_OPTIONS, setMyGender, type Gender } from '../../lib/gender';
import {
  BIO_MAX,
  bioProblem,
  fetchDistrictOptions,
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
  const { profile, error: loadError } = useMyProfile(userId);

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [district, setDistrict] = useState<DistrictOption | null>(null);
  const [query, setQuery] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
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
    setGender(profile.gender);
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

  const save = () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    saveMyProfile(supabase, {
      userId,
      displayName: name,
      bio,
      homeDistrict: district?.code ?? null,
    })
      // Only when it changed: every change is logged (0035), and an
      // unchanged answer is not a change.
      .then(() =>
        gender !== null && gender !== profile?.gender ? setMyGender(supabase, gender) : undefined,
      )
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
        <View style={s.labelRow}>
          <Text style={s.label}>Tu género</Text>
          <Text style={s.optional}>solo tú lo ves</Text>
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel="Tu género" style={s.chipRow}>
          {GENDER_OPTIONS.map((option) => {
            const on = gender === option.value;
            return (
              <Pressable
                accessibilityRole="radio"
                aria-checked={on}
                accessibilityLabel={option.label}
                hitSlop={hitSlopFor(size.controlSm)}
                key={option.value}
                onPress={() => {
                  setGender(option.value);
                }}
                style={[s.chip, on && s.chipOn]}
              >
                <Text style={[s.chipText, on && s.chipTextOn]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={s.hint}>
          Sirve solo para mostrarte lo que es solo para mujeres. No aparece en tu perfil público ni
          en las listas.
        </Text>
      </View>

      <View style={s.field}>
        <Text style={s.label}>Tus deportes</Text>
        <Link href="/perfil/deportes" style={s.link}>
          <Text style={s.linkText}>Elegir tus deportes y tu nivel en cada uno</Text>
        </Link>
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
