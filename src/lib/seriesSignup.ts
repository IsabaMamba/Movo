/**
 * How a series takes people (0053): the whole series, single dates, or both.
 *
 * The template row is readable only by its organizer and group, so anybody
 * else reads the two flags through `series_signup()`. The organizer sets them
 * with `set_series_signup()`; people already on dates keep them.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { toApiError } from './errors';

export interface SeriesSignup {
  allowWhole: boolean;
  allowSingle: boolean;
}

/** What every series did before 0053, and still does by default. */
export const BOTH: SeriesSignup = { allowWhole: true, allowSingle: true };

export type SignupKey = 'both' | 'whole' | 'single';

export function signupKey(rule: SeriesSignup): SignupKey {
  if (rule.allowWhole && rule.allowSingle) return 'both';
  return rule.allowWhole ? 'whole' : 'single';
}

export function signupFromKey(key: SignupKey): SeriesSignup {
  return { allowWhole: key !== 'single', allowSingle: key !== 'whole' };
}

/** The organizer's three choices, in the order the screen shows them. */
export const SIGNUP_OPTIONS: readonly { key: SignupKey; title: string; sub: string }[] = [
  {
    key: 'both',
    title: 'A toda la serie o por fecha',
    sub: 'Cada persona elige si va a todas o solo a las que le sirven.',
  },
  {
    key: 'whole',
    title: 'Solo a toda la serie',
    sub: 'Para un curso o un plan que avanza semana a semana. Quien no pueda ir un día igual puede avisar.',
  },
  {
    key: 'single',
    title: 'Solo por fecha',
    sub: 'Para un grupo abierto: nadie aparta ocho fechas que quizá no use.',
  },
];

/** Both on when the series cannot be read: that is what the server enforces by default. */
export async function fetchSeriesSignup(
  db: SupabaseClient,
  seriesId: string,
): Promise<SeriesSignup> {
  const { data, error } = await db.rpc('series_signup', { p_series_id: seriesId });
  if (error) throw toApiError(error);
  if (typeof data !== 'object' || data === null) return BOTH;
  const r = data as Record<string, unknown>;
  return { allowWhole: r.allow_whole !== false, allowSingle: r.allow_single !== false };
}

export async function setSeriesSignup(
  db: SupabaseClient,
  seriesId: string,
  rule: SeriesSignup,
): Promise<void> {
  const { error } = await db.rpc('set_series_signup', {
    p_series_id: seriesId,
    p_allow_whole: rule.allowWhole,
    p_allow_single: rule.allowSingle,
  });
  if (error) throw toApiError(error);
}

/** The line in a date's series box, before anybody taps. */
export function seriesBoxLine(rule: SeriesSignup): string {
  switch (signupKey(rule)) {
    case 'whole':
      return 'Esta serie se toma completa: al unirte, vas a todas las fechas.';
    case 'single':
      return 'Cada fecha tiene su propia lista: únete a las que te sirvan.';
    default:
      return 'Puedes unirte solo a esta fecha o a toda la serie.';
  }
}
