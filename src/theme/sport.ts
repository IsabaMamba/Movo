/**
 * The small colour beside a sport's name on the 2 November boards: a dot on
 * a chip, a thin bar on a card. A hint of which sport, never a surface, and
 * never the heat ramp — heat means occupancy (ADR 0004).
 */

const SPORT_COLOR: Record<string, string> = {
  running: '#FF9F45',
  hiking: '#F0644F',
  football: '#FFC56B',
  cycling: '#7FD1C7',
  yoga: '#C7A6FF',
};

/** Unknown sports get the cool accent rather than a guess. */
export function sportColor(id: string, fallback = '#7FB8D8'): string {
  return SPORT_COLOR[id] ?? fallback;
}
