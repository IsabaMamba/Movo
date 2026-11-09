import { describe, expect, it } from 'vitest';

import { pricingLine, splitShare, toMinor, withPricingDefaults } from './pricing';

const base = withPricingDefaults({ price_minor: 0, currency: 'CRC' });

describe('pricingLine', () => {
  it('says free', () => {
    expect(pricingLine(base)).toBe('Gratis');
  });

  it('says per person', () => {
    expect(pricingLine({ ...base, price_minor: 200000 })).toBe('₡2,000 por persona');
  });

  it('says the split the way the handoff draws it', () => {
    expect(
      pricingLine({
        ...base,
        price_minor: 120000,
        price_unit: 'split',
        split_total_minor: 1200000,
        split_divisor: 10,
      }),
    ).toBe('₡1,200 por persona · ₡12,000 entre 10');
  });

  it('adds the entry fee, or says it is not confirmed', () => {
    expect(pricingLine({ ...base, venue_fee: 'amount', venue_fee_minor: 50000 })).toBe(
      'Gratis · entrada al lugar ₡500',
    );
    expect(pricingLine({ ...base, venue_fee: 'unknown' })).toBe(
      'Gratis · entrada al lugar sin confirmar',
    );
  });

  it('says per date in a series', () => {
    expect(pricingLine({ ...base, price_minor: 120000 }, { perDate: true })).toBe(
      '₡1,200 por persona, cada fecha',
    );
  });
});

describe('splitShare', () => {
  it('rounds up to a whole unit, like the database', () => {
    expect(splitShare(1200000, 10)).toBe(120000);
    expect(splitShare(1000000, 3)).toBe(333400);
    expect(splitShare(0, 3)).toBe(0);
  });
});

describe('toMinor', () => {
  it('reads whole units, with or without separators', () => {
    expect(toMinor('12000')).toBe(1200000);
    expect(toMinor('12,000')).toBe(1200000);
    expect(toMinor('')).toBe(0);
    expect(toMinor('abc')).toBe(0);
    expect(toMinor('-5')).toBe(0);
  });
});
