import { describe, expect, it } from 'vitest';

import {
  dateList,
  explainMemberError,
  isInSeries,
  joinPreview,
  memberDay,
  memberDayLong,
  memberStats,
  seriesCadence,
  type MemberSeriesDate,
} from './seriesMember';

/**
 * A series seen from inside (Perfiles v1 · 3–6). The sheet has to say before
 * the tap which dates join_series() gives a place and which it waitlists, and
 * the inside view counts only the caller's own dates.
 */

// Saturdays at 07:00 Costa Rica (13:00 UTC).
const sat = (day: number, month = 11) =>
  `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T13:00:00Z`;

function date(over: Partial<MemberSeriesDate> & { starts_at: string }): MemberSeriesDate {
  return {
    id: over.starts_at,
    status: 'published',
    joined_count: 3,
    max_participants: 12,
    past: false,
    mine: null,
    position: null,
    ...over,
  };
}

const board = [
  date({ starts_at: sat(31, 10), past: true, status: 'completed', mine: 'attended' }),
  date({ starts_at: sat(7), mine: 'joined' }),
  date({ starts_at: sat(14), mine: 'joined' }),
  date({ starts_at: sat(21), mine: 'joined' }),
  date({ starts_at: sat(28), mine: 'joined' }),
  date({ starts_at: sat(5, 12), joined_count: 12, mine: 'waitlisted', position: 2 }),
];

describe('joinPreview', () => {
  it('puts a full date on the waitlist and every other upcoming date in', () => {
    const preview = joinPreview([
      date({ starts_at: sat(31, 10), past: true }),
      date({ starts_at: sat(7) }),
      date({ starts_at: sat(14), joined_count: 12 }),
      date({ starts_at: sat(21), max_participants: null, joined_count: 40 }),
    ]);
    expect(preview.places.map((d) => d.starts_at)).toEqual([sat(7), sat(21)]);
    expect(preview.waiting.map((d) => d.starts_at)).toEqual([sat(14)]);
  });

  it('keeps a place the caller already has on a date that filled since', () => {
    const preview = joinPreview([date({ starts_at: sat(7), joined_count: 12, mine: 'joined' })]);
    expect(preview.places).toHaveLength(1);
  });
});

describe('memberStats and isInSeries', () => {
  it('counts only the caller: arrived, ahead and waiting', () => {
    expect(memberStats(board)).toEqual({ arrived: 1, wasOn: 1, ahead: 4, waiting: 1 });
    expect(isInSeries(board)).toBe(true);
  });

  it('is not in the series with only past dates', () => {
    expect(isInSeries([board[0] as MemberSeriesDate])).toBe(false);
  });

  it('is not in the series after leaving every date', () => {
    expect(isInSeries(board.map((d) => ({ ...d, mine: d.past ? d.mine : 'cancelled' })))).toBe(
      false,
    );
  });
});

describe('words', () => {
  it('names the cadence from the first date', () => {
    expect(seriesCadence(board)).toBe('Cada sábado · 07:00 · 6 fechas');
  });

  it('lists dates in one month as the board does', () => {
    expect(dateList([sat(7), sat(14), sat(21), sat(28)])).toBe('7, 14, 21 y 28 de noviembre');
    expect(dateList([sat(28), sat(5, 12)])).toBe('28 de noviembre y 5 de diciembre');
    expect(dateList([sat(5, 12)])).toBe('5 de diciembre');
  });

  it('writes a day short and long', () => {
    expect(memberDay(sat(7))).toBe('Sáb 7 nov');
    expect(memberDayLong(sat(7))).toBe('sábado 7');
  });

  it('explains the refusals in Spanish', () => {
    expect(explainMemberError(new Error('series has no upcoming dates'))).toBe(
      'Esta serie ya no tiene fechas por delante.',
    );
    expect(explainMemberError(new Error('community members only'))).toMatch(/solo para el grupo/);
  });
});
