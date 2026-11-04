/**
 * The small colour beside a sport's name: a dot on a chip, a thin bar on a
 * card. A hint of which sport, never a surface, and never the heat ramp —
 * heat means occupancy (ADR 0004).
 *
 * Since the 3 November boards (Deportes v1, 0036) the colour belongs to the
 * family, not the sport: nineteen colours cannot be told apart, six can, and
 * the sport's name always goes beside it. Lilac (#C7A6FF) is reserved for
 * women-only and no family comes near it.
 */

import type { SportFamily } from '../types/database';

export const FAMILY_COLOR: Record<SportFamily, string> = {
  correr: '#FF8A3F',
  montana: '#E44C3D',
  balon: '#FFC27B',
  ruedas: '#8FD16A',
  entrenar: '#FF7AA2',
  agua: '#4FA3FD',
};

/**
 * The family colour when it is the text itself rather than a dot beside it.
 * Montaña's red is too dark to read on the ground (Accesibilidad v1); the
 * others pass as they are.
 */
export const FAMILY_TEXT_COLOR: Record<SportFamily, string> = {
  ...FAMILY_COLOR,
  montana: '#F2705F',
};

export const FAMILY_NAME: Record<SportFamily, string> = {
  correr: 'Correr',
  montana: 'Montaña',
  balon: 'Balón',
  ruedas: 'Ruedas',
  entrenar: 'Entrenar',
  agua: 'Agua',
};

/**
 * Which family each sport is in, mirrored from `categories.family` so a
 * screen holding only a category id can colour it. 0036 is the source.
 */
export const SPORT_FAMILY: Record<string, SportFamily> = {
  running: 'correr',
  trail_running: 'correr',
  hiking: 'montana',
  football: 'balon',
  volleyball: 'balon',
  basketball: 'balon',
  ultimate_frisbee: 'balon',
  touch_rugby: 'balon',
  softball: 'balon',
  baseball: 'balon',
  cycling: 'ruedas',
  mountain_biking: 'ruedas',
  yoga: 'entrenar',
  bootcamp: 'entrenar',
  calisthenics: 'entrenar',
  dance: 'entrenar',
  surf: 'agua',
  kayak: 'agua',
  rafting: 'agua',
};

/** Unknown sports get the cool accent rather than a guess. */
export function sportColor(id: string, fallback = '#7FB8D8'): string {
  const family = SPORT_FAMILY[id];
  return family ? FAMILY_COLOR[family] : fallback;
}
