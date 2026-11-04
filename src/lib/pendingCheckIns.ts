/**
 * «Llegué» without signal, on the phone's side (0042; Estados v1).
 *
 * When the tap cannot reach the server, the session, the code and the time
 * of the tap are kept here and sent when the phone reconnects. The database
 * judges the tap by its own time, so a person who arrived on time is not
 * late because the trailhead had no signal.
 *
 * AsyncStorage (localStorage on the web), like the trusted link domains: a
 * per-device queue, and every read and write may fail. If the queue is lost,
 * the person is asked to tap again or the organizer marks them — both paths
 * already exist, so losing it costs a tap, not an attendance.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiError } from './errors';
import { selfCheckInOffline, type SelfCheckInOutcome } from './checkIn';

const KEY = 'movo.pendingCheckIns';

export interface PendingCheckIn {
  activityId: string;
  code: string;
  /** ISO instant of the tap. */
  tappedAt: string;
}

/** Pending taps older than this are dropped: the session is closed by now. */
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;

/** Narrow whatever was stored, and drop what is malformed or stale. */
export function parsePending(raw: string | null, now: Date = new Date()): PendingCheckIn[] {
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: PendingCheckIn[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    if (
      typeof r.activityId !== 'string' ||
      typeof r.code !== 'string' ||
      typeof r.tappedAt !== 'string'
    ) {
      continue;
    }
    const at = new Date(r.tappedAt).getTime();
    if (Number.isNaN(at) || now.getTime() - at > MAX_AGE_MS) continue;
    out.push({ activityId: r.activityId, code: r.code, tappedAt: r.tappedAt });
  }
  return out;
}

/** One pending tap per session: a second tap replaces the first. */
export function withPending(queue: PendingCheckIn[], next: PendingCheckIn): PendingCheckIn[] {
  return [...queue.filter((p) => p.activityId !== next.activityId), next];
}

export async function loadPending(): Promise<PendingCheckIn[]> {
  try {
    return parsePending(await AsyncStorage.getItem(KEY));
  } catch {
    return [];
  }
}

async function savePending(queue: PendingCheckIn[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(queue));
  } catch {
    // See the top of the file: a lost queue costs a tap, not an attendance.
  }
}

/** Keep a tap that could not be sent. */
export async function queueCheckIn(pending: PendingCheckIn): Promise<void> {
  await savePending(withPending(await loadPending(), pending));
}

export type SyncResult =
  | { activityId: string; outcome: SelfCheckInOutcome }
  /** The server answered no, with the sentence to show. Not retried. */
  | { activityId: string; refused: string };

/**
 * Whether an error is the server deciding, as opposed to the network failing.
 * A decision is final and the tap leaves the queue; anything else is retried
 * on the next reconnect.
 */
export function isDecision(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    (error.kind === 'invalid_state' || error.kind === 'forbidden' || error.kind === 'not_found')
  );
}

/**
 * Send every pending tap. Answers and refusals leave the queue; network
 * failures stay for next time. Returns what happened, for a toast.
 */
export async function syncPendingCheckIns(db: SupabaseClient): Promise<SyncResult[]> {
  const queue = await loadPending();
  if (queue.length === 0) return [];

  const results: SyncResult[] = [];
  const kept: PendingCheckIn[] = [];
  for (const pending of queue) {
    try {
      const outcome = await selfCheckInOffline(
        db,
        pending.activityId,
        pending.code,
        pending.tappedAt,
      );
      results.push({ activityId: pending.activityId, outcome });
    } catch (error) {
      if (isDecision(error)) {
        results.push({ activityId: pending.activityId, refused: error.message });
      } else {
        kept.push(pending);
      }
    }
  }
  await savePending(kept);
  return results;
}
