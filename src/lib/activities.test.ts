import { describe, expect, it } from 'vitest';

import { formatSessionTime } from './activities';

/**
 * The session time is the one piece of text somebody acts on at a gate at
 * 5 a.m. It must read the same on every screen: 24-hour, Costa Rica time.
 */
describe('formatSessionTime', () => {
  it('uses the 24-hour clock', () => {
    // 2026-09-30 00:00 UTC is Tuesday 29 September, 18:00 in Costa Rica.
    const label = formatSessionTime('2026-09-30T00:00:00.000Z');
    expect(label).toContain('18:00');
    expect(label).not.toMatch(/[ap]\.\s?m\./);
  });

  it('pads the early hours, so 5 a.m. is 05:00', () => {
    // 11:30 UTC is 05:30 in Costa Rica.
    expect(formatSessionTime('2026-09-29T11:30:00.000Z')).toContain('05:30');
  });

  it('says midnight as 00, never 24', () => {
    // 06:00 UTC is 00:00 in Costa Rica.
    expect(formatSessionTime('2026-09-29T06:00:00.000Z')).toContain('00:00');
  });

  it('keeps the day in Costa Rica time whatever the device says', () => {
    // As an instant this is the 30th; in Costa Rica it is still the 29th.
    expect(formatSessionTime('2026-09-30T00:00:00.000Z')).toMatch(/29/);
  });
});
