import { describe, expect, it } from 'vitest';

import { chipDay, renewalDates } from './seriesRenewal';

describe('renewalDates', () => {
  it('gives 8 weekly dates after the last one', () => {
    const dates = renewalDates('2026-12-08');
    expect(dates).toHaveLength(8);
    expect(dates[0]).toBe('2026-12-15');
    expect(dates[7]).toBe('2027-02-02');
  });

  it('moves the run a week for each date left out', () => {
    const dates = renewalDates('2026-12-08', 8, ['2026-12-29']);
    expect(dates).not.toContain('2026-12-29');
    expect(dates).toHaveLength(8);
    expect(dates[7]).toBe('2027-02-09');
  });

  it('never goes past 12', () => {
    expect(renewalDates('2026-12-08', 40)).toHaveLength(12);
    expect(renewalDates('2026-12-08', 0)).toEqual([]);
  });
});

describe('chipDay', () => {
  it('reads like the board', () => {
    expect(chipDay('2026-12-15')).toBe('15 dic');
    expect(chipDay('2027-02-02')).toBe('2 feb');
  });
});
