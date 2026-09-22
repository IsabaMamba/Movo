import { describe, expect, it } from 'vitest';

import { canModerateCancel, canSuspend, type QueuedReport } from './reports';
import type { ActivityStatus, ReportStatus, ReportSubject } from '../types/database';

/**
 * «Cancelar la sesión» is the one control in the queue that changes something
 * outside the report. It is offered only when moderate_cancel_activity() would
 * accept the call, so a reviewer never presses a grave button to get an error.
 */
function report(
  status: ReportStatus,
  subject: ReportSubject,
  activity: ActivityStatus | null,
): QueuedReport {
  return {
    id: 'r1',
    reporter_id: 'u1',
    subject_type: subject,
    subject_id: 'a1',
    reason: 'comportamiento',
    details: null,
    status,
    reviewed_by: null,
    reviewed_at: null,
    action_taken: null,
    created_at: '2026-09-20T12:00:00.000Z',
    reporter: null,
    reviewer: null,
    activity:
      activity === null
        ? null
        : {
            id: 'a1',
            title: 'Mejenga',
            starts_at: '2026-09-25T12:00:00.000Z',
            status: activity,
            organizer: null,
          },
  } as QueuedReport;
}

describe('canModerateCancel', () => {
  it('offers it for an open or in-review report about a session that is still on', () => {
    expect(canModerateCancel(report('open', 'activity', 'published'))).toBe(true);
    expect(canModerateCancel(report('reviewing', 'activity', 'full'))).toBe(true);
  });

  it('does not offer it once the report is resolved', () => {
    expect(canModerateCancel(report('actioned', 'activity', 'published'))).toBe(false);
    expect(canModerateCancel(report('dismissed', 'activity', 'published'))).toBe(false);
  });

  it('does not offer it for a session already cancelled or over', () => {
    expect(canModerateCancel(report('open', 'activity', 'cancelled'))).toBe(false);
    expect(canModerateCancel(report('open', 'activity', 'completed'))).toBe(false);
  });

  it('does not offer it when the report is not about a session, or the session cannot be read', () => {
    expect(canModerateCancel(report('open', 'user', null))).toBe(false);
    expect(canModerateCancel(report('open', 'activity', null))).toBe(false);
  });
});

describe('canSuspend', () => {
  it('offers it for an unresolved report that points at a person', () => {
    expect(canSuspend(report('open', 'user', null))).toBe(true);
    expect(canSuspend(report('reviewing', 'activity', 'published'))).toBe(true);
    expect(canSuspend(report('open', 'message', null))).toBe(true);
  });

  it('offers it even when the session is already cancelled', () => {
    // The organizer can still be the problem after the session is gone.
    expect(canSuspend(report('open', 'activity', 'cancelled'))).toBe(true);
  });

  it('does not offer it for a group, or once the report is resolved', () => {
    expect(canSuspend(report('open', 'community', null))).toBe(false);
    expect(canSuspend(report('actioned', 'user', null))).toBe(false);
  });
});
