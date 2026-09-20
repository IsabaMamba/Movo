/**
 * The heat band on Descubrir: which zones it draws, where, how wide, how hot.
 *
 * Everything here is arithmetic on what `zone_heat()` returns, kept out of
 * the component so it can be tested without rendering anything. The privacy
 * decision lives in the database — each row is already snapped to its zone's
 * anchor point (ADR 0006) — so nothing in this file ever sees a venue's
 * position, and nothing here could leak one.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { toApiError } from './errors';

export type ZoneKind = 'provincia' | 'canton' | 'distrito';

/** One row of `zone_heat()`. A zone with no sessions is absent, never zero. */
export interface ZoneHeat {
  code: string;
  name: string;
  lng: number;
  lat: number;
  area_km2: number;
  sessions: number;
  joined: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * The window the band covers. It is `zone_heat()`'s own default, stated here
 * so the band can say it out loud: the list below runs to any future date,
 * and a map that silently meant something narrower would read as a mismatch.
 */
export const HEAT_WINDOW_DAYS = 7;

export async function fetchZoneHeat(
  db: SupabaseClient,
  kind: ZoneKind,
  from: Date = new Date(),
): Promise<ZoneHeat[]> {
  const to = new Date(from.getTime() + HEAT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const { data, error } = await db.rpc('zone_heat', {
    p_kind: kind,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) throw toApiError(error);
  // `area_km2` is numeric in Postgres; coerce rather than trust the wire type.
  return ((data ?? []) as ZoneHeat[]).map((row) => ({
    ...row,
    area_km2: Number(row.area_km2),
    sessions: Number(row.sessions),
    joined: Number(row.joined),
  }));
}

/**
 * ADR 0006: distrito when the view is local, cantón when it is regional.
 * Descubrir's radius chips are 5, 15 and 50 km; a distrito averages ~100 km²,
 * so at 50 km there would be dozens of blobs a few pixels apart.
 */
export function kindForRadius(radiusKm: number): ZoneKind {
  return radiusKm <= 20 ? 'distrito' : 'canton';
}

// ------------------------------------------------------------------ heat

/** The legend's top: at this many people a zone reads fully hot. "40+". */
export const PEOPLE_AT_PEAK = 40;

/**
 * Where a zone with sessions but nobody signed up yet sits on the ramp.
 *
 * Zero would draw it in the ramp's first stop, which is the background colour
 * — indistinguishable from a zone with nothing, and the ADR is explicit that
 * "quiet" and "nothing here" must read differently. 0.3 lands on violet: cold,
 * but there.
 */
export const SESSION_FLOOR = 0.3;

/**
 * Ramp position for a zone, from the people signed up in it.
 *
 * Colour encodes one thing, and the legend decodes it: people. ADR 0006 also
 * asks for a peak that falls as the zone's area rises; that is carried by
 * WIDTH here (a larger zone draws a wider blob), not by dimming the colour,
 * because a colour adjusted by area could no longer be read off the legend.
 */
export function heatLevel(zone: Pick<ZoneHeat, 'sessions' | 'joined'>): number {
  if (!(zone.sessions > 0)) return 0;
  const people = Number.isFinite(zone.joined) ? zone.joined : 0;
  return Math.max(SESSION_FLOOR, Math.min(1, people / PEOPLE_AT_PEAK));
}

// ------------------------------------------------------------ projection

const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LNG_AT_EQUATOR = 111.32;

export interface Viewport {
  centre: LatLng;
  /** Half the band's height, in kilometres. See `viewportFor`. */
  spanKm: number;
  width: number;
  height: number;
}

/**
 * How far the band looks, given the radius the list is filtered to.
 *
 * The two do not measure the same thing and must not pretend to. The list
 * filters by distance to the VENUE; the band only ever knows the distance to
 * the ZONE's anchor, because that is all `zone_heat()` returns — by design.
 * Ulloa's anchor is 7.4 km from the centre while the session inside it is
 * 4.9 km away, so a band filtered to 5 km would say "nothing scheduled" over
 * a list showing a session, and one filtered to the rectangle would light a
 * zone the list excludes.
 *
 * So the band is the surroundings, not the filter: it never looks closer than
 * MIN_SPAN_KM, and the component draws the search radius as a ring inside it.
 * What is yours and what is merely nearby stays visible, and neither lies.
 */
export const MIN_SPAN_KM = 15;

export function viewportFor(
  radiusKm: number,
  width: number,
  height: number,
  centre: LatLng,
): Viewport {
  return { centre, spanKm: Math.max(radiusKm, MIN_SPAN_KM), width, height };
}

/** Pixels per kilometre: `spanKm` reaches from the centre to the band's edge. */
export function pixelsPerKm(vp: Viewport): number {
  return vp.height / (2 * vp.spanKm);
}

/**
 * Equirectangular around the centre. Over the few tens of kilometres the band
 * covers, the error against a proper projection is under a pixel.
 */
export function project(point: LatLng, vp: Viewport): { x: number; y: number } {
  const scale = pixelsPerKm(vp);
  const cosLat = Math.cos((vp.centre.lat * Math.PI) / 180);
  const dxKm = (point.lng - vp.centre.lng) * KM_PER_DEG_LNG_AT_EQUATOR * cosLat;
  const dyKm = (point.lat - vp.centre.lat) * KM_PER_DEG_LAT;
  return { x: vp.width / 2 + dxKm * scale, y: vp.height / 2 - dyKm * scale };
}

/**
 * How far a blob's glow reaches, as a multiple of its zone's equivalent-circle
 * radius. Heat bleeds past a border; a blob exactly the size of its zone
 * would read as a coloured district, which is a choropleth, not a heat map.
 */
export const GLOW = 1.8;

/** Below this a blob is a dot, and a dot reads as a venue pin. */
export const MIN_BLOB_PX = 14;

export function blobRadius(areaKm2: number, vp: Viewport): number {
  const equivalentKm = Math.sqrt(Math.max(areaKm2, 0) / Math.PI);
  return Math.max(MIN_BLOB_PX, equivalentKm * GLOW * pixelsPerKm(vp));
}

export interface Blob {
  code: string;
  name: string;
  x: number;
  y: number;
  r: number;
  level: number;
  sessions: number;
  joined: number;
}

/**
 * The blobs to draw, coolest first so the hottest paint on top. A zone is
 * kept if any of its glow reaches the band; its anchor may be off the edge.
 */
export function layoutBlobs(zones: readonly ZoneHeat[], vp: Viewport): Blob[] {
  return zones
    .map((zone) => {
      const { x, y } = project(zone, vp);
      return {
        code: zone.code,
        name: zone.name,
        x,
        y,
        r: blobRadius(zone.area_km2, vp),
        level: heatLevel(zone),
        sessions: zone.sessions,
        joined: zone.joined,
      };
    })
    .filter(
      (b) =>
        b.level > 0 &&
        b.x + b.r > 0 &&
        b.x - b.r < vp.width &&
        b.y + b.r > 0 &&
        b.y - b.r < vp.height,
    )
    .sort((a, b) => a.level - b.level);
}

// ---------------------------------------------------------------- words

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What a screen reader hears for the whole band. The blobs are a picture of
 * this sentence, not the other way round: hottest zone first, because that is
 * where a sighted eye goes.
 */
export function heatSummary(blobs: readonly Blob[]): string {
  const where = 'alrededor del centro de búsqueda';
  if (blobs.length === 0) {
    return `Mapa de calor: nada programado ${where} en los próximos ${HEAT_WINDOW_DAYS} días.`;
  }
  const zones = [...blobs]
    .sort((a, b) => b.level - a.level || b.sessions - a.sessions)
    .map(
      (b) =>
        `${b.name}, ${plural(b.sessions, 'sesión', 'sesiones')} y ` +
        `${plural(b.joined, 'persona apuntada', 'personas apuntadas')}`,
    );
  return `Mapa de calor de los próximos ${HEAT_WINDOW_DAYS} días ${where}: ${zones.join('; ')}.`;
}
