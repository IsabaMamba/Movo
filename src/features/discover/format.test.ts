import { describe, expect, it } from 'vitest';

import { dateColumn, emptyHint, formatDistance, nearbyCount, seriesShort } from './format';

/** The card's date column is read before anything else on it; it must be right. */
describe('dateColumn', () => {
  it('splits a session into weekday, time and date, in Costa Rica', () => {
    // 12:00 UTC is 06:00 in Costa Rica, Tuesday 13 October 2026.
    expect(dateColumn('2026-10-13T12:00:00Z')).toEqual({
      weekday: 'MAR',
      time: '06:00',
      day: '13 oct',
    });
  });

  it('keeps the evening on its own day, not on UTC’s', () => {
    // 01:00 UTC on the 15th is 19:00 on Wednesday the 14th in Costa Rica.
    expect(dateColumn('2026-10-15T01:00:00Z')).toEqual({
      weekday: 'MIÉ',
      time: '19:00',
      day: '14 oct',
    });
  });
});

describe('seriesShort', () => {
  it('says the weekday and how many dates are left', () => {
    expect(seriesShort('2026-10-13T12:00:00Z', 9)).toBe('Cada martes · 9 fechas');
    expect(seriesShort('2026-10-13T12:00:00Z', 1)).toBe('Cada martes · 1 fecha');
  });
});

describe('nearbyCount', () => {
  it('says how many and within what radius', () => {
    expect(nearbyCount(9, 15)).toEqual({ count: '9 sesiones', rest: ' a menos de 15 km' });
    expect(nearbyCount(1, 5).count).toBe('1 sesión');
  });
});

describe('formatDistance', () => {
  it('rounds the way people say it', () => {
    expect(formatDistance(420)).toBe('400 m');
    expect(formatDistance(6800)).toBe('6.8 km');
    expect(formatDistance(23_400)).toBe('23 km');
  });
});

describe('emptyHint', () => {
  it('offers only what can still be tried', () => {
    expect(emptyHint(15, 50, true)).toMatch(/ampliar el radio o quitar el filtro/);
    expect(emptyHint(15, 50, false)).toMatch(/^Prueba ampliar el radio\./);
    expect(emptyHint(50, 50, true)).toMatch(/^Prueba quitar el filtro de deporte\./);
  });

  it('does not suggest a wider radius at the widest one', () => {
    expect(emptyHint(50, 50, true)).not.toMatch(/ampliar/);
    expect(emptyHint(50, 50, false)).toBe(
      'Estamos sumando sesiones de grupos que ya entrenan en la GAM.',
    );
  });
});
