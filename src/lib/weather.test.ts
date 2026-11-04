import { describe, expect, it } from 'vitest';

import { cancelsForWeather } from './weather';

describe('cancelsForWeather', () => {
  it('is offered for the three water sports only', () => {
    expect(['surf', 'kayak', 'rafting'].every(cancelsForWeather)).toBe(true);
    expect(cancelsForWeather('running')).toBe(false);
    expect(cancelsForWeather('football')).toBe(false);
    expect(cancelsForWeather('unknown')).toBe(false);
  });
});
