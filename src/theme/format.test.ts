import { describe, expect, it } from 'vitest';

import { difficultyBand, priceLabel, pricePerPerson } from './index';

/**
 * Money and difficulty are the two numbers on a card that a person acts on
 * before they read anything else: can I afford it, and will it hurt. Both are
 * stored in a form nobody would ever say out loud — céntimos, and a 1–5 integer
 * — so every one of these functions is a translation, and a translation that
 * drifts by a factor of a hundred is not noticed until somebody arrives with
 * the wrong money.
 */

/**
 * Intl separates a currency symbol from its digits with characters that are not
 * a plain space — U+00A0 and U+202F both appear, and which one you get depends
 * on the ICU build Node was compiled against. Asserting a whole formatted string
 * makes a test that passes on one machine and fails on another, so these helpers
 * pull out the parts that actually carry meaning.
 */
const digitsOf = (s: string): string => s.replace(/\D/g, '');
/** True when the string ends in a separator plus exactly two digits: "15.00". */
const hasCents = (s: string): boolean => /[.,]\d{2}$/.test(s);

describe('priceLabel', () => {
  /**
   * Free is the common case — most sessions in the seed data cost nothing — and
   * "₡0" reads as a price somebody forgot to fill in rather than as an
   * invitation.
   */
  describe('free', () => {
    it('says the word instead of showing a zero', () => {
      expect(priceLabel(0)).toBe('Gratis');
      expect(priceLabel(0, 'USD')).toBe('Gratis');
    });

    it('treats a negative amount as free rather than as a refund', () => {
      // There is no path that writes a negative price, and if one appears the
      // card must not offer to pay the participant.
      expect(priceLabel(-500)).toBe('Gratis');
    });
  });

  describe('the amount is in minor units', () => {
    it('renders ₡2.500 from 250000 céntimos, not ₡250.000', () => {
      const label = priceLabel(250000, 'CRC');
      expect(digitsOf(label)).toBe('2500');
    });

    it('renders $15.00 from 1500 cents', () => {
      const label = priceLabel(1500, 'USD');
      expect(digitsOf(label)).toBe('1500');
      expect(hasCents(label)).toBe(true);
    });

    it('does not round a small colón amount away to nothing', () => {
      // A ₡1 session is absurd, but a formatter that floors would turn every
      // sub-unit amount into "₡0", which reads as free and is a lie.
      expect(priceLabel(100, 'CRC')).not.toBe('Gratis');
      expect(digitsOf(priceLabel(100, 'CRC'))).toBe('1');
    });
  });

  /**
   * `currencyDisplay: 'narrowSymbol'` is the only reason this reads as money. On
   * es-419 the default gives "CRC 2,500", which is an accounting export, not a
   * price a person recognises at a glance.
   */
  describe('the symbol, not the ISO code', () => {
    it('shows ₡ for colones', () => {
      expect(priceLabel(250000, 'CRC')).toContain('₡');
      expect(priceLabel(250000, 'CRC')).not.toContain('CRC');
    });

    it('shows $ for dollars', () => {
      expect(priceLabel(1500, 'USD')).toContain('$');
      expect(priceLabel(1500, 'USD')).not.toContain('USD');
    });

    it('defaults to colones when no currency is given', () => {
      expect(priceLabel(250000)).toBe(priceLabel(250000, 'CRC'));
    });
  });

  /**
   * Prices carry an ISO code so a session in Panamá or Asunción is representable
   * without a migration. The currencies that never quote a fractional unit must
   * not sprout one — "₲1.234,00" is the mark of software that was not written
   * for the person reading it.
   */
  describe('currencies that do not quote cents', () => {
    it.each(['CRC', 'PYG', 'CLP', 'COP'])('renders %s with no decimal part', (currency) => {
      expect(hasCents(priceLabel(250000, currency))).toBe(false);
    });

    it('renders every other currency with two decimals', () => {
      expect(hasCents(priceLabel(999, 'USD'))).toBe(true);
      expect(digitsOf(priceLabel(999, 'USD'))).toBe('999');
    });
  });
});

describe('pricePerPerson', () => {
  it('splits a court fee between the people who showed up', () => {
    // ₡12.000 between four is ₡3.000 each — the number somebody types into SINPE.
    expect(digitsOf(pricePerPerson(1200000, 4, 'CRC'))).toBe('3000');
  });

  it('rounds an uneven share up, so the organiser is not left covering it', () => {
    // $10.00 between three is $3.3333. Rounding down leaves the organiser a cent
    // short every time; rounding up means the pot always covers the court.
    expect(digitsOf(pricePerPerson(1000, 3, 'USD'))).toBe('334');
  });

  it('cannot round up below the smallest unit a currency displays', () => {
    // ₡10.000 between three rounds up to 333.334 céntimos — but CRC is rendered
    // with no decimals, so the céntimo the ceil added is dropped again and the
    // three shares sum to ₡9.999. The guarantee above holds in cents and does
    // not survive a zero-decimal currency. Asserted as it behaves, not as it
    // ought to, so a change here is visible rather than silent.
    expect(digitsOf(pricePerPerson(1000000, 3, 'CRC'))).toBe('3333');
  });

  it('stays free when the session is free', () => {
    expect(pricePerPerson(0, 4)).toBe('Gratis');
    expect(pricePerPerson(0, 0)).toBe('Gratis');
  });

  /**
   * Nobody has joined yet is the state a card spends most of its life in, and
   * it is the state that divides by zero. "₡Infinity" or "₡NaN" on a card is the
   * kind of thing screenshotted and posted.
   */
  describe('nobody to split it with', () => {
    it.each([0, -1])('falls back to the whole price for a party of %i', (people) => {
      const label = pricePerPerson(250000, people, 'CRC');
      expect(label).toBe(priceLabel(250000, 'CRC'));
      expect(label).not.toMatch(/Infinity|NaN|∞/);
    });
  });

  it('charges one person the whole thing', () => {
    expect(pricePerPerson(250000, 1, 'CRC')).toBe(priceLabel(250000, 'CRC'));
  });
});

describe('difficultyBand', () => {
  /**
   * Stored 1–5, shown as three words. The mapping is not evenly spaced and that
   * is the point: two organisers rating the same trail will not agree on 2 vs 3
   * out of 5, but they will both call it "suave". These words describe the
   * ROUTE, never the person — `skill` is the other axis.
   */
  it('calls 1 and 2 suave', () => {
    expect(difficultyBand(1)).toBe('suave');
    expect(difficultyBand(2)).toBe('suave');
  });

  it('calls 3 moderada, and only 3', () => {
    expect(difficultyBand(3)).toBe('moderada');
  });

  it('calls 4 and 5 exigente', () => {
    expect(difficultyBand(4)).toBe('exigente');
    expect(difficultyBand(5)).toBe('exigente');
  });

  /**
   * `activities.difficulty` is nullable and most rows leave it unset. A null
   * must stay null so the card can omit the chip — banding it to "suave" would
   * advertise an unrated hike as easy, which is the one direction this error
   * must not fall.
   */
  it('returns null for an unrated session rather than guessing', () => {
    expect(difficultyBand(null)).toBeNull();
  });

  it('bands a value outside 1–5 instead of returning undefined', () => {
    // The column is constrained, but the same function formats values coming
    // back from an imported session, and a missing return would render "undefined".
    expect(difficultyBand(0)).toBe('suave');
    expect(difficultyBand(-1)).toBe('suave');
    expect(difficultyBand(9)).toBe('exigente');
  });
});
