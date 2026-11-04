import { describe, expect, it } from 'vitest';

import { blockedSinceLabel, toBlockedPeople } from './blocks';

describe('toBlockedPeople', () => {
  it('keeps the public fields of each row, in order', () => {
    expect(
      toBlockedPeople([
        {
          id: 'u1',
          display_name: 'Mario R.',
          avatar_url: null,
          blocked_at: '2026-11-03T15:00:00Z',
        },
        { id: 'u2', display_name: 'Kevin S.', avatar_url: 'https://x/a.png', blocked_at: 'x' },
      ]),
    ).toEqual([
      { id: 'u1', displayName: 'Mario R.', avatarUrl: null, blockedAt: '2026-11-03T15:00:00Z' },
      { id: 'u2', displayName: 'Kevin S.', avatarUrl: 'https://x/a.png', blockedAt: 'x' },
    ]);
  });

  it('drops a row that cannot be unblocked or named', () => {
    expect(toBlockedPeople([{ display_name: 'Sin id' }, { id: 'u3' }, null, 'u4'])).toEqual([]);
  });

  it('reads anything that is not a list as an empty list', () => {
    expect(toBlockedPeople(null)).toEqual([]);
    expect(toBlockedPeople({ id: 'u1' })).toEqual([]);
  });
});

describe('blockedSinceLabel', () => {
  it('says the day in Costa Rica', () => {
    expect(blockedSinceLabel('2026-11-03T15:00:00Z')).toBe('Desde el 3 nov');
    // 01:00 UTC on the 4th is still the 3rd in Costa Rica.
    expect(blockedSinceLabel('2026-11-04T01:00:00Z')).toBe('Desde el 3 nov');
  });

  it('says nothing for an unknown date', () => {
    expect(blockedSinceLabel('')).toBe('');
    expect(blockedSinceLabel('ayer')).toBe('');
  });
});
