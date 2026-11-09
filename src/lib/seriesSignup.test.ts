import { describe, expect, it, vi } from 'vitest';

import {
  BOTH,
  fetchSeriesSignup,
  seriesBoxLine,
  setSeriesSignup,
  signupFromKey,
  signupKey,
  SIGNUP_OPTIONS,
} from './seriesSignup';

function fakeDb(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { db: { rpc } as never, rpc };
}

describe('the three choices', () => {
  it('round-trips each key', () => {
    for (const option of SIGNUP_OPTIONS) {
      expect(signupKey(signupFromKey(option.key))).toBe(option.key);
    }
  });

  it('never turns both off', () => {
    for (const option of SIGNUP_OPTIONS) {
      const rule = signupFromKey(option.key);
      expect(rule.allowWhole || rule.allowSingle).toBe(true);
    }
  });
});

describe('fetchSeriesSignup', () => {
  it('reads the flags', async () => {
    const { db, rpc } = fakeDb({ data: { allow_whole: true, allow_single: false }, error: null });
    expect(await fetchSeriesSignup(db, 's1')).toEqual({ allowWhole: true, allowSingle: false });
    expect(rpc).toHaveBeenCalledWith('series_signup', { p_series_id: 's1' });
  });

  it('falls back to both when the series is unknown', async () => {
    const { db } = fakeDb({ data: null, error: null });
    expect(await fetchSeriesSignup(db, 's1')).toEqual(BOTH);
  });
});

describe('setSeriesSignup', () => {
  it('sends both flags', async () => {
    const { db, rpc } = fakeDb({ data: null, error: null });
    await setSeriesSignup(db, 's1', { allowWhole: false, allowSingle: true });
    expect(rpc).toHaveBeenCalledWith('set_series_signup', {
      p_series_id: 's1',
      p_allow_whole: false,
      p_allow_single: true,
    });
  });
});

describe('seriesBoxLine', () => {
  it('says what joining one date does', () => {
    expect(seriesBoxLine({ allowWhole: true, allowSingle: false })).toContain('completa');
    expect(seriesBoxLine({ allowWhole: false, allowSingle: true })).toContain('propia lista');
    expect(seriesBoxLine(BOTH)).toBe('Puedes unirte solo a esta fecha o a toda la serie.');
  });
});
