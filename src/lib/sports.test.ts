import { describe, expect, it } from 'vitest';

import { byFamily, searchSports } from './sports';

const CATS = [
  { id: 'running', name_es: 'Running', name_en: 'Running', family: 'correr' as const },
  { id: 'baseball', name_es: 'Béisbol', name_en: 'Baseball', family: 'balon' as const },
  {
    id: 'mountain_biking',
    name_es: 'Ciclismo de montaña',
    name_en: 'Mountain biking',
    family: 'ruedas' as const,
  },
  { id: 'surf', name_es: 'Surf', name_en: 'Surfing', family: 'agua' as const },
];

describe('searchSports', () => {
  it('ignores accents and case, and knows the English name', () => {
    expect(searchSports(CATS, 'beis').map((c) => c.id)).toEqual(['baseball']);
    expect(searchSports(CATS, 'MONTANA').map((c) => c.id)).toEqual(['mountain_biking']);
    expect(searchSports(CATS, 'mountain').map((c) => c.id)).toEqual(['mountain_biking']);
    expect(searchSports(CATS, '  ')).toHaveLength(4);
  });
});

describe('byFamily', () => {
  it('groups in the boards’ order and drops empty families', () => {
    expect(byFamily(CATS).map((g) => g.family)).toEqual(['correr', 'balon', 'ruedas', 'agua']);
  });
});
