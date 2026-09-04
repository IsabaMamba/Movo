/**
 * Discover — the first screen a new user sees, signed in or not.
 *
 * nearby_activities() is SECURITY INVOKER, so RLS still applies and
 * community-only sessions never appear for non-members. That is also why this
 * screen does not require a session: showing real sessions before signup is
 * the cold-start argument in docs/architecture.md.
 */

import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { fetchCategories, fetchNearbyActivities, formatSessionTime } from '../../lib/activities';
import { supabase } from '../../lib/supabase';
import type { Category, CategoryId, NearbyActivity } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import { formatDistance, formatPrice, formatSpots } from './format';
import { discoverStyles as s } from './styles';

/**
 * Centre of the Greater Metropolitan Area. Device location needs a permission
 * prompt and a fallback for when it is refused, so it lands separately — a
 * fixed centre still shows a useful list on first open.
 */
const GAM_CENTRE = { lat: 9.9281, lng: -84.0907 };

const RADIUS_OPTIONS = [5_000, 15_000, 50_000] as const;

export function DiscoverScreen() {
  const { session, signOut } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<CategoryId | null>(null);
  const [radiusM, setRadiusM] = useState<number>(15_000);
  const [activities, setActivities] = useState<NearbyActivity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCategories(supabase)
      .then((rows) => {
        if (!cancelled) setCategories(rows);
      })
      .catch(() => {
        // A failed category list must not blank the sessions below it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async (): Promise<NearbyActivity[]> => {
    return fetchNearbyActivities(supabase, {
      ...GAM_CENTRE,
      radiusM,
      categories: selected ? [selected] : undefined,
    });
  }, [radiusM, selected]);

  useEffect(() => {
    let cancelled = false;
    setActivities(null);
    setError(null);

    load()
      .then((rows) => {
        if (!cancelled) setActivities(rows);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las sesiones.');
        setActivities([]);
      });

    return () => {
      cancelled = true;
    };
  }, [load]);

  const refresh = () => {
    setRefreshing(true);
    load()
      .then((rows) => {
        setActivities(rows);
        setError(null);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las sesiones.');
      })
      .finally(() => {
        setRefreshing(false);
      });
  };

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Text style={s.title}>Movo</Text>
        <View style={s.account}>
          {session ? (
            <>
              <Text style={s.accountText}>{session.user.email}</Text>
              <Pressable
                onPress={() => {
                  void signOut();
                }}
              >
                <Text style={s.linkText}>Cerrar sesión</Text>
              </Pressable>
            </>
          ) : (
            <Link href="/sign-in">
              <Text style={s.linkText}>Iniciar sesión</Text>
            </Link>
          )}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filters}>
        <View style={s.filterRow}>
          <Pressable
            onPress={() => {
              setSelected(null);
            }}
            style={[s.chip, selected === null && s.chipOn]}
          >
            <Text style={[s.chipText, selected === null && s.chipTextOn]}>Todo</Text>
          </Pressable>
          {categories.map((category) => {
            const on = selected === category.id;
            return (
              <Pressable
                key={category.id}
                onPress={() => {
                  setSelected(on ? null : category.id);
                }}
                style={[s.chip, on && s.chipOn]}
              >
                <Text style={[s.chipText, on && s.chipTextOn]}>{category.name_es}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filters}>
        <View style={s.filterRow}>
          {RADIUS_OPTIONS.map((metres) => {
            const on = radiusM === metres;
            return (
              <Pressable
                key={metres}
                onPress={() => {
                  setRadiusM(metres);
                }}
                style={[s.chip, on && s.chipOn]}
              >
                <Text style={[s.chipText, on && s.chipTextOn]}>{metres / 1000} km</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {error ? <Text style={s.error}>{error}</Text> : null}

      {activities === null ? (
        <ActivityIndicator style={s.centred} />
      ) : (
        <FlatList
          contentContainerStyle={s.list}
          data={activities}
          keyExtractor={(activity) => activity.id}
          refreshControl={<RefreshControl onRefresh={refresh} refreshing={refreshing} />}
          ListHeaderComponent={
            activities.length > 0 ? (
              <Text style={s.meta}>
                {activities.length} {activities.length === 1 ? 'sesión' : 'sesiones'} cerca
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={s.centred}>
              <Text style={s.emptyTitle}>Todavía no hay sesiones acá</Text>
              <Text style={s.emptyBody}>
                Probá ampliar el radio o quitar el filtro de categoría. Estamos sumando sesiones de
                grupos que ya entrenan en la GAM.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={s.card}>
              <Text style={s.cardTitle}>{item.title}</Text>
              <Text style={s.cardWhen}>{formatSessionTime(item.starts_at)}</Text>
              <Text style={s.cardWhere}>
                {item.location_name}
                {item.district ? ` · ${item.district}` : ''} · {formatDistance(item.distance_m)}
              </Text>
              <View style={s.cardFacts}>
                <Text style={s.fact}>{formatSpots(item.joined_count, item.max_participants)}</Text>
                <Text style={s.fact}>{formatPrice(item.price_crc)}</Text>
                {item.skill !== 'any' ? <Text style={s.fact}>{item.skill}</Text> : null}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}
