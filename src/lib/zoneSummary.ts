/**
 * The zone sheet in Descubrir (Deportes v2 · 2, 0051).
 *
 * Counts only: sessions per sport, and people going when five or more —
 * below that the function returns null and the sheet says «menos de 5»,
 * because a count in a small district is an answer about a person.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { toApiError } from './errors';

export interface ZoneSummary {
  code: string;
  name: string;
  kind: 'provincia' | 'canton' | 'distrito';
  sessions: number;
  /** Null below five. */
  people: number | null;
  sports: { category_id: string; sessions: number }[];
  activity_ids: string[];
}

export async function fetchZoneSummary(
  db: SupabaseClient,
  code: string,
  categories: readonly string[] | null,
  days = 7,
): Promise<ZoneSummary> {
  const { data, error } = await db.rpc('zone_summary', {
    p_code: code,
    p_categories: categories && categories.length > 0 ? categories : null,
    p_days: days,
  });
  if (error) throw toApiError(error);
  return data as ZoneSummary;
}

/** «25 sesiones de tus deportes · 168 personas van», «1 sesión · menos de 5 personas». */
export function zoneHeadline(
  summary: Pick<ZoneSummary, 'sessions' | 'people'>,
  of: string,
): string {
  const sessions = `${summary.sessions === 1 ? '1 sesión' : `${String(summary.sessions)} sesiones`}${of}`;
  if (summary.sessions === 0) return `No hay sesiones${of} esta semana`;
  const people =
    summary.people === null ? 'menos de 5 personas van' : `${String(summary.people)} personas van`;
  return `${sessions} · ${people}`;
}

/** Bar widths as a share of the busiest sport, never thinner than a sliver. */
export function sportBars(
  sports: readonly { category_id: string; sessions: number }[],
): { category_id: string; sessions: number; share: number }[] {
  const top = sports.reduce((max, s) => Math.max(max, s.sessions), 0);
  return sports.map((s) => ({
    ...s,
    share: top === 0 ? 0 : Math.max(0.04, s.sessions / top),
  }));
}

/** «Tibás y alrededores» for a district; a cantón or province by its name. */
export function zoneTitle(summary: Pick<ZoneSummary, 'name' | 'kind'>): string {
  return summary.kind === 'distrito' ? `${summary.name} y alrededores` : summary.name;
}
