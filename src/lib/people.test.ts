import { describe, expect, it } from 'vitest';

import { memberSince } from './people';

describe('memberSince', () => {
  it('says the month and year, never the day', () => {
    expect(memberSince('2026-09-14T15:00:00Z')).toBe('En Movo desde septiembre de 2026');
  });
});
