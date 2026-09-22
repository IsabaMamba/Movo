import { describe, expect, it } from 'vitest';

import { endsAtFor, suspensionUntilLabel } from './suspensions';
import { toInboxItem } from './notifications';
import type { Notification } from '../types/database';

/**
 * The suspended person is told two things and only two: that the account is
 * suspended, and until when. A wrong end date tells somebody to wait a week
 * for a suspension that has no end, or the reverse.
 */

describe('suspensionUntilLabel', () => {
  it('says there is no end when there is none', () => {
    expect(suspensionUntilLabel(null)).toBe('sin fecha de fin');
  });

  it('gives the end in Costa Rica time whatever the device says', () => {
    // 2026-09-29 00:30 UTC is 28 September, 18:30 in Costa Rica (UTC-6).
    const label = suspensionUntilLabel('2026-09-29T00:30:00.000Z');
    expect(label).toMatch(/^hasta el 28 de septiembre/);
    expect(label).toContain('18:30');
  });
});

describe('endsAtFor', () => {
  const now = new Date('2026-09-21T12:00:00.000Z');

  it('counts whole days from now', () => {
    expect(endsAtFor('7d', now)).toBe('2026-09-28T12:00:00.000Z');
    expect(endsAtFor('30d', now)).toBe('2026-10-21T12:00:00.000Z');
  });

  it('has no end for «Sin fecha de fin»', () => {
    expect(endsAtFor('none', now)).toBeNull();
  });
});

function row(over: Partial<Notification>): Notification {
  return {
    id: 'n1',
    user_id: 'u1',
    type: 'account_suspended',
    payload: {},
    read_at: null,
    created_at: '2026-09-21T12:00:00.000Z',
    ...over,
  };
}

describe('the suspension notices', () => {
  it('tells the person until when, and what it means', () => {
    const item = toInboxItem(row({ payload: { ends_at: '2026-09-29T00:30:00.000Z' } }));
    expect(item.text).toMatch(/^El equipo de Movo suspendió tu cuenta hasta el 28 de septiembre/);
    expect(item.text).toContain('no puedes crear sesiones');
    expect(item.activityId).toBeNull();
  });

  it('says there is no end when ends_at is null', () => {
    const item = toInboxItem(row({ payload: { ends_at: null } }));
    expect(item.text).toContain('suspendió tu cuenta sin fecha de fin');
  });

  it('never mentions a report, even if a payload carried one', () => {
    const item = toInboxItem(row({ payload: { ends_at: null, report_id: 'r1', reason: 'acoso' } }));
    expect(item.text).not.toMatch(/report|acoso/i);
  });

  it('tells the person when it is lifted', () => {
    const item = toInboxItem(row({ type: 'account_restored' }));
    expect(item.text).toBe(
      'El equipo de Movo levantó la suspensión de tu cuenta. Ya puedes volver a usar Movo.',
    );
  });
});
