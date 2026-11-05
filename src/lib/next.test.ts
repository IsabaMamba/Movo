import { describe, expect, it } from 'vitest';

import { safeNext } from './next';

describe('safeNext', () => {
  it('keeps a path inside Movo', () => {
    expect(safeNext('/g/K7Q2M9XP')).toBe('/g/K7Q2M9XP');
    expect(safeNext(['/ayuda/edad'])).toBe('/ayuda/edad');
  });

  it('refuses anything that could leave the site or loop', () => {
    for (const bad of [
      'https://evil.example',
      '//evil.example',
      '/\\evil',
      'g/x',
      '/a b',
      '/sign-in',
      'javascript:alert(1)',
    ]) {
      expect(safeNext(bad)).toBeNull();
    }
    expect(safeNext(undefined)).toBeNull();
  });
});
