/**
 * Cancelling for a CNE alert (0041).
 *
 * The third fixed rule of every water session (Deportes v1 · 5, Normas v4 ·
 * 30): if the CNE declares an alert for the area, the session is cancelled.
 * An organizer cancels their own session with `cancelForWeather`; the team
 * cancels every water session in a provincia, cantón or distrito at once with
 * `cancelWaterSessionsInZone`, because an alert is declared for an area.
 *
 * Only water sessions. A football match under the same rain is cancelled with
 * `cancelActivity` and a reason, because there the organizer decides.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { SPORT_FAMILY } from '../theme/sport';
import { toApiError } from './errors';

/** Whether «Cancelar por alerta de la CNE» is offered for this sport. */
export function cancelsForWeather(categoryId: string): boolean {
  return SPORT_FAMILY[categoryId] === 'agua';
}

/**
 * The organizer (or the team) cancels one water session. `alert` is the CNE's
 * words — «alerta amarilla en el Golfo de Nicoya» — and is what everybody
 * going reads. Returns how many people were told.
 */
export async function cancelForWeather(
  db: SupabaseClient,
  activityId: string,
  alert: string,
): Promise<number> {
  const { data, error } = await db.rpc('cancel_for_weather', {
    p_activity_id: activityId,
    p_alert: alert.trim() || null,
  });
  if (error) throw toApiError(error);
  return (data as number) ?? 0;
}

export interface ZoneCancellation {
  sessionsCancelled: number;
  peopleNotified: number;
}

/** Staff only. Every water session in the zone that starts before `until`. */
export async function cancelWaterSessionsInZone(
  db: SupabaseClient,
  zoneCode: string,
  until: Date,
  alert: string,
): Promise<ZoneCancellation> {
  const { data, error } = await db.rpc('cancel_water_sessions_in_zone', {
    p_zone_code: zoneCode,
    p_until: until.toISOString(),
    p_alert: alert.trim(),
  });
  if (error) throw toApiError(error);
  const r = (data ?? {}) as { sessions_cancelled?: number; people_notified?: number };
  return { sessionsCancelled: r.sessions_cancelled ?? 0, peopleNotified: r.people_notified ?? 0 };
}
