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
 *
 * Descubrir v3 (2 November video): taller, with the origin and radius
 * controls laid over its top edge, the search origin drawn as Sun rings, the
 * radius labelled on its ring, and the caption and the scale on its bottom
 * edge — the caption left, the scale and the credit right.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';

import {
  boundsFor,
  fetchZoneHeat,
  fetchZoneOutlines,
  HEAT_WINDOW_DAYS,
  heatSummary,
  kindForRadius,
  layoutBlobs,
  PEOPLE_AT_PEAK,
  pathFor,
  pixelsPerKm,
  viewportFor,
  type LatLng,
  type ZoneHeat,
  type ZoneOutline,
} from '../../lib/heatmap';
import { supabase } from '../../lib/supabase';
import { color, heatColor, heatStops } from '../../theme';
import { discoverStyles as s } from './styles';

/** The design's band height. The search radius spans half of it. */
export const BAND_HEIGHT = 132;

interface Props {
  centre: LatLng;
  radiusM: number;
  /** Defaults to the original band; Descubrir v3 draws it taller. */
  height?: number;
  /** Bottom-left, e.g. «Todo · próximos 7 días». */
  caption?: string;
  /** Laid over the top edge: the origin and radius controls. */
  overlay?: ReactNode;
}

export function HeatBand({ centre, radiusM, height = BAND_HEIGHT, caption, overlay }: Props) {
  const BAND = height;
  const [width, setWidth] = useState(0);
  const [zones, setZones] = useState<ZoneHeat[] | null>(null);
  const [outlines, setOutlines] = useState<ZoneOutline[]>([]);
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

  /**
   * The map under the heat: the zones themselves, drawn from their own
   * shapes. Refetched when the frame changes — a new radius or a new width
   * — and not on every render.
   */
  useEffect(() => {
    if (width === 0) return;
    let cancelled = false;

    fetchZoneOutlines(supabase, kind, boundsFor(viewportFor(radiusKm, width, BAND, centre)))
      .then((rows) => {
        if (!cancelled) setOutlines(rows);
      })
      .catch(() => {
        // Without the map the heat still reads. Lose the map, keep the heat.
        if (!cancelled) setOutlines([]);
      });

    return () => {
      cancelled = true;
    };
    // `centre` is a module constant in Descubrir; its parts are listed rather
    // than the object so a caller passing a fresh literal cannot loop.
  }, [kind, radiusKm, width, BAND, centre.lat, centre.lng]);

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  };

  const viewport = viewportFor(radiusKm, width, BAND, centre);
  const blobs = zones && width > 0 ? layoutBlobs(zones, viewport) : [];
  const ringPx = radiusKm * pixelsPerKm(viewport);
  const empty = zones !== null && blobs.length === 0;

  const label = failed
    ? 'Mapa de calor no disponible.'
    : zones === null
      ? 'Cargando el mapa de calor.'
      : heatSummary(blobs);

  return (
    <View style={s.bandWrap}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        onLayout={onLayout}
        style={[s.band, { height: BAND }]}
      >
        {width > 0 && (
          <Svg height={BAND} style={s.bandCanvas} width={width}>
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

            {/* The land. Where it stops, the sea shows through, so the coast
              draws itself — and every district border is a real border
              rather than the ruled grid this replaced. `evenodd` keeps a
              hole a hole. */}
            {outlines.map((zone) => (
              <Path
                d={pathFor(zone.outline, viewport)}
                fill={color.accent.deep}
                fillOpacity={0.22}
                fillRule="evenodd"
                key={zone.code}
                stroke={color.accent.deep}
                strokeOpacity={0.55}
                strokeWidth={0.6}
              />
            ))}

            {blobs.map((b) => (
              <Circle cx={b.x} cy={b.y} fill={`url(#heat-${b.code})`} key={b.code} r={b.r} />
            ))}

            {/* The radius the LIST is filtered to. The band deliberately looks
              further (see viewportFor), so without this ring a blob outside
              the filter reads as a session missing from the list. */}
            <Circle
              cx={width / 2}
              cy={BAND / 2}
              fill="none"
              r={ringPx}
              stroke={color.text.primary}
              strokeDasharray="5 4"
              strokeOpacity={0.45}
              strokeWidth={1.2}
            />

            {/* Where the search is centred. Not the viewer's position: Descubrir
              searches from a fixed point in San José until device location
              lands (roadmap P1 · 12). */}
            <Circle
              cx={width / 2}
              cy={BAND / 2}
              fill="none"
              r={24}
              stroke={color.accent.primary}
              strokeOpacity={0.35}
              strokeWidth={3}
            />
            <Circle
              cx={width / 2}
              cy={BAND / 2}
              fill="none"
              r={16}
              stroke={color.accent.primary}
              strokeWidth={2.5}
            />
            <Circle cx={width / 2} cy={BAND / 2} fill={color.accent.primary} r={8} />
          </Svg>
        )}

        {width > 0 && ringPx < width / 2 - 8 && (
          <View
            aria-hidden
            style={[s.ringLabel, { left: width / 2 + ringPx - 24, top: BAND / 2 - 11 }]}
          >
            <Text style={s.ringLabelText}>{radiusKm} km</Text>
          </View>
        )}

        {overlay ? <View style={s.bandOverlay}>{overlay}</View> : null}

        <View aria-hidden style={s.bandCaptionPill}>
          <Text style={s.bandCaptionText}>
            {caption ?? `Todo · próximos ${HEAT_WINDOW_DAYS} días`}
          </Text>
        </View>
        {(empty || failed) && (
          <View aria-hidden style={s.bandMessage}>
            <Text style={s.bandMessageText}>
              {failed
                ? 'No se pudo cargar el mapa de calor.'
                : 'Nada programado por aquí esta semana.'}
            </Text>
          </View>
        )}

        {/* The band's own scale. Heat must always show the key that decodes it,
          and this one measures people per zone — a different quantity from
          the occupancy scale further down, so it says its unit. */}
        <View aria-hidden style={s.bandLegend}>
          <View style={s.bandLegendRow}>
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
          {/* On the map itself, as the ODbL asks. */}
          <Text style={s.bandCredit}>© colaboradores de OpenStreetMap</Text>
        </View>
      </View>
    </View>
  );
}
