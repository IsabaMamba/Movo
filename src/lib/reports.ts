/**
 * The report queue, as data.
 *
 * Since #29 the report button writes real rows, and until 0012 nothing could
 * read them: `reports_read_own` shows a reporter their own report and nobody
 * else's, so the queue was reachable only with the service key. 0012 adds the
 * `staff` table, `is_staff()`, the `reports_read_staff` policy and
 * `resolve_report()`. This file is the client side of exactly those three.
 *
 * Two things are deliberately absent:
 *
 *   - No membership check. `staff` has no grants at all, so there is nothing
 *     to query: a non-staff caller gets an empty list from the policy, not an
 *     error. The database is the boundary and this file does not pretend to
 *     be a second one.
 *   - No way to act on a report. `resolve_report()` records a judgement and
 *     stops there; cancelling a session, hiding a profile and blocking an
 *     account are separate powers that do not exist yet.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { ActivityStatus, Report, ReportStatus, ReportSubject } from '../types/database';
import { REPORT_REASONS } from './activities';
import { toApiError } from './errors';

// ------------------------------------------------------------- vocabulary

/**
 * `reports.reason` is free text in the column and a closed list in the form.
 * The queue reads back whatever was written, so an unrecognised value is shown
 * as-is rather than dropped — a reason the reviewer cannot read is worse than
 * an ugly one.
 */
const REASON_LABEL: Record<string, string> = Object.fromEntries(
  REPORT_REASONS.map((option) => [option.value, option.label]),
);

export function reportReasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason;
}

/** What was reported. `reports` stores only the type and a bare uuid. */
export const REPORT_SUBJECT_LABEL: Record<ReportSubject, string> = {
  user: 'Una persona',
  activity: 'Una sesión',
  message: 'Un mensaje',
  community: 'Un grupo',
};

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  open: 'Sin revisar',
  reviewing: 'En revisión',
  actioned: 'Se actuó',
  dismissed: 'Descartado',
};

/**
 * The states `resolve_report()` accepts. It refuses `open` outright: a report
 * is born there and moving it back would erase reviewed_by and reviewed_at,
 * which is the whole audit trail.
 */
export type ReportResolution = Exclude<ReportStatus, 'open'>;

/** `actioned` and `dismissed` are terminal — the function refuses both twice. */
export function isResolved(status: ReportStatus): boolean {
  return status === 'actioned' || status === 'dismissed';
}

// ------------------------------------------------------------------ rows

/** Enough of a reported session to judge the report without leaving the queue. */
export interface ReportedActivity {
  id: string;
  title: string;
  starts_at: string;
  status: ActivityStatus;
  /** Null if the organiser's profile is unreadable — see `profiles_read`. */
  organizer: { id: string; display_name: string } | null;
}

/** A public name, or null when `profiles_read` hides the row from this reader. */
type PublicProfile = { id: string; display_name: string } | null;

export interface QueuedReport extends Report {
  reporter: PublicProfile;
  /** Who resolved it, for a report that is already resolved. */
  reviewer: PublicProfile;
  /**
   * The reported session, for `subject_type === 'activity'` only. Null for
   * every other subject — and also null when the session exists but this
   * reader cannot see it, which `fetchReportQueue` explains.
   */
  activity: ReportedActivity | null;
}

/** Which half of the queue to read. */
export type QueueView = 'pending' | 'resolved';

const VIEW_STATUSES: Record<QueueView, ReportStatus[]> = {
  pending: ['open', 'reviewing'],
  resolved: ['actioned', 'dismissed'],
};

/**
 * One page of the queue.
 *
 * `pending` is ordered oldest first, which is the opposite of every other list
 * in the product. A feed is sorted by recency because the newest session is
 * the most useful one; a safety queue is sorted by age because the report that
 * has waited longest is the one somebody is still waiting on. `reports` has
 * carried a `(status, created_at)` index since 0001 for exactly this.
 *
 * `resolved` is ordered by `reviewed_at` descending instead: a report that is
 * finished is not waiting for anybody, and what a reviewer wants there is what
 * was decided most recently.
 */
export async function fetchReportQueue(
  db: SupabaseClient,
  view: QueueView = 'pending',
): Promise<QueuedReport[]> {
  const query = db
    .from('reports')
    .select(
      '*, reporter:profiles!reports_reporter_id_fkey(id, display_name), ' +
        'reviewer:profiles!reports_reviewed_by_fkey(id, display_name)',
    )
    .in('status', VIEW_STATUSES[view]);

  const { data, error } =
    view === 'pending'
      ? await query.order('created_at', { ascending: true })
      : await query.order('reviewed_at', { ascending: false, nullsFirst: false });

  if (error) throw toApiError(error);

  const rows = (data ?? []) as unknown as Omit<QueuedReport, 'activity'>[];
  const sessions = await fetchReportedActivities(db, rows);

  return rows.map((row) => ({
    ...row,
    activity: row.subject_type === 'activity' ? (sessions.get(row.subject_id) ?? null) : null,
  }));
}

/**
 * The sessions behind the `activity` reports, in one extra round trip.
 *
 * `reports.subject_id` points at four different tables depending on
 * `subject_type`, so it carries no foreign key and PostgREST cannot embed it.
 * The join has to happen here — and it has to happen, because "comportamiento"
 * with a bare uuid under it is not something a person can act on.
 *
 * A session can come back missing, and that is not a bug in this function:
 * `activities_read` (0003) was never widened for staff, so it still only shows
 * public published, full or completed sessions, plus the reader's own. A
 * reported session that was since CANCELLED, or that is community-only,
 * disappears from this map for a reviewer who is not on its roster — which is
 * precisely the session somebody is most likely to have reported. The screen
 * says so out loud instead of rendering a blank; the fix is a policy, not a
 * client workaround.
 */
async function fetchReportedActivities(
  db: SupabaseClient,
  rows: Pick<Report, 'subject_type' | 'subject_id'>[],
): Promise<Map<string, ReportedActivity>> {
  const ids = [
    ...new Set(rows.filter((row) => row.subject_type === 'activity').map((row) => row.subject_id)),
  ];
  if (ids.length === 0) return new Map();

  const { data, error } = await db
    .from('activities')
    .select(
      'id, title, starts_at, status, ' +
        'organizer:profiles!activities_organizer_id_fkey(id, display_name)',
    )
    .in('id', ids);

  if (error) throw toApiError(error);

  const found = (data ?? []) as unknown as ReportedActivity[];
  return new Map(found.map((activity) => [activity.id, activity]));
}

// ------------------------------------------------------------ resolution

/**
 * Record a decision about a report. The only way its state changes — there is
 * no UPDATE grant on `reports`.
 *
 * The function stamps `reviewed_by` from `auth.uid()` rather than taking it as
 * an argument, refuses `open`, refuses a report that is already resolved, and
 * writes the reporter a `report_resolved` notification when the status is
 * `actioned` or `dismissed`. Everything this call can be refused for is a
 * SQLSTATE the `ApiError` above already names.
 *
 * `actionTaken` is blanked to null when it is empty — the function trims it
 * the same way, so a note of spaces is a note of nothing in both places.
 */
export async function resolveReport(
  db: SupabaseClient,
  reportId: string,
  status: ReportResolution,
  actionTaken?: string,
): Promise<void> {
  const { error } = await db.rpc('resolve_report', {
    p_report_id: reportId,
    p_status: status,
    p_action_taken: actionTaken?.trim() || null,
  });
  if (error) throw toApiError(error);
}

/**
 * Cancel the session a report is about, and record it — one call, one
 * transaction (moderate_cancel_activity, 0019).
 *
 * Staff only. The roster and the organizer are told the team cancelled it and
 * nothing more; the note goes into `action_taken`, prefixed with what was
 * done, and the report becomes `actioned`. Refused with 22023 when the note
 * is blank, the report is resolved or not about a session, or the session is
 * already cancelled or over. Returns how many people on the roster were told.
 */
export async function moderateCancelActivity(
  db: SupabaseClient,
  reportId: string,
  note: string,
): Promise<number> {
  const { data, error } = await db.rpc('moderate_cancel_activity', {
    p_report_id: reportId,
    p_note: note.trim(),
  });
  if (error) throw toApiError(error);
  return (data as number | null) ?? 0;
}

/**
 * Whether the team can still cancel this report's session from the queue:
 * the report is about a session, the reviewer can read it, and it is neither
 * cancelled nor over. Mirrors the function's refusals so the button is not
 * offered for a call that would only throw.
 */
export function canModerateCancel(report: QueuedReport): boolean {
  if (isResolved(report.status) || report.subject_type !== 'activity') return false;
  const status = report.activity?.status;
  return status === 'published' || status === 'full' || status === 'draft';
}

// ---------------------------------------------------------------- waiting

const MS_PER_DAY = 86_400_000;

/** Whole days since the report was filed. Floored, never negative. */
export function daysWaiting(createdAt: string, now: Date = new Date()): number {
  const elapsed = now.getTime() - new Date(createdAt).getTime();
  return Math.max(0, Math.floor(elapsed / MS_PER_DAY));
}

/**
 * How long this one has been sitting there, as a sentence.
 *
 * The date alone does not read as a delay — "15 de septiembre" is a fact, "12
 * días esperando" is the reason to open it first.
 */
export function waitingLabel(createdAt: string, now?: Date): string {
  const days = daysWaiting(createdAt, now);
  if (days === 0) return 'Llegó hoy';
  if (days === 1) return 'Esperando 1 día';
  return `Esperando ${days} días`;
}
