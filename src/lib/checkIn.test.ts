import { describe, expect, it } from 'vitest';

import { checkedInBy, checkInWindow, cleanCode, nextArrival, outcomeText } from './checkIn';

/**
 * The window must match self_check_in() in 0033 to the minute: a button that
 * says «Llegué» while the database says «todavía no» is the screen lying.
 */
describe('checkInWindow', () => {
  const start = '2026-10-20T12:00:00.000Z';
  const at = (iso: string) => new Date(iso);

  it('is early until 15 minutes before', () => {
    expect(checkInWindow(start, at('2026-10-20T11:44:59.000Z'))).toBe('early');
  });

  it('opens exactly 15 minutes before and closes 45 minutes after', () => {
    expect(checkInWindow(start, at('2026-10-20T11:45:00.000Z'))).toBe('open');
    expect(checkInWindow(start, at('2026-10-20T12:45:00.000Z'))).toBe('open');
    expect(checkInWindow(start, at('2026-10-20T12:45:01.000Z'))).toBe('late');
  });
});

describe('cleanCode', () => {
  it('keeps four digits and nothing else', () => {
    expect(cleanCode(' 4 7-2 9 ')).toBe('4729');
    expect(cleanCode('47291')).toBe('4729');
    expect(cleanCode('ab')).toBe('');
  });
});

describe('outcomeText', () => {
  it('tells a locked person who can still mark them', () => {
    expect(outcomeText('locked')).toContain('quien organiza');
  });

  it('never says the code itself or how many tries are left', () => {
    for (const outcome of ['checked_in', 'already', 'wrong_code', 'locked'] as const) {
      expect(outcomeText(outcome)).not.toMatch(/\d{4}|te quedan/u);
    }
  });
});

describe('checkedInBy', () => {
  it('tells the person who marked themselves from the organizer', () => {
    expect(checkedInBy('u1', 'u1')).toBe('self');
    expect(checkedInBy('u1', 'org')).toBe('organizer');
    expect(checkedInBy('u1', null)).toBeNull();
  });
});

describe('nextArrival', () => {
  const now = new Date('2026-10-20T12:00:00.000Z');
  const entry = (status: string, startsAt: string, activityStatus = 'published') => ({
    status,
    activity: { status: activityStatus, starts_at: startsAt },
  });

  it('picks the soonest session still inside its window or ahead today', () => {
    const late = entry('joined', '2026-10-20T10:00:00.000Z');
    const now10 = entry('joined', '2026-10-20T11:30:00.000Z');
    const later = entry('joined', '2026-10-20T18:00:00.000Z');
    expect(nextArrival([later, late, now10], now)).toBe(now10);
  });

  it('skips waiting, cancelled, closed and anything more than a day away', () => {
    expect(
      nextArrival(
        [
          entry('waitlisted', '2026-10-20T12:10:00.000Z'),
          entry('joined', '2026-10-20T12:10:00.000Z', 'cancelled'),
          entry('attended', '2026-10-20T11:50:00.000Z', 'completed'),
          entry('joined', '2026-10-22T12:00:00.000Z'),
        ],
        now,
      ),
    ).toBeNull();
  });
});
