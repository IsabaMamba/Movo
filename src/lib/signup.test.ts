import { describe, expect, it } from 'vitest';

import {
  birthStep,
  firstStep,
  radiusLine,
  stepLabel,
  toStatus,
  zoneLabel,
  type SignupStatus,
} from './signup';

const done: SignupStatus = {
  displayName: 'Andrea',
  hasBirthdate: true,
  gender: 'mujer',
  sports: 4,
  district: { code: '11301', name: 'San Juan', canton: 'Tibás' },
  radiusKm: 25,
  completed: true,
};

describe('toStatus', () => {
  it('does not offer the database fallback as a name', () => {
    expect(toStatus({ display_name: 'Nuevo usuario' }).displayName).toBe('');
  });

  it('reads an account Apple just created as nothing done', () => {
    const s = toStatus({ display_name: 'Nuevo usuario', has_birthdate: false, sports: 0 });
    expect(firstStep(s, false)).toBe('about');
    expect(s.radiusKm).toBe(15);
    expect(s.district).toBeNull();
  });

  it('ignores a gender it does not know', () => {
    expect(toStatus({ gender: 'otro' }).gender).toBeNull();
  });
});

describe('firstStep', () => {
  it('resumes where the person left', () => {
    expect(firstStep({ ...done, gender: null }, false)).toBe('gender');
    expect(firstStep({ ...done, sports: 0 }, false)).toBe('sports');
    expect(firstStep({ ...done, district: null }, false)).toBe('zone');
    expect(firstStep({ ...done, completed: false }, false)).toBe('rules');
    expect(firstStep({ ...done, completed: false }, true)).toBe('rules');
    expect(firstStep(done, true)).toBe('push');
  });
});

describe('stepLabel', () => {
  it('numbers the four steps only', () => {
    expect(stepLabel('about')).toBe('Paso 1 de 4');
    expect(stepLabel('zone')).toBe('Paso 4 de 4');
    expect(stepLabel('rules')).toBeNull();
  });
});

describe('zoneLabel', () => {
  it('reads «San Juan, Tibás»', () => {
    expect(zoneLabel({ code: '11301', name: 'San Juan', canton: 'Tibás' })).toBe('San Juan, Tibás');
    expect(zoneLabel({ code: '10101', name: 'Carmen', canton: null })).toBe('Carmen');
  });
});

describe('radiusLine', () => {
  it('says the distance', () => {
    expect(radiusLine(25)).toContain('A 25 km');
  });
});

describe('birthStep', () => {
  it('lets an adult through', () => {
    expect(birthStep('14', '3', '1997', '2026-11-10')).toEqual({ kind: 'ok', iso: '1997-03-14' });
  });

  it('marks a real date under 18, so the account is deleted', () => {
    expect(birthStep('2', '7', '2010', '2026-11-10')).toEqual({
      kind: 'under_age',
      iso: '2010-07-02',
    });
  });

  it('turns 18 today: through', () => {
    expect(birthStep('10', '11', '2008', '2026-11-10').kind).toBe('ok');
  });

  it('keeps the other problems as problems', () => {
    expect(birthStep('31', '2', '1990', '2026-11-10').kind).toBe('problem');
    expect(birthStep('1', '1', '2030', '2026-11-10').kind).toBe('problem');
  });
});
