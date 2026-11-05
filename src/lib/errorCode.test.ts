import { describe, expect, it } from 'vitest';

import { errorCode } from './errorCode';

describe('errorCode', () => {
  it('is four and two characters with no look-alikes', () => {
    const code = errorCode(1_793_000_000_000, () => 0.5);
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{2}$/u);
    expect(code).not.toMatch(/[01IO]/u);
  });

  it('changes with the time', () => {
    expect(errorCode(1_793_000_000_000, () => 0)).not.toBe(errorCode(1_793_000_100_000, () => 0));
  });
});
