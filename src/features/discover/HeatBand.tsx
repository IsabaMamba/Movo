/**
 * The heat band — the strip at the top of Descubrir that shows where things
 * are happening this week.
 *
 * `docs/design/descubrir.html` puts it above the list for a stated reason:
 * with three sessions a list looks thin and a heat map looks alive. It draws
 * `zone_heat()` and nothing else. Each blob sits at its ZONE's anchor point,
 * snapped there in the database (ADR 0006), so the band cannot show where a
 * venue is — it was never given one.
 *
 * Signed-in only. `zone_heat()` is not granted to `anon`, and widening that
 * is a security decision, not a rendering one; a visitor who is not signed in
 * sees the list, as before.
 *
 * The boundaries behind the zones are OpenStreetMap's, under the ODbL, and
 * the credit below is a condition of that licence — see NOTICE.md.
 */

import { useEffect, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, RadialGradient, Rect, Stop } from 'react-native-svg';

import {
  fetchZoneHeat,
  HEAT_WINDOW_DAYS,
  heatSummary,
  kindForRadius,
  layoutBlobs,
  PEOPLE_AT_PEAK,
  type LatLng,
  type ZoneHeat,
} from '../../lib/heatmap';
import { supabase } from '../../lib/supabase';
import { color, heatColor, heatStops } from '../../theme';
import { discoverStyles as s } from './styles';

/** The design's band height. The search radius spans half of it. */
export const BAND_HEIGHT = 132;

/** Grid pitch, from the design. It is a ruler, not geography. */
const GRID = 22;

interface Props {
  centre: LatLng;
  radiusM: number;
}

export function HeatBand({ centre, radiusM }: Props) {
  const [width, setWidth] = useState(0);
  const [zones, setZones] = useState<ZoneHeat[] | null>(null);
  const [failed, setFailed] = useState(false);

  const radiusKm = radiusM / 1000;
  const kind = kindForRadius(radiusKm);

  useEffect(() => {
    let cancelled = false;
    setZones(null);
    setFailed(false);

    fetchZoneHeat(supabase, kind)
      .then((rows) => {
        if (!cancelled) setZones(rows);
      })
      .catch(() => {
        // The band is a summary of the list below it. Losing it must not
        // cost the list, so the failure stays inside the band.
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [kind]);

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  };

  const viewport = { centre, radiusKm, width, height: BAND_HEIGHT };
  const blobs = zones && width > 0 ? layoutBlobs(zones, viewport) : [];
  const empty = zones !== null && blobs.length === 0;

  const label = failed
    ? 'Mapa de calor no disponible.'
    : zones === null
      ? 'Cargando el mapa de calor.'
      : heatSummary(blobs, radiusKm);

  return (
    <View style={s.bandWrap}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        onLayout={onLayout}
        style={[s.band, { height: BAND_HEIGHT }]}
      >
        {width > 0 && (
          <Svg height={BAND_HEIGHT} style={s.bandCanvas} width={width}>
            <Defs>
              {blobs.map((b) => {
                const hot = heatColor(b.level);
                return (
                  <RadialGradient cx="50%" cy="50%" id={`heat-${b.code}`} key={b.code} r="50%">
                    <Stop offset="0" stopColor={hot} stopOpacity={0.95} />
                    <Stop offset="0.45" stopColor={heatColor(b.level * 0.7)} stopOpacity={0.55} />
                    <Stop offset="1" stopColor={heatColor(b.level * 0.5)} stopOpacity={0} />
                  </RadialGradient>
                );
              })}
            </Defs>

            {blobs.map((b) => (
              <Circle cx={b.x} cy={b.y} fill={`url(#heat-${b.code})`} key={b.code} r={b.r} />
            ))}

            {Array.from({ length: Math.ceil(width / GRID) }, (_, i) => (
              <Line
                key={`v${i}`}
                stroke={color.text.primary}
                strokeOpacity={0.1}
                x1={i * GRID}
                x2={i * GRID}
                y1={0}
                y2={BAND_HEIGHT}
              />
            ))}
            {Array.from({ length: Math.ceil(BAND_HEIGHT / GRID) }, (_, i) => (
              <Line
                key={`h${i}`}
                stroke={color.text.primary}
                strokeOpacity={0.1}
                x1={0}
                x2={width}
                y1={i * GRID}
                y2={i * GRID}
              />
            ))}

            {/* Where the search is centred. Not the viewer's position: Descubrir
              searches from a fixed point in San José until device location
              lands (roadmap P1 · 12). */}
            <Rect
              fill="none"
              height={26}
              stroke={color.text.primary}
              strokeWidth={2}
              width={26}
              x={width / 2 - 13}
              y={BAND_HEIGHT / 2 - 13}
            />
            <Rect
              fill="none"
              height={22}
              stroke={color.bg.base}
              strokeWidth={2}
              width={22}
              x={width / 2 - 11}
              y={BAND_HEIGHT / 2 - 11}
            />
          </Svg>
        )}

        <Text aria-hidden style={s.bandCaption}>
          Próximos {HEAT_WINDOW_DAYS} días · todas las actividades
        </Text>
        {(empty || failed) && (
          <View aria-hidden style={s.bandMessage}>
            <Text style={s.bandMessageText}>
              {failed
                ? 'No se pudo cargar el mapa de calor.'
                : `Nada programado a ${radiusKm} km esta semana.`}
            </Text>
          </View>
        )}

        {/* The band's own scale. Heat must always show the key that decodes it,
          and this one measures people per zone — a different quantity from
          the occupancy scale further down, so it says its unit. */}
        <View aria-hidden style={s.bandLegend}>
          <Text style={s.bandScale}>0</Text>
          <View style={s.bandRamp}>
            {heatStops()
              .slice(1)
              .map((stop) => (
                <View key={stop} style={[s.bandStop, { backgroundColor: stop }]} />
              ))}
          </View>
          <Text style={s.bandScale}>{PEOPLE_AT_PEAK}+ personas</Text>
        </View>
      </View>

      {/* Below the band rather than on it: at phone width it would collide
        with the caption. Directly beneath is still where the map is shown,
        which is what the ODbL asks. */}
      <Text style={s.bandCredit}>© colaboradores de OpenStreetMap</Text>
    </View>
  );
}
