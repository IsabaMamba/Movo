import { describe, expect, it } from 'vitest';

import { FAMILY_COLOR, SPORT_FAMILY, sportColor } from './sport';

/** The 19 sports of Deportes v1, mirrored from 0036. */
describe('sport colours', () => {
  it('knows all nineteen sports, in six families', () => {
    expect(Object.keys(SPORT_FAMILY)).toHaveLength(19);
    expect(new Set(Object.values(SPORT_FAMILY)).size).toBe(6);
  });

  it('colours a sport by its family', () => {
    expect(sportColor('kayak')).toBe(FAMILY_COLOR.agua);
    expect(sportColor('trail_running')).toBe(sportColor('running'));
    expect(sportColor('padel', '#000')).toBe('#000');
  });

  it('keeps lilac for women-only', () => {
    expect(Object.values(FAMILY_COLOR)).not.toContain('#C7A6FF');
  });
});
