/**
 * Discover — the first screen a new user sees, signed in or not.
 *
 * nearby_activities() is SECURITY INVOKER, so RLS still applies and
 * community-only sessions never appear for non-members. That is also why this
 * screen does not require a session: showing real sessions before signup is
 * the cold-start argument in docs/architecture.md.
 */

import { Link, useFocusEffect, useRouter } from 'expo-router';
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
import { countUnreadNotifications, unreadA11yLabel } from '../../lib/notifications';
import { supabase } from '../../lib/supabase';
import type { Category, CategoryId, NearbyActivity, SkillLevel } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import { unreadLinkStyles as u } from '../notifications/styles';
import {
  densityOf,
  heatColor,
  heatStops,
  hitSlopFor,
  occupancyA11yLabel,
  occupancyLabel,
  priceLabel,
  size,
} from '../../theme';
import { formatDistance } from './format';
import { HeatBand } from './HeatBand';
import { discoverStyles as s } from './styles';

/**
 * Chips render at `size.controlSm` (36px) because a 44px chip row looks like a
 * row of buttons. The target is padded back up to 44 instead — visual size and
 * touch target are separate things, which is the whole reason `hitSlopFor`
 * exists.
 */
const CHIP_HIT_SLOP = hitSlopFor(size.controlSm);

/**
 * Centre of the Greater Metropolitan Area. Device location needs a permission
 * prompt and a fallback for when it is refused, so it lands separately — a
 * fixed centre still shows a useful list on first open.
 */
const GAM_CENTRE = { lat: 9.9281, lng: -84.0907 };

/**
 * The same words Crear offers when the level is chosen. The card used to print
 * the enum itself, so every capped session in Descubrir said "advanced" or
 * "beginner" in the middle of a Spanish screen. `any` is never shown: it is
 * the absence of a requirement, not a level.
 */
const SKILL_LABEL: Record<Exclude<SkillLevel, 'any'>, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
};

const WEEKDAY = new Intl.DateTimeFormat('es-CR', {
  weekday: 'long',
  timeZone: 'America/Costa_Rica',
});

/**
 * "Todos los martes · 9 fechas". A series arrives as one row since 0009, and
 * this line is what keeps the other eight dates from looking like they do
 * not exist. Sábado and domingo are the only weekdays that change in the
 * plural.
 */
function seriesLine(startsAt: string, upcoming: number): string {
  const day = WEEKDAY.format(new Date(startsAt));
  const plural = day.endsWith('o') ? `${day}s` : day;
  return `Todos los ${plural} · ${upcoming} ${upcoming === 1 ? 'fecha' : 'fechas'}`;
}

const RADIUS_OPTIONS = [5_000, 15_000, 50_000] as const;

export function DiscoverScreen() {
  const { session, signOut } = useAuth();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<CategoryId | null>(null);
  const [radiusM, setRadiusM] = useState<number>(15_000);
  const [activities, setActivities] = useState<NearbyActivity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);

  const userId = session?.user.id;

  /**
   * On focus, not on mount. Descubrir stays mounted underneath /avisos, so a
   * count read once would still say 2 after both avisos had been read — and a
   * badge that outlives what it counts teaches people to ignore it.
   */
  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        setUnread(0);
        return;
      }
      let cancelled = false;

      countUnreadNotifications(supabase, userId)
        .then((count) => {
          if (!cancelled) setUnread(count);
        })
        .catch(() => {
          // A failed count must not blank the sessions below it.
        });

      return () => {
        cancelled = true;
      };
    }, [userId]),
  );

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
              {/* Before Mis sesiones: an aviso is something that happened to a
                  plan you already made, and a list of plans can wait. */}
              <Link href="/avisos" asChild>
                <Pressable
                  /* The word and the number are one thing to say, not a label
                     followed by a loose digit — hence one composed label, and
                     hence the badge itself hidden from assistive technology. */
                  accessible
                  accessibilityRole="link"
                  accessibilityLabel={unreadA11yLabel(unread)}
                  aria-live="polite"
                  hitSlop={hitSlopFor(size.controlSm)}
                  style={u.link}
                >
                  <Text style={s.linkText}>Avisos</Text>
                  {unread > 0 && (
                    <View aria-hidden style={u.badge}>
                      <Text style={u.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                    </View>
                  )}
                </Pressable>
              </Link>
              {/* Before Crear and Organizar: most people attend sessions and
                  organise none, so the one that is theirs comes first. */}
              <Link href="/mis-sesiones">
                <Text style={s.linkText}>Mis sesiones</Text>
              </Link>
              <Link href="/crear">
                <Text style={s.linkText}>Crear sesión</Text>
              </Link>
              <Link href="/organizar">
                <Text style={s.linkText}>Organizar</Text>
              </Link>
              <Link href="/grupos">
                <Text style={s.linkText}>Grupos</Text>
              </Link>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar sesión"
                onPress={() => {
                  void signOut();
                }}
              >
                <Text style={s.linkText}>Cerrar sesión</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Link href="/grupos">
                <Text style={s.linkText}>Grupos</Text>
              </Link>
              <Link href="/sign-in">
                <Text style={s.linkText}>Iniciar sesión</Text>
              </Link>
            </>
          )}
        </View>
      </View>

      {/* Above the filters, as designed: it summarises the week before the
          chips narrow it. Signed-in only — zone_heat() is not granted to anon. */}
      {session ? <HeatBand centre={GAM_CENTRE} radiusM={radiusM} /> : null}

      <ScrollView
        accessibilityRole="radiogroup"
        accessibilityLabel="Filtrar por categoría"
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filters}
      >
        <View style={s.filterRow}>
          <Pressable
            accessibilityRole="radio"
            accessibilityLabel="Todas las categorías"
            aria-checked={selected === null}
            hitSlop={CHIP_HIT_SLOP}
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
                accessibilityRole="radio"
                accessibilityLabel={category.name_es}
                aria-checked={on}
                hitSlop={CHIP_HIT_SLOP}
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

      <ScrollView
        accessibilityRole="radiogroup"
        accessibilityLabel="Radio de búsqueda"
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filters}
      >
        <View style={s.filterRow}>
          {RADIUS_OPTIONS.map((metres) => {
            const on = radiusM === metres;
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityLabel={`Buscar en ${metres / 1000} kilómetros a la redonda`}
                aria-checked={on}
                hitSlop={CHIP_HIT_SLOP}
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

      {/* One label for the whole ramp. Read stop by stop it is eight
          unpronounceable colour swatches; the scale is what carries meaning,
          and each card states its own occupancy in words anyway. */}
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel="Escala de ocupación: de vacío, en azul, a lleno, en naranja"
        style={s.legend}
      >
        <Text style={s.legendLabel}>vacío</Text>
        <View style={s.legendRamp}>
          {heatStops().map((stop) => (
            <View key={stop} style={[s.legendStop, { backgroundColor: stop }]} />
          ))}
        </View>
        <Text style={s.legendLabel}>lleno</Text>
      </View>

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
                Prueba ampliar el radio o quitar el filtro de categoría. Estamos sumando sesiones de
                grupos que ya entrenan en la GAM.
              </Text>
              <Link href="/solo">
                <Text style={s.linkText}>Igual puedes ir — modo solo</Text>
              </Link>
            </View>
          }
          renderItem={({ item }) => {
            const density = densityOf(item.joined_count, item.max_participants);
            return (
              <Pressable
                /* One element, one label. Read field by field a card is nine
                   fragments with no relationship between them; this is the
                   sentence a sighted user assembles at a glance. */
                accessible
                accessibilityRole="button"
                accessibilityLabel={[
                  item.title,
                  formatSessionTime(item.starts_at),
                  ...(item.series_id
                    ? [seriesLine(item.starts_at, item.series_upcoming ?? 1)]
                    : []),
                  item.location_name,
                  formatDistance(item.distance_m),
                  occupancyA11yLabel(item.joined_count, item.max_participants, density),
                  priceLabel(item.price_minor, item.currency),
                ].join('. ')}
                accessibilityHint="Abre el detalle de la sesión"
                onPress={() => {
                  router.push({ pathname: '/sesion/[id]', params: { id: item.id } });
                }}
                style={s.card}
              >
                <View style={s.cardTop}>
                  <Text style={s.cardTitle}>{item.title}</Text>
                  {/* The dot and the occupancy line encode the same variable, so
                      to a screen reader the dot is decoration. */}
                  <View aria-hidden style={[s.heatDot, { backgroundColor: heatColor(density) }]} />
                </View>
                <Text style={s.cardWhen}>{formatSessionTime(item.starts_at)}</Text>
                {item.series_id ? (
                  <Text style={s.cardSeries}>
                    {seriesLine(item.starts_at, item.series_upcoming ?? 1)}
                  </Text>
                ) : null}
                <Text style={s.cardWhere}>
                  {item.location_name}
                  {item.district ? ` · ${item.district}` : ''} · {formatDistance(item.distance_m)}
                </Text>
                <View style={s.cardFacts}>
                  <Text style={s.fact}>
                    {occupancyLabel(item.joined_count, item.max_participants)}
                  </Text>
                  <Text style={s.fact}>{priceLabel(item.price_minor, item.currency)}</Text>
                  {item.skill !== 'any' ? (
                    <Text style={s.fact}>{SKILL_LABEL[item.skill]}</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
