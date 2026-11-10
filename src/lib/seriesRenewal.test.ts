import { describe, expect, it } from 'vitest';

import {
  chipDay,
  answeredNotice,
  explainRenewalError,
  localDate,
  questionCopy,
  renewalChips,
  renewalDates,
  renewalDay,
  stepDaysFor,
  toggleSkip,
  type RenewalQuestion,
} from './seriesRenewal';

describe('renewalDates', () => {
  it('gives 8 weekly dates after the last one', () => {
    const dates = renewalDates('2026-12-08');
    expect(dates).toHaveLength(8);
    expect(dates[0]).toBe('2026-12-15');
    expect(dates[7]).toBe('2027-02-02');
  });

  it('moves the run a week for each date left out', () => {
    const dates = renewalDates('2026-12-08', 8, ['2026-12-29']);
    expect(dates).not.toContain('2026-12-29');
    expect(dates).toHaveLength(8);
    expect(dates[7]).toBe('2027-02-09');
  });

  it('never goes past 12', () => {
    expect(renewalDates('2026-12-08', 40)).toHaveLength(12);
    expect(renewalDates('2026-12-08', 0)).toEqual([]);
  });
});

describe('chipDay', () => {
  it('reads like the board', () => {
    expect(chipDay('2026-12-15')).toBe('15 dic');
    expect(chipDay('2027-02-02')).toBe('2 feb');
  });
});

describe('renewalDates after the series ended', () => {
  it('starts from today, as renew_series() does', () => {
    const dates = renewalDates('2026-10-06', 2, [], 7, '2026-11-10');
    expect(dates).toEqual(['2026-11-17', '2026-11-24']);
  });
});

describe('stepDaysFor', () => {
  it('follows the frequency', () => {
    expect(stepDaysFor('weekly')).toBe(7);
    expect(stepDaysFor('biweekly')).toBe(14);
    expect(stepDaysFor('monthly')).toBe(28);
  });
});

describe('localDate', () => {
  it('is the Costa Rica calendar date', () => {
    // 05:30 UTC on the 9th is 23:30 on the 8th in Costa Rica.
    expect(localDate('2026-12-09T05:30:00Z')).toBe('2026-12-08');
    expect(localDate('2026-12-08T12:00:00Z')).toBe('2026-12-08');
  });
});

describe('renewalChips', () => {
  it('keeps a tapped date in place, off, and adds one at the end', () => {
    const chips = renewalChips('2026-12-08', 8, ['2026-12-29']);
    expect(chips).toHaveLength(9);
    expect(chips[2]).toEqual({ date: '2026-12-29', on: false });
    expect(chips.filter((c) => c.on)).toHaveLength(8);
    expect(chips[8]).toEqual({ date: '2027-02-09', on: true });
  });

  it('tapping again brings it back', () => {
    const skip = toggleSkip(toggleSkip([], '2026-12-29'), '2026-12-29');
    expect(skip).toEqual([]);
    expect(renewalChips('2026-12-08', 8, skip)).toHaveLength(8);
  });
});

describe('renewalDay', () => {
  it('reads «mar 15 dic»', () => {
    expect(renewalDay('2026-12-15')).toBe('mar 15 dic');
  });
});

describe('questionCopy', () => {
  const q: RenewalQuestion = {
    name: 'Andrea',
    added: 8,
    first: '2026-12-15',
    last: '2027-02-09',
    lastStart: '2026-12-08T12:00:00Z',
    skipped: ['2026-12-29'],
  };

  it('reads like Series v2 · 10', () => {
    const c = questionCopy(q, '5K al parque de Tibás');
    expect(c.title).toBe('Andrea agregó 8 fechas a 5K al parque de Tibás');
    expect(c.range).toBe('Del mar 15 dic al mar 9 feb. Sin el 29 dic.');
    expect(c.yes).toBe('Sí, sigo en las 8');
    expect(c.no).toBe('No, termino el 8 dic');
    expect(c.note).toContain('antes del 8 dic');
    expect(c.span).toBe('15 dic → 9 feb');
    expect(c.endDay).toBe('8 dic');
  });

  it('names two skipped dates with «ni»', () => {
    const c = questionCopy({ ...q, skipped: ['2026-12-22', '2026-12-29'] }, 'X');
    expect(c.range).toBe('Del mar 15 dic al mar 9 feb. Sin el 22 dic ni el 29 dic.');
  });

  it('says nothing about skipped dates when there are none', () => {
    expect(questionCopy({ ...q, skipped: [] }, 'X').range).toBe('Del mar 15 dic al mar 9 feb.');
  });
});

describe('explainRenewalError', () => {
  it('passes the server words through', () => {
    expect(explainRenewalError(new Error('Esta serie ya no está activa.'))).toBe(
      'Esta serie ya no está activa.',
    );
    expect(explainRenewalError(null)).toContain('No se pudieron agregar');
  });
});

describe('answeredNotice', () => {
  it('says where it ends on a no', () => {
    expect(answeredNotice(false, { joined: 0, waitlisted: 0 }, '8 dic')).toBe(
      'Listo. La serie termina para ti el 8 dic. Puedes volver cuando quieras.',
    );
  });

  it('counts places and waits on a yes', () => {
    expect(answeredNotice(true, { joined: 8, waitlisted: 0 }, '8 dic')).toBe(
      'Listo: vas a 8 fechas nuevas.',
    );
    expect(answeredNotice(true, { joined: 6, waitlisted: 2 }, '8 dic')).toBe(
      'Vas a 6 fechas nuevas y quedaste en espera en 2.',
    );
    expect(answeredNotice(true, { joined: 0, waitlisted: 1 }, '8 dic')).toBe(
      'Quedaste en lista de espera en 1 fecha nueva.',
    );
  });
});
