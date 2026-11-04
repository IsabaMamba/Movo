import { describe, expect, it } from 'vitest';

import {
  dayHeading,
  directionsUrl,
  eyebrowDay,
  inviteText,
  localDay,
  startsIn,
  weekStrip,
  weekTitle,
} from './agenda';

// Monday 2 November 2026, 10:00 in Costa Rica (16:00 UTC).
const NOW = new Date('2026-11-02T16:00:00Z');

describe('localDay', () => {
  it('is the Costa Rica date, not UTC', () => {
    // 03:00 UTC on the 3rd is 21:00 on the 2nd in San José.
    expect(localDay('2026-11-03T03:00:00Z')).toBe('2026-11-02');
  });
});

describe('weekStrip', () => {
  it('runs Monday to Sunday and marks today and the busy days', () => {
    const week = weekStrip(NOW, ['2026-11-03', '2026-11-07']);
    expect(week.map((d) => d.letter).join('')).toBe('LMMJVSD');
    expect(week.map((d) => d.number)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(week.find((d) => d.isToday)?.ymd).toBe('2026-11-02');
    expect(week.filter((d) => d.hasSession).map((d) => d.number)).toEqual([3, 7]);
  });

  it('finds Monday from a Sunday', () => {
    const sunday = new Date('2026-11-08T16:00:00Z');
    expect(weekStrip(sunday, [])[0]?.ymd).toBe('2026-11-02');
  });
});

describe('weekTitle', () => {
  it('names the month', () => {
    expect(weekTitle(NOW)).toBe('Noviembre · esta semana');
  });
});

describe('dayHeading', () => {
  it('says the day and how near it is', () => {
    expect(dayHeading('2026-11-03T12:30:00Z', NOW)).toEqual({
      label: 'MAR 3 NOV',
      relative: 'mañana',
    });
    expect(dayHeading('2026-11-02T23:00:00Z', NOW).relative).toBe('hoy');
    expect(dayHeading('2026-11-07T12:30:00Z', NOW)).toEqual({ label: 'SÁB 7 NOV', relative: null });
  });
});

describe('startsIn', () => {
  it('counts down in minutes, then hours, then stops', () => {
    expect(startsIn('2026-11-02T16:20:00Z', NOW)).toBe('Empieza en 20 min');
    expect(startsIn('2026-11-02T19:00:00Z', NOW)).toBe('Empieza en 3 h');
    expect(startsIn('2026-11-02T15:30:00Z', NOW)).toBe('Ahora');
    expect(startsIn('2026-11-04T16:00:00Z', NOW)).toBeNull();
  });
});

describe('eyebrowDay', () => {
  it('says HOY, MAÑANA, or the date', () => {
    expect(eyebrowDay('2026-11-02T22:00:00Z', NOW)).toBe('HOY');
    expect(eyebrowDay('2026-11-03T12:00:00Z', NOW)).toBe('MAÑANA');
    expect(eyebrowDay('2026-11-07T12:00:00Z', NOW)).toBe('SÁB 7 NOV');
  });
});

describe('directionsUrl', () => {
  it('sends the destination only', () => {
    const url = directionsUrl(9.94, -84.1);
    expect(url).toBe('https://www.google.com/maps/dir/?api=1&destination=9.94,-84.1');
    expect(url).not.toContain('origin');
  });
});

describe('inviteText', () => {
  it('says what, when and asks, with no link', () => {
    expect(inviteText('Vuelta al Parque del Este', '2026-11-07T13:00:00Z', NOW)).toBe(
      'Me uní a Vuelta al Parque del Este, sáb 7 nov a las 07:00. ¿Te animas? Búscala en Movo.',
    );
  });
});
