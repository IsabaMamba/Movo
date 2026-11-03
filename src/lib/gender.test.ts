import { describe, expect, it } from 'vitest';

import { GENDER_OPTIONS, genderLabel, isGender } from './gender';

/**
 * The three values must be exactly the ones 0035 accepts: anything else is
 * refused by set_my_gender() and silently dropped at sign-up.
 */
describe('gender options', () => {
  it('are the three values the database accepts, in the board order', () => {
    expect(GENDER_OPTIONS.map((o) => o.value)).toEqual(['mujer', 'hombre', 'no_dice']);
  });

  it('say that «Mujer» includes trans women', () => {
    expect(GENDER_OPTIONS[0]?.hint).toContain('trans');
  });
});

describe('isGender', () => {
  it('accepts only the three values', () => {
    expect(isGender('mujer')).toBe(true);
    expect(isGender('no_dice')).toBe(true);
    expect(isGender('otro')).toBe(false);
    expect(isGender(null)).toBe(false);
  });
});

describe('genderLabel', () => {
  it('names a stored value and nothing else', () => {
    expect(genderLabel('no_dice')).toBe('Prefiero no decir');
    expect(genderLabel(null)).toBeNull();
  });
});
