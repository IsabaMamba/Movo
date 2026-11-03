/**
 * Discover — the first screen a new user sees, signed in or not.
 *
 * nearby_activities() is SECURITY INVOKER, so RLS still applies and
 * community-only sessions never appear for non-members. That is also why this
 * screen does not require a session: showing real sessions before signup is
 * the cold-start argument in docs/architecture.md.
 *
 * Layout from the 2 November walkthrough (Descubrir v3, step 2): «Descubrir»
 * with the bell, the map with its controls laid over it, the category chips,
 * then the list as a sheet — «9 sesiones a menos de 15 km» — of cards with
 * the date in a column on the left and the occupancy as a bar on the right.
 * The full-screen map, search, 100 km and País are not built yet: they wait
 * for the street map (docs/design/mapa.md) and zone_summary().
 */

import { Link, useRouter } from 'expo-router';
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
import { recordConsent } from '../../lib/consents';
import {
  GAM_CENTRE,
  LOCATION_NOTICE_VERSION,
  originFailureText,
  requestCoarseOrigin,
  type Point,
} from '../../lib/location';
import { supabase } from '../../lib/supabase';
import type { Category, CategoryId, NearbyActivity, SkillLevel } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import {
  densityOf,
  color,
  heatColor,
  hitSlopFor,
  occupancyA11yLabel,
  occupancyLabel,
  priceLabel,
  size,
} from '../../theme';
import { sportColor } from '../../theme/sport';
import { BellLink } from '../nav/BellLink';
import { Icon } from '../nav/Icon';
import { dateColumn, formatDistance, nearbyCount, seriesShort } from './format';
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

const sportDot = (id: string) => sportColor(id, color.accent.cool);

/** Taller than the original band: on the boards the map is the first thing. */
const MAP_HEIGHT = 300;

export function DiscoverScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<CategoryId | null>(null);
  const [radiusM, setRadiusM] = useState<number>(15_000);
  const [activities, setActivities] = useState<NearbyActivity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Where the search starts. The GAM until the person asks for otherwise:
  // opening the app never triggers a permission prompt. See lib/location.ts.
  const [origin, setOrigin] = useState<Point>(GAM_CENTRE);
  const [originMode, setOriginMode] = useState<'gam' | 'mine' | 'locating'>('gam');
  const [originNote, setOriginNote] = useState<string | null>(null);
  const [originMenu, setOriginMenu] = useState(false);

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
      ...origin,
      radiusM,
      categories: selected ? [selected] : undefined,
    });
  }, [origin, radiusM, selected]);

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

  const pickMine = () => {
    setOriginMode('locating');
    setOriginNote(null);
    void requestCoarseOrigin().then((result) => {
      if (result.ok) {
        setOrigin(result.point);
        setOriginMode('mine');
        setOriginNote('Cerca de ti, en un radio aproximado. Tu ubicación no se guarda.');
        // The grant is recorded, not the place (0030). Signed out there is
        // nobody to record it against, and nothing was linked to anybody.
        if (session) void recordConsent(supabase, 'location', LOCATION_NOTICE_VERSION, true);
      } else {
        setOrigin(GAM_CENTRE);
        setOriginMode('gam');
        setOriginNote(originFailureText(result.reason));
      }
    });
  };

  const pickGam = () => {
    setOrigin(GAM_CENTRE);
    setOriginMode('gam');
    setOriginNote(null);
  };

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

  const radiusKm = radiusM / 1000;
  const selectedName = categories.find((c) => c.id === selected)?.name_es ?? 'Todo';

  const originControl = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Buscar desde: ${originMode === 'mine' ? 'cerca de mí' : 'centro de la GAM'}`}
      accessibilityHint="Cambia desde dónde se busca"
      aria-busy={originMode === 'locating'}
      hitSlop={CHIP_HIT_SLOP}
      onPress={() => {
        setOriginMenu((open) => !open);
      }}
      style={s.originPill}
    >
      <Icon color={color.text.primary} name="crosshair" size={16} />
      <Text style={s.originText}>
        {originMode === 'locating'
          ? 'Buscando…'
          : originMode === 'mine'
            ? 'Cerca de mí'
            : 'Centro de la GAM'}
      </Text>
      <Icon color={color.text.secondary} name="chevronDown" size={14} />
    </Pressable>
  );

  const radiusControl = (
    <View accessibilityRole="radiogroup" accessibilityLabel="Radio de búsqueda" style={s.segment}>
      {RADIUS_OPTIONS.map((metres) => {
        const on = radiusM === metres;
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityLabel={`${metres / 1000} kilómetros a la redonda`}
            aria-checked={on}
            hitSlop={CHIP_HIT_SLOP}
            key={metres}
            onPress={() => {
              setRadiusM(metres);
            }}
            style={[s.segmentItem, on && s.segmentItemOn]}
          >
            <Text style={[s.segmentText, on && s.segmentTextOn]}>{metres / 1000}</Text>
          </Pressable>
        );
      })}
      <Text style={s.segmentUnit}>km</Text>
    </View>
  );

  const controls = (
    <View style={s.controls}>
      {originControl}
      {radiusControl}
    </View>
  );

  const header = (
    <View>
      {session ? (
        <HeatBand
          caption={`${selectedName} · próximos 7 días`}
          centre={origin}
          height={MAP_HEIGHT}
          overlay={controls}
          radiusM={radiusM}
        />
      ) : (
        <View style={s.controlsBare}>{controls}</View>
      )}

      {originMenu && (
        <View accessibilityRole="menu" style={s.originMenu}>
          {(
            [
              ['gam', 'Centro de la GAM', 'Busca desde San José'],
              ['mine', 'Cerca de mí', 'Tu ubicación aproximada. No se guarda.'],
            ] as const
          ).map(([mode, label, hint]) => (
            <Pressable
              accessibilityRole="menuitem"
              accessibilityLabel={label}
              key={mode}
              onPress={() => {
                setOriginMenu(false);
                if (mode === 'gam') pickGam();
                else pickMine();
              }}
              style={s.originMenuItem}
            >
              <Text style={[s.originMenuText, originMode === mode && s.originMenuTextOn]}>
                {originMode === mode ? '✓ ' : ''}
                {label}
              </Text>
              <Text style={s.meta}>{hint}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {originNote !== null && (
        <Text aria-live="polite" style={[s.meta, s.gutter]}>
          {originNote}
        </Text>
      )}

      <ScrollView
        accessibilityRole="radiogroup"
        accessibilityLabel="Filtrar por deporte"
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filters}
      >
        <View style={s.filterRow}>
          <Pressable
            accessibilityRole="radio"
            accessibilityLabel="Todos los deportes"
            aria-checked={selected === null}
            hitSlop={CHIP_HIT_SLOP}
            onPress={() => {
              setSelected(null);
            }}
            style={[s.chip, selected === null && s.chipOn]}
          >
            <Text style={[s.chipText, selected === null && s.chipTextOn]}>
              {selected === null ? '✓ ' : ''}Todo
            </Text>
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
                {!on && <View style={[s.chipDot, { backgroundColor: sportDot(category.id) }]} />}
                <Text style={[s.chipText, on && s.chipTextOn]}>
                  {on ? '✓ ' : ''}
                  {category.name_es}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {error ? <Text style={s.error}>{error}</Text> : null}

      {activities !== null && activities.length > 0 && (
        <View style={s.listHead}>
          <Text style={s.listCount}>
            <Text style={s.listCountStrong}>{nearbyCount(activities.length, radiusKm).count}</Text>
            {nearbyCount(activities.length, radiusKm).rest}
          </Text>
          <Text style={s.meta}>por hora</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Text accessibilityRole="header" style={s.title}>
          Descubrir
        </Text>
        {session ? (
          <BellLink userId={session.user.id} />
        ) : (
          <Link href="/sign-in" asChild>
            <Pressable accessibilityRole="link" style={s.signIn}>
              <Text style={s.signInText}>Iniciar sesión</Text>
            </Pressable>
          </Link>
        )}
      </View>

      {activities === null ? (
        <>
          {header}
          <ActivityIndicator style={s.centred} />
        </>
      ) : (
        <FlatList
          contentContainerStyle={s.list}
          data={activities}
          keyExtractor={(activity) => activity.id}
          refreshControl={<RefreshControl onRefresh={refresh} refreshing={refreshing} />}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={s.centred}>
              <Text style={s.emptyTitle}>Todavía no hay sesiones aquí</Text>
              <Text style={s.emptyBody}>
                Prueba ampliar el radio o quitar el filtro de deporte. Estamos sumando sesiones de
                grupos que ya entrenan en la GAM.
              </Text>
              <Link href="/solo">
                <Text style={s.linkText}>Igual puedes ir — modo solo</Text>
              </Link>
            </View>
          }
          renderItem={({ item }) => {
            const density = densityOf(item.joined_count, item.max_participants);
            const when = dateColumn(item.starts_at);
            const sport = categories.find((c) => c.id === item.category_id)?.name_es;
            const level = item.skill === 'any' ? 'Todos los niveles' : SKILL_LABEL[item.skill];
            const price = priceLabel(item.price_minor, item.currency);
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
                  price,
                ].join('. ')}
                accessibilityHint="Abre el detalle de la sesión"
                onPress={() => {
                  router.push({ pathname: '/sesion/[id]', params: { id: item.id } });
                }}
                style={s.card}
              >
                <View aria-hidden style={s.dateCol}>
                  <Text style={s.dateWeekday}>{when.weekday}</Text>
                  <Text style={s.dateTime}>{when.time}</Text>
                  <Text style={s.dateDay}>{when.day}</Text>
                </View>
                <View aria-hidden style={s.cardBody}>
                  <Text numberOfLines={2} style={s.cardTitle}>
                    {item.title}
                  </Text>
                  <Text style={s.cardSport}>{[sport, level].filter(Boolean).join(' · ')}</Text>
                  {item.series_id ? (
                    <Text style={s.cardSeries}>
                      {seriesShort(item.starts_at, item.series_upcoming ?? 1)}
                    </Text>
                  ) : null}
                  <Text numberOfLines={1} style={s.cardWhere}>
                    {item.location_name}
                    {item.district ? ` · ${item.district}` : ''} · {formatDistance(item.distance_m)}
                  </Text>
                  <View style={s.cardBottom}>
                    <Text style={[s.cardPrice, item.price_minor > 0 && s.cardPricePaid]}>
                      {price}
                    </Text>
                    <View style={s.occupancy}>
                      <View style={s.occupancyTrack}>
                        <View
                          style={[
                            s.occupancyFill,
                            {
                              backgroundColor: heatColor(density),
                              width: `${Math.max(6, density * 100)}%`,
                            },
                          ]}
                        />
                      </View>
                      <Text style={s.occupancyText}>
                        {occupancyLabel(item.joined_count, item.max_participants)}
                      </Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
