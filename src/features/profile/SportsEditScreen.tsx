/**
 * Tus deportes (Deportes v2 · 4): each sport with your level in it.
 *
 * Three levels, words not numbers: Empezando, Intermedio, Avanzado. «Agregar
 * un deporte» opens the nineteen by family. The level helps whoever organizes
 * know who is coming, and it is public where the sports already are (0038).
 * Saved in one call, set_my_sports(); Cancelar leaves without writing.
 */

import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import {
  MAX_SPORTS,
  mySports,
  saveMySports,
  SPORT_LEVELS,
  type MySport,
  type SportLevel,
} from '../../lib/profile';
import { supabase } from '../../lib/supabase';
import { color, hitSlopFor, size } from '../../theme';
import { FAMILY_NAME, FAMILY_TEXT_COLOR, sportColor } from '../../theme/sport';
import type { SportFamily } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import { createStyles as c } from '../create/styles';
import { Icon } from '../nav/Icon';
import { sportsEditStyles as s } from './styles';
import { useMyProfile } from './useMyProfile';

const HIT_SLOP = hitSlopFor(size.controlSm);
const FAMILIES: SportFamily[] = ['correr', 'montana', 'balon', 'ruedas', 'entrenar', 'agua'];

export function SportsEditScreen() {
  const { session, loading } = useAuth();
  const userId = session?.user.id;
  const { profile, categories, error: loadError } = useMyProfile(userId);

  const [sports, setSports] = useState<MySport[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile && sports === null) setSports(mySports(profile));
  }, [profile, sports]);

  if (loading) return <ActivityIndicator style={c.screen} />;
  if (!session) return <Redirect href="/sign-in" />;
  if (profile === undefined || (profile !== null && sports === null)) {
    return <ActivityIndicator style={c.screen} />;
  }
  if (profile === null || sports === null) {
    return (
      <View style={c.screen}>
        <Text style={c.error}>{loadError ?? 'No se pudo cargar tu perfil.'}</Text>
      </View>
    );
  }

  const nameOf = (id: string) => categories.find((k) => k.id === id)?.name_es ?? id;
  const full = sports.length >= MAX_SPORTS;

  const setLevel = (category: string, level: SportLevel) => {
    setSports(sports.map((x) => (x.category === category ? { ...x, level } : x)));
  };
  const remove = (category: string) => {
    setSports(sports.filter((x) => x.category !== category));
  };
  const add = (category: string) => {
    if (full || sports.some((x) => x.category === category)) return;
    setSports([...sports, { category, level: 'beginner' }]);
    setAdding(false);
  };

  const save = () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    saveMySports(supabase, sports)
      .then(() => {
        router.replace('/cuenta');
      })
      .catch((cause: unknown) => {
        setBusy(false);
        setError(cause instanceof Error ? cause.message : 'No se pudieron guardar tus deportes.');
      });
  };

  const chosen = new Set(sports.map((x) => x.category));

  return (
    <ScrollView aria-busy={busy} contentContainerStyle={c.content} style={c.screen}>
      <View style={s.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancelar, sin guardar"
          hitSlop={HIT_SLOP}
          onPress={() => {
            router.replace('/cuenta');
          }}
          style={s.topAction}
        >
          <Text style={s.topCancel}>Cancelar</Text>
        </Pressable>
        <Text accessibilityRole="header" style={s.topTitle}>
          Tus deportes
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={busy ? 'Guardando' : 'Guardar'}
          aria-disabled={busy}
          disabled={busy}
          hitSlop={HIT_SLOP}
          onPress={save}
          style={[s.topAction, s.topActionEnd]}
        >
          <Text style={s.topSave}>{busy ? 'Guardando…' : 'Guardar'}</Text>
        </Pressable>
      </View>

      <Text style={c.hint}>
        Tu nivel en cada uno ayuda a quien organiza a saber quién viene. Se ve en tu perfil público.
      </Text>

      {error !== null && (
        <View style={c.banner}>
          <Text accessibilityRole="alert" style={c.bannerText}>
            {error}
          </Text>
        </View>
      )}

      {sports.length === 0 && <Text style={c.emptyNote}>Todavía no elegiste ningún deporte.</Text>}

      {sports.map((sport) => (
        <View key={sport.category} style={s.card}>
          <View style={s.cardHead}>
            <View style={[s.dot, { backgroundColor: sportColor(sport.category) }]} />
            <Text style={s.cardTitle}>{nameOf(sport.category)}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Quitar ${nameOf(sport.category)}`}
              hitSlop={HIT_SLOP}
              onPress={() => {
                remove(sport.category);
              }}
              style={s.remove}
            >
              <Icon color={color.text.tertiary} name="close" size={16} />
            </Pressable>
          </View>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={`Tu nivel en ${nameOf(sport.category)}`}
            style={s.segment}
          >
            {SPORT_LEVELS.map((level) => {
              const on = sport.level === level.id;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityLabel={level.label}
                  aria-checked={on}
                  key={level.id}
                  onPress={() => {
                    setLevel(sport.category, level.id);
                  }}
                  style={[s.segmentItem, on && s.segmentItemOn]}
                >
                  <Text style={[s.segmentText, on && s.segmentTextOn]}>{level.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      {adding ? (
        <View style={s.picker}>
          <View style={s.pickerHead}>
            <Text style={s.pickerTitle}>Agregar un deporte</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar la lista de deportes"
              hitSlop={HIT_SLOP}
              onPress={() => {
                setAdding(false);
              }}
            >
              <Icon color={color.text.tertiary} name="close" size={16} />
            </Pressable>
          </View>
          {FAMILIES.map((family) => {
            const inFamily = categories.filter((k) => k.family === family && !chosen.has(k.id));
            if (inFamily.length === 0) return null;
            return (
              <View key={family} style={s.family}>
                <Text style={[s.familyName, { color: FAMILY_TEXT_COLOR[family] }]}>
                  {FAMILY_NAME[family].toUpperCase()}
                </Text>
                <View style={c.chipRow}>
                  {inFamily.map((k) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Agregar ${k.name_es}`}
                      hitSlop={HIT_SLOP}
                      key={k.id}
                      onPress={() => {
                        add(k.id);
                      }}
                      style={s.addChip}
                    >
                      <View style={[s.dot, { backgroundColor: sportColor(k.id) }]} />
                      <Text style={s.addChipText}>{k.name_es}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={full ? `Ya tienes ${MAX_SPORTS} deportes` : 'Agregar un deporte'}
          aria-disabled={full}
          disabled={full}
          onPress={() => {
            setAdding(true);
          }}
          style={[s.addRow, full && c.publishDisabled]}
        >
          <Icon color={color.accent.cool} name="plus" size={16} />
          <Text style={s.addRowText}>
            {full ? `Hasta ${MAX_SPORTS} deportes` : 'Agregar un deporte'}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
