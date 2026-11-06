import { describe, expect, it } from 'vitest';

import { sportBars, zoneHeadline, zoneTitle } from './zoneSummary';

describe('zone sheet words', () => {
  it('says the board headline, and «menos de 5» below five', () => {
    expect(zoneHeadline({ sessions: 25, people: 168 }, ' de tus deportes')).toBe(
      '25 sesiones de tus deportes · 168 personas van',
    );
    expect(zoneHeadline({ sessions: 1, people: null }, '')).toBe(
      '1 sesión · menos de 5 personas van',
    );
    expect(zoneHeadline({ sessions: 0, people: null }, ' de running')).toBe(
      'No hay sesiones de running esta semana',
    );
  });

  it('names a district with its surroundings, a cantón by itself', () => {
    expect(zoneTitle({ name: 'Tibás', kind: 'distrito' })).toBe('Tibás y alrededores');
    expect(zoneTitle({ name: 'Escazú', kind: 'canton' })).toBe('Escazú');
  });

  it('scales bars to the busiest sport', () => {
    const bars = sportBars([
      { category_id: 'running', sessions: 14 },
      { category_id: 'kayak', sessions: 0 },
      { category_id: 'yoga', sessions: 7 },
    ]);
    expect(bars.map((b) => b.share)).toEqual([1, 0.04, 0.5]);
  });
});
