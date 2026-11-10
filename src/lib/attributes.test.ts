import { describe, expect, it } from 'vitest';

import type { JsonSchemaProperty } from '../types/database';

import { attributeFact, attributeTags } from './attributes';

describe('attributeFact', () => {
  it('moves the unit next to the number', () => {
    expect(attributeFact('Distancia (km)', 10)).toBe('Distancia: 10 km');
    expect(attributeFact('Ritmo objetivo (min/km)', 5)).toBe('Ritmo objetivo: 5 min/km');
  });

  it('leaves a title without a unit alone', () => {
    expect(attributeFact('Jugadores por equipo', 5)).toBe('Jugadores por equipo: 5');
  });

  it('does not treat brackets as a unit when the value is words', () => {
    expect(attributeFact('Superficie (cancha)', 'Sintética')).toBe(
      'Superficie (cancha): Sintética',
    );
  });
});

describe('attributeTags', () => {
  const properties: Record<string, JsonSchemaProperty> = {
    route: { type: 'string', title: 'Tipo de ruta', enum: ['road'], enumNames: ['Calle'] },
    km: { type: 'number', title: 'Distancia (km)' },
    no_drop: { type: 'boolean', title: 'Nadie se queda atrás' },
    gear: {
      type: 'array',
      title: 'Qué llevar',
      items: { type: 'string', enum: ['water'], enumNames: ['Agua'] },
    },
  };

  it('reads like the detail: names, units, and only what is true', () => {
    expect(
      attributeTags(properties, { route: 'road', km: 10, no_drop: true, gear: ['water'] }),
    ).toEqual([
      'Tipo de ruta: Calle',
      'Distancia: 10 km',
      'Nadie se queda atrás',
      'Qué llevar: Agua',
    ]);
  });

  it('says nothing for false, empty and missing', () => {
    expect(attributeTags(properties, { no_drop: false, gear: [], km: null })).toEqual([]);
  });

  it('falls back to the key when the category does not know the attribute', () => {
    expect(attributeTags(properties, { extra: 3 })).toEqual(['extra: 3']);
  });
});
