import { describe, expect, it } from 'vitest';

import { searchZones, zoneOptions } from './zones';

const ROWS = [
  { code: '1', kind: 'provincia' as const, name: 'San José', parent_code: null },
  { code: '113', kind: 'canton' as const, name: 'Tibás', parent_code: '1' },
  { code: '11301', kind: 'distrito' as const, name: 'San Juan', parent_code: '113' },
  { code: '6', kind: 'provincia' as const, name: 'Puntarenas', parent_code: null },
];

describe('zones', () => {
  it('labels every level with its parent', () => {
    const labels = zoneOptions(ROWS).map((o) => o.label);
    expect(labels).toContain('Cantón de Tibás · San José');
    expect(labels).toContain('Distrito de San Juan · Tibás');
    expect(labels[0]).toMatch(/^Provincia/u);
  });

  it('finds without accents, bigger areas first', () => {
    const found = searchZones(zoneOptions(ROWS), 'tibas');
    expect(found.map((o) => o.code)).toEqual(['113', '11301']);
    expect(searchZones(zoneOptions(ROWS), 'p')).toEqual([]);
  });
});
