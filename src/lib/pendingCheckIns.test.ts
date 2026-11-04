import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));

import { ApiError } from './errors';
import { isDecision, parsePending, withPending } from './pendingCheckIns';

const NOW = new Date('2026-11-04T18:00:00Z');

describe('parsePending', () => {
  it('keeps well-formed recent taps', () => {
    const raw = JSON.stringify([
      { activityId: 'a1', code: '4821', tappedAt: '2026-11-04T17:40:00Z' },
    ]);
    expect(parsePending(raw, NOW)).toEqual([
      { activityId: 'a1', code: '4821', tappedAt: '2026-11-04T17:40:00Z' },
    ]);
  });

  it('drops malformed and week-old taps, and survives garbage', () => {
    const raw = JSON.stringify([
      { activityId: 'a1', code: '4821' },
      { activityId: 'a2', code: '4821', tappedAt: '2026-10-20T10:00:00Z' },
      { activityId: 'a3', code: 4821, tappedAt: '2026-11-04T17:40:00Z' },
      null,
    ]);
    expect(parsePending(raw, NOW)).toEqual([]);
    expect(parsePending('{not json', NOW)).toEqual([]);
    expect(parsePending(null, NOW)).toEqual([]);
  });
});

describe('withPending', () => {
  it('keeps one tap per session, the latest', () => {
    const first = { activityId: 'a1', code: '1111', tappedAt: 't1' };
    const other = { activityId: 'a2', code: '2222', tappedAt: 't2' };
    const again = { activityId: 'a1', code: '3333', tappedAt: 't3' };
    expect(withPending([first, other], again)).toEqual([other, again]);
  });
});

describe('isDecision', () => {
  it('treats the server saying no as final and anything else as retryable', () => {
    expect(isDecision(new ApiError('invalid_state', 'Ya cerró', '22023'))).toBe(true);
    expect(isDecision(new ApiError('forbidden', 'No vas', '42501'))).toBe(true);
    expect(isDecision(new ApiError('unknown', 'Failed to fetch'))).toBe(false);
    expect(isDecision(new TypeError('Network request failed'))).toBe(false);
  });
});
