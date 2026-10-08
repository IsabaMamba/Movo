/**
 * What the person agreed to, which text, and when (0030).
 *
 * `consents` is a log: a row for every grant and every withdrawal, never
 * changed afterwards. What is in force now is the latest row per purpose —
 * `inForce()` below. The database writes the rules row at sign-up and the
 * attendance-history rows from its own gate; this module writes the two the
 * device decides, location and push.
 *
 * Recording is best effort on purpose. By the time it runs, the browser or
 * the OS has already granted the permission and the person is waiting for
 * the thing they asked for. A failed log write must not take that away from
 * them; it shows up instead as a grant with no row, which is visible.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { toApiError } from './errors';

export type ConsentPurpose = 'rules' | 'location' | 'push' | 'attendance_history';

export interface ConsentRow {
  purpose: ConsentPurpose;
  version: string | null;
  granted: boolean;
  recorded_at: string;
}

/** The latest row per purpose, if its latest row is a grant. */
export function inForce(rows: readonly ConsentRow[]): Partial<Record<ConsentPurpose, ConsentRow>> {
  const latest = new Map<ConsentPurpose, ConsentRow>();
  for (const row of rows) {
    const seen = latest.get(row.purpose);
    if (!seen || row.recorded_at > seen.recorded_at) latest.set(row.purpose, row);
  }
  const result: Partial<Record<ConsentPurpose, ConsentRow>> = {};
  for (const [purpose, row] of latest) {
    if (row.granted) result[purpose] = row;
  }
  return result;
}

export async function fetchMyConsents(db: SupabaseClient): Promise<ConsentRow[]> {
  const { data, error } = await db
    .from('consents')
    .select('purpose, version, granted, recorded_at')
    .order('recorded_at', { ascending: true });
  if (error) throw toApiError(error);
  return (data ?? []) as ConsentRow[];
}

/**
 * Records a grant of `version`, or a withdrawal. The database ignores a grant
 * already in force and a withdrawal of nothing, so calling this on every tap
 * is fine. Never throws; returns whether it was recorded.
 */
export async function recordConsent(
  db: SupabaseClient,
  purpose: 'location' | 'push' | 'rules',
  version: string | null,
  granted: boolean,
): Promise<boolean> {
  try {
    const { error } = await db.rpc('record_consent', {
      p_purpose: purpose,
      p_version: version,
      p_granted: granted,
    });
    return !error;
  } catch {
    return false;
  }
}
