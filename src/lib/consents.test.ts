import { describe, expect, it } from 'vitest';

import { inForce, type ConsentRow } from './consents';

/**
 * The log keeps every grant and withdrawal; what a screen shows is what is in
 * force. Getting this wrong shows somebody a permission as on after they
 * switched it off — the one mistake a consent screen cannot make.
 */
function row(over: Partial<ConsentRow>): ConsentRow {
  return {
    purpose: 'location',
    version: '2026-10-08',
    granted: true,
    recorded_at: '2026-10-08T12:00:00.000Z',
    ...over,
  };
}

describe('inForce', () => {
  it('is empty with no rows', () => {
    expect(inForce([])).toEqual({});
  });

  it('takes the latest row per purpose, whatever order they arrive in', () => {
    const newer = row({ version: '2026-11-01', recorded_at: '2026-11-01T00:00:00.000Z' });
    const result = inForce([newer, row({})]);
    expect(result.location?.version).toBe('2026-11-01');
  });

  it('drops a purpose whose latest row is a withdrawal', () => {
    const result = inForce([
      row({}),
      row({ granted: false, version: null, recorded_at: '2026-10-09T00:00:00.000Z' }),
    ]);
    expect(result.location).toBeUndefined();
  });

  it('keeps a grant made after a withdrawal', () => {
    const result = inForce([
      row({}),
      row({ granted: false, version: null, recorded_at: '2026-10-09T00:00:00.000Z' }),
      row({ recorded_at: '2026-10-10T00:00:00.000Z' }),
    ]);
    expect(result.location?.recorded_at).toBe('2026-10-10T00:00:00.000Z');
  });

  it('keeps purposes apart', () => {
    const result = inForce([
      row({ purpose: 'rules', version: '2026-09-28' }),
      row({ purpose: 'push', granted: false, version: null }),
    ]);
    expect(Object.keys(result)).toEqual(['rules']);
  });
});
