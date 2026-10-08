import { describe, expect, it } from 'vitest';

import { anniversary, isAdultOn, parseBirthdate, todayInCostaRica } from './age';

/**
 * The form and handle_new_user() must agree on every date: if the form says
 * yes and the database says no, the person sees «Database error saving new
 * user» at the end of a form that told them they were fine. These are the
 * dates where the two could drift.
 */
describe('todayInCostaRica', () => {
  it('is still yesterday in San José when UTC has rolled over', () => {
    // 02:00 UTC on 9 October is 20:00 on 8 October in Costa Rica (UTC−6).
    expect(todayInCostaRica(new Date('2026-10-09T02:00:00Z'))).toBe('2026-10-08');
  });
});

describe('anniversary', () => {
  it('keeps the day when it exists', () => {
    expect(anniversary('2008-10-08', 18)).toBe('2026-10-08');
  });

  it('lands 29 February on 28 February in a common year, as Postgres does', () => {
    expect(anniversary('2008-02-29', 18)).toBe('2026-02-28');
    expect(anniversary('2004-02-29', 20)).toBe('2024-02-29');
  });
});

describe('isAdultOn', () => {
  it('is true from the 18th birthday itself', () => {
    expect(isAdultOn('2008-10-08', '2026-10-08')).toBe(true);
  });

  it('is false the day before', () => {
    expect(isAdultOn('2008-10-08', '2026-10-07')).toBe(false);
  });
});

describe('parseBirthdate', () => {
  const today = '2026-10-08';

  it('accepts an adult, unpadded', () => {
    expect(parseBirthdate('5', '3', '1990', today)).toEqual({ ok: true, iso: '1990-03-05' });
  });

  it('accepts somebody turning 18 today', () => {
    expect(parseBirthdate('8', '10', '2008', today)).toEqual({ ok: true, iso: '2008-10-08' });
  });

  it('refuses somebody turning 18 tomorrow, and says why', () => {
    const result = parseBirthdate('9', '10', '2008', today);
    expect(result).toEqual({ ok: false, problem: 'Movo es solo para personas de 18 años o más.' });
  });

  it('asks for the date when a part is missing', () => {
    expect(parseBirthdate('', '3', '1990', today).ok).toBe(false);
  });

  it('refuses a date that does not exist', () => {
    for (const [d, m, y] of [
      ['31', '4', '1990'],
      ['29', '2', '1990'],
      ['1', '13', '1990'],
      ['0', '1', '1990'],
    ] as const) {
      expect(parseBirthdate(d, m, y, today)).toEqual({
        ok: false,
        problem: 'Esa fecha no existe. Revisa el día y el mes.',
      });
    }
  });

  it('accepts 29 February in a leap year', () => {
    expect(parseBirthdate('29', '2', '1992', today)).toEqual({ ok: true, iso: '1992-02-29' });
  });

  it('refuses a two-digit year, letters, the future and before 1900', () => {
    expect(parseBirthdate('5', '3', '90', today).ok).toBe(false);
    expect(parseBirthdate('5', 'mar', '1990', today).ok).toBe(false);
    expect(parseBirthdate('5', '3', '2030', today).ok).toBe(false);
    expect(parseBirthdate('5', '3', '1899', today).ok).toBe(false);
  });
});
