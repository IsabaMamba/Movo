import { describe, expect, it } from 'vitest';

import {
  summarizeAttendance,
  timesLabel,
  weekLabel,
  whenLabel,
  type AttendanceRow,
} from './attendanceHistory';

/**
 * The history screen is the only place a person sees what Movo stores about
 * where they go. It has to say exactly that and no more: the week, never a
 * day; the band, never an hour.
 */

function row(over: Partial<AttendanceRow>): AttendanceRow {
  return {
    weekOf: '2026-09-14',
    isWeekend: false,
    band: 'evening',
    district: 'Mata Redonda',
    category: 'Running',
    ...over,
  };
}

describe('whenLabel', () => {
  it('names the band in Spanish, with the kind of day', () => {
    expect(whenLabel(false, 'evening')).toBe('entre semana, noche');
    expect(whenLabel(true, 'early')).toBe('fin de semana, madrugada');
    expect(whenLabel(false, 'morning')).toBe('entre semana, mañana');
    expect(whenLabel(true, 'afternoon')).toBe('fin de semana, tarde');
  });
});

describe('weekLabel', () => {
  it('reads the date as a date, so no time zone moves it a day back', () => {
    // As an instant, 2026-09-14T00:00Z is the 13th in Costa Rica.
    expect(weekLabel('2026-09-14')).toBe('semana del 14 de septiembre');
  });
});

describe('summarizeAttendance', () => {
  it('folds repeats into one line and counts them', () => {
    const lines = summarizeAttendance([
      row({ weekOf: '2026-09-07' }),
      row({ weekOf: '2026-09-14' }),
      row({ category: 'Fútbol', district: 'Tibás', band: 'afternoon', isWeekend: true }),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      text: 'Running · Mata Redonda · entre semana, noche',
      times: 2,
      lastWeekOf: '2026-09-14',
    });
    expect(lines[1]).toMatchObject({ text: 'Fútbol · Tibás · fin de semana, tarde', times: 1 });
  });

  it('keeps weekday and weekend apart even in the same band', () => {
    const lines = summarizeAttendance([row({ isWeekend: false }), row({ isWeekend: true })]);
    expect(lines).toHaveLength(2);
  });

  it('puts the most recent first when counts tie', () => {
    const lines = summarizeAttendance([
      row({ district: 'Escazú', weekOf: '2026-08-31' }),
      row({ district: 'Tibás', weekOf: '2026-09-14' }),
    ]);
    expect(lines.map((l) => l.lastWeekOf)).toEqual(['2026-09-14', '2026-08-31']);
  });

  it('is empty for no rows', () => {
    expect(summarizeAttendance([])).toEqual([]);
  });
});

describe('timesLabel', () => {
  it('is singular for one', () => {
    expect(timesLabel(1)).toBe('1 vez');
    expect(timesLabel(4)).toBe('4 veces');
  });
});
