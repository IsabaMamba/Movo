import { describe, expect, it } from 'vitest';

import { monthLine, toMonthCounts } from './monthlyAttendance';

describe('monthLine', () => {
  it('says what was done that month', () => {
    expect(monthLine({ month: '2026-03-01', went: 6, organized: 2 }, 2026)).toBe(
      'En marzo fuiste a 6 sesiones y organizaste 2.',
    );
    expect(monthLine({ month: '2026-04-01', went: 1, organized: 0 }, 2026)).toBe(
      'En abril fuiste a 1 sesión.',
    );
    expect(monthLine({ month: '2026-05-01', went: 0, organized: 3 }, 2026)).toBe(
      'En mayo organizaste 3 sesiones.',
    );
  });

  it('adds the year only when it is not this one', () => {
    expect(monthLine({ month: '2025-12-01', went: 2, organized: 0 }, 2026)).toBe(
      'En diciembre de 2025 fuiste a 2 sesiones.',
    );
  });
});

describe('toMonthCounts', () => {
  it('keeps well-formed rows and drops the rest', () => {
    expect(
      toMonthCounts([{ month: '2026-03-01', went: 1, organized: 0 }, { went: 2 }, null]),
    ).toEqual([{ month: '2026-03-01', went: 1, organized: 0 }]);
    expect(toMonthCounts({})).toEqual([]);
  });
});
