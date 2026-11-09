/**
 * «Invitarlas a la serie» — the organizer's half of 0052.
 *
 * The people who can be invited are the ones who were on a date of the
 * series and are not on all of its upcoming dates; the server decides who
 * they are, and invites each of them once, ever. The invitation is a notice;
 * accepting it is `join_series()` (0048) on the series page.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { toApiError } from './errors';

export interface InviteCandidate {
  userId: string;
  name: string;
  /** How many dates of this series they were on. */
  dates: number;
  invited: boolean;
}

export async function fetchInviteCandidates(
  db: SupabaseClient,
  seriesId: string,
): Promise<InviteCandidate[]> {
  const { data, error } = await db.rpc('series_invite_candidates', { p_series_id: seriesId });
  if (error) throw toApiError(error);
  return (
    (data ?? []) as {
      user_id: string;
      display_name: string | null;
      dates: number;
      invited: boolean;
    }[]
  ).map((row) => ({
    userId: row.user_id,
    name: row.display_name ?? 'Alguien',
    dates: row.dates,
    invited: row.invited,
  }));
}

/** At most 50 per call, the server's limit. Returns how many were invited now. */
export async function inviteToSeries(
  db: SupabaseClient,
  seriesId: string,
  userIds: readonly string[],
): Promise<number> {
  const { data, error } = await db.rpc('invite_to_series', {
    p_series_id: seriesId,
    p_user_ids: userIds.slice(0, 50),
  });
  if (error) throw toApiError(error);
  return typeof data === 'number' ? data : 0;
}

/** «Vino a 1 fecha», «Vino a 3 fechas». */
export function candidateLine(c: Pick<InviteCandidate, 'dates' | 'invited'>): string {
  const been = c.dates === 1 ? 'Estuvo en 1 fecha' : `Estuvo en ${String(c.dates)} fechas`;
  return c.invited ? `${been} · invitación enviada` : been;
}

/** The banner after inviting. */
export function invitedNotice(n: number): string {
  if (n === 0) return 'No había nadie nuevo a quien invitar.';
  return n === 1
    ? 'Invitaste a 1 persona a toda la serie. Le llega un aviso.'
    : `Invitaste a ${String(n)} personas a toda la serie. A cada una le llega un aviso.`;
}

export function explainInviteError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : '';
  if (message.includes('series is not active')) return 'Esta serie ya está cancelada.';
  if (message.includes('series takes single dates only')) {
    return 'Esta serie es por fechas sueltas, así que no se invita a toda la serie.';
  }
  if (message.includes('Solo quien organiza')) return 'Solo quien organiza la serie puede invitar.';
  return message || 'No se pudo enviar la invitación.';
}
