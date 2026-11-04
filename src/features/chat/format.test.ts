import { describe, expect, it } from 'vitest';

import { authorInitials, chatTime } from './format';

// Wednesday 4 November 2026, 12:00 in Costa Rica.
const NOW = new Date('2026-11-04T18:00:00Z');

describe('chatTime', () => {
  it('shows the time today, «ayer», the weekday, then the date', () => {
    expect(chatTime('2026-11-04T16:20:00Z', NOW)).toBe('10:20');
    expect(chatTime('2026-11-04T02:31:00Z', NOW)).toBe('ayer 20:31');
    expect(chatTime('2026-11-02T14:00:00Z', NOW)).toMatch(/^lun 08:00$/u);
    expect(chatTime('2026-10-20T14:00:00Z', NOW)).toBe('20 oct');
  });
});

describe('authorInitials', () => {
  it('takes the first and last word', () => {
    expect(authorInitials('Luis Arias')).toBe('LA');
    expect(authorInitials('Sofía')).toBe('S');
    expect(authorInitials(null)).toBe('·');
  });
});
