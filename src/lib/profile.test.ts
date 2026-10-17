import { describe, expect, it } from 'vitest';

import { bioProblem, districtOptions, initials, searchDistricts, sinceLabel } from './profile';

const ROWS = [
  { code: '113', kind: 'canton', name: 'Tibás', parent_code: '1' },
  { code: '101', kind: 'canton', name: 'San José', parent_code: '1' },
  { code: '11301', kind: 'distrito', name: 'San Juan', parent_code: '113' },
  { code: '10108', kind: 'distrito', name: 'Mata Redonda', parent_code: '101' },
  { code: '10101', kind: 'distrito', name: 'Carmen', parent_code: '101' },
];

describe('districtOptions', () => {
  it('labels each distrito with its cantón and leaves cantones out', () => {
    expect(districtOptions(ROWS).map((o) => o.label)).toEqual([
      'Carmen · San José',
      'Mata Redonda · San José',
      'San Juan · Tibás',
    ]);
  });
});

/**
 * People type the name the way they say it — no accents, half a word. The
 * zone is chosen from the list, never typed, so search has to be forgiving.
 */
describe('searchDistricts', () => {
  const options = districtOptions(ROWS);

  it('ignores accents and matches the cantón as well as the distrito', () => {
    expect(searchDistricts(options, 'tibas').map((o) => o.code)).toEqual(['11301']);
    expect(searchDistricts(options, 'mata').map((o) => o.code)).toEqual(['10108']);
  });

  it('matches word starts, not the middle of a word', () => {
    expect(searchDistricts(options, 'onda')).toEqual([]);
    expect(searchDistricts(options, 'redo').map((o) => o.code)).toEqual(['10108']);
  });

  it('waits for two letters', () => {
    expect(searchDistricts(options, 's')).toEqual([]);
  });
});

describe('sinceLabel', () => {
  it('says the month and year in Costa Rica', () => {
    // 02:00 UTC on 1 October is still 30 September in Costa Rica.
    expect(sinceLabel('2026-10-01T02:00:00Z')).toBe('En Movo desde septiembre 2026');
  });
});

describe('initials', () => {
  it('takes the first and last word', () => {
    expect(initials('Andrea Molina')).toBe('AM');
    expect(initials('Ana María de la Cruz')).toBe('AC');
    expect(initials('aguita')).toBe('A');
    expect(initials('   ')).toBe('·');
  });
});

describe('bioProblem', () => {
  it('allows up to 160 characters', () => {
    expect(bioProblem('a'.repeat(160))).toBeNull();
    expect(bioProblem('a'.repeat(161))).toBe('Hasta 160 caracteres.');
  });
});
