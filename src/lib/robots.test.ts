import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { INDEXABLE_PATHS, isIndexable } from './robots';

/**
 * Every route, by walking `src/app` the way Expo Router does: `index` is the
 * folder itself, `[id]` is any value, `+` and `_` files are not routes.
 * A sample pathname per route, with a made-up id in each dynamic segment.
 */
function routes(dir = 'src/app'): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return routes(full);
    if (!entry.name.endsWith('.tsx') || /^[+_]/u.test(entry.name)) return [];
    const parts = relative('src/app', full)
      .slice(0, -'.tsx'.length)
      .split(sep)
      .filter((part) => part !== 'index')
      .map((part) => (part.startsWith('[') ? 'x1' : part));
    return ['/' + parts.join('/')];
  });
}

describe('isIndexable', () => {
  it('lists only the allowlist, out of every route in src/app', () => {
    const all = routes();
    expect(all.length).toBeGreaterThan(15);
    const listed = all.filter(isIndexable).sort();
    expect(listed).toEqual([...INDEXABLE_PATHS].sort());
  });

  it('names no page that does not exist', () => {
    const all = routes();
    for (const path of INDEXABLE_PATHS) expect(all).toContain(path);
  });

  it('keeps people and sessions out of an index', () => {
    for (const path of ['/sesion/abc', '/grupos/mejengueros', '/cuenta', '/staff/reportes']) {
      expect(isIndexable(path)).toBe(false);
    }
  });

  it('ignores a trailing slash and a query string', () => {
    expect(isIndexable('/normas/')).toBe(true);
    expect(isIndexable('/?ref=x')).toBe(true);
    expect(isIndexable('/cuenta/?x=1')).toBe(false);
  });
});

describe('the root layout', () => {
  it('is where the robots tag is decided', () => {
    // A test of the wiring, not of React: if the layout stops calling
    // isIndexable, every route above is untested in practice.
    const layout = readFileSync('src/app/_layout.tsx', 'utf8');
    expect(layout).toContain('isIndexable(');
    expect(layout).toContain('name="robots"');
  });
});
