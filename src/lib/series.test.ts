import { describe, expect, it } from 'vitest';

import {
  cadenceLabel,
  capacityFloor,
  explainSeriesError,
  groupUpcoming,
  peopleOnUpcoming,
  type SeriesDate,
} from './series';

/**
 * A series is how a club actually meets. Organizar showing nine Tuesdays of
 * one club as nine sessions hid that, and the edit form has to say the same
 * rules update_series() enforces, before the save rather than after.
 */

function date(over: Partial<SeriesDate>): SeriesDate {
  return {
    id: 'd',
    starts_at: '2026-09-29T00:00:00+00:00',
    status: 'published',
    joined_count: 0,
    waitlist_count: 0,
    max_participants: null,
    ...over,
  };
}

describe('cadenceLabel', () => {
  it('says the day and the 24-hour time without seconds', () => {
    expect(cadenceLabel(2, '18:00:00')).toBe('Todos los martes a las 18:00');
    expect(cadenceLabel(6, '05:30:00')).toBe('Todos los sábados a las 05:30');
    expect(cadenceLabel(0, '07:00:00')).toBe('Todos los domingos a las 07:00');
  });
});

describe('peopleOnUpcoming', () => {
  it('counts the joined and the waiting across every date', () => {
    expect(
      peopleOnUpcoming([date({ joined_count: 3, waitlist_count: 1 }), date({ joined_count: 2 })]),
    ).toBe(6);
  });

  it('is zero when nobody is on any date, which is when day and hour can move', () => {
    expect(peopleOnUpcoming([date({}), date({})])).toBe(0);
  });
});

describe('capacityFloor', () => {
  it('is the fullest upcoming date', () => {
    expect(capacityFloor([date({ joined_count: 4 }), date({ joined_count: 9 })])).toBe(9);
  });

  it('never goes below the table minimum of 2', () => {
    expect(capacityFloor([date({ joined_count: 1 })])).toBe(2);
    expect(capacityFloor([])).toBe(2);
  });
});

describe('explainSeriesError', () => {
  it('turns the lock into the rule, with the count', () => {
    const cause = new Error(
      'time and venue are locked: 3 people are on upcoming sessions of this series. Cancel and publish a new series, or edit the individual session',
    );
    expect(explainSeriesError(cause)).toBe(
      'Hay 3 personas apuntadas en las próximas fechas: el día, la hora, la duración y el lugar no se pueden cambiar.',
    );
  });

  it('is singular for one person', () => {
    const cause = new Error('time and venue are locked: 1 people are on upcoming sessions');
    expect(explainSeriesError(cause)).toMatch(/^Hay 1 persona apuntada en/);
  });

  it('names the capacity floor', () => {
    const cause = new Error('capacity cannot go below 7, the fullest upcoming session');
    expect(explainSeriesError(cause)).toBe(
      'El cupo no puede quedar por debajo de 7, la fecha más llena que viene.',
    );
  });

  it('shows an unrecognised error as it came', () => {
    expect(explainSeriesError(new Error('something new'))).toBe('something new');
  });
});

describe('groupUpcoming', () => {
  const a = (id: string, series: string | null, starts: string) => ({
    id,
    series_id: series,
    starts_at: starts,
  });

  it('folds a series into one entry at its next date', () => {
    const entries = groupUpcoming([
      a('t2', 'S', '2026-10-06T00:00:00+00:00'),
      a('solo', null, '2026-10-01T00:00:00+00:00'),
      a('t1', 'S', '2026-09-29T00:00:00+00:00'),
      a('t3', 'S', '2026-10-13T00:00:00+00:00'),
    ]);

    expect(entries.map((e) => (e.kind === 'single' ? e.activity.id : `S:${e.next.id}`))).toEqual([
      'S:t1',
      'solo',
    ]);
    const series = entries[0];
    expect(series?.kind === 'series' && series.dates.map((d) => d.id)).toEqual(['t1', 't2', 't3']);
  });

  it('keeps two series apart', () => {
    const entries = groupUpcoming([
      a('x1', 'X', '2026-09-29T00:00:00+00:00'),
      a('y1', 'Y', '2026-09-30T00:00:00+00:00'),
      a('x2', 'X', '2026-10-06T00:00:00+00:00'),
    ]);
    expect(entries).toHaveLength(2);
  });

  it('leaves standalone sessions one entry each', () => {
    const entries = groupUpcoming([
      a('s1', null, '2026-09-29T00:00:00+00:00'),
      a('s2', null, '2026-09-30T00:00:00+00:00'),
    ]);
    expect(entries.every((e) => e.kind === 'single')).toBe(true);
  });
});
