/**
 * The heat ramp.
 *
 * Movo's one piece of information design: density rendered as temperature.
 * Two rules make it readable without the user having to learn anything.
 *
 * 1. Lightness rises monotonically across the ramp, so brighter always means
 *    busier. Verified in OKLab — this is why Aqua is absent despite being a
 *    brand colour: at L=0.53 it would read as hotter than orange (L=0.36).
 * 2. Both themes use the SAME eight colours. What differs is how quickly the
 *    ramp reaches heat — a single exponent. "Heatwave" is not a second palette.
 */

export type HeatMode = 'calma' | 'heatwave';

/** Eight stops, cold to hot. Derived in OKLab from the brand anchors. */
const STOPS: readonly string[] = [
  '#0B0F1F', // vacío — identical to bg.base so an empty cell disappears
  '#1B334A', // muy bajo
  '#2A677A', // bajo
  '#A86D65', // medio
  '#F36244', // activo
  '#FF9155', // muy activo
  '#FECA7D', // lleno
  '#F6E9D7', // pico
] as const;

/**
 * Distribution exponent. `t` in Calma; `t ** 0.6` in Heatwave pushes heat
 * earlier, so a mid-activity session reads teal in one mode and red in the other.
 */
const GAMMA: Record<HeatMode, number> = {
  calma: 1,
  heatwave: 0.6,
};

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) => Math.round(n).toString(16).padStart(2, '0').toUpperCase();
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * Colour for a normalized density `t` in [0, 1].
 *
 * Interpolates between adjacent stops in sRGB. With eight stops the error
 * against a full OKLab interpolation is not visible, and this runs cheaply
 * enough to colour every cell of a map on a mid-range Android.
 */
export function heatColor(t: number, mode: HeatMode = 'calma'): string {
  const adjusted = Math.pow(clamp01(t), GAMMA[mode]);
  const x = adjusted * (STOPS.length - 1);
  const i = Math.min(Math.floor(x), STOPS.length - 2);
  const f = x - i;

  const a = hexToRgb(STOPS[i]!);
  const b = hexToRgb(STOPS[i + 1]!);
  return rgbToHex(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
}

/** The eight stops as rendered in a given mode. For legends. */
export function heatStops(mode: HeatMode = 'calma'): string[] {
  return STOPS.map((_, i) => heatColor(i / (STOPS.length - 1), mode));
}

/**
 * Reference headcount used when a session has no capacity limit.
 *
 * `activities.max_participants` is nullable — an uncapped run club cannot say
 * "8 de 12" and has no denominator to normalize against. Rather than inventing
 * one, uncapped sessions are scaled against a fixed busy-session reference so
 * the map still reads, and the CARD shows an absolute count instead of a ratio.
 */
export const UNCAPPED_REFERENCE = 25;

/**
 * Normalize a session to a ramp position.
 *
 * Capped:   joined / max, so "full" always lands at the hot end.
 * Uncapped: joined / UNCAPPED_REFERENCE, saturating at the top.
 */
export function densityOf(joined: number, max: number | null): number {
  if (max !== null && max > 0) return clamp01(joined / max);
  return clamp01(joined / UNCAPPED_REFERENCE);
}

/**
 * How a card states its own occupancy. Two shapes, because capacity is nullable
 * and "8 van" is a different sentence from "8 de 12".
 */
export function occupancyLabel(joined: number, max: number | null): string {
  if (max === null) return `${joined} ${joined === 1 ? 'va' : 'van'}`;
  return `${joined} de ${max}`;
}
