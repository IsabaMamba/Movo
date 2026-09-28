import { describe, expect, it } from 'vitest';

import { districtMismatch, explainVerifyError, pointOf } from './venues';

/**
 * Correcting a venue starts with reading back where it is. A misread point —
 * the pair swapped, the SRID taken for a coordinate — would show the organizer
 * a place their venue is not, and they would "correct" it to somewhere worse.
 */
describe('pointOf', () => {
  it('reads the hex EWKB the live API returns', () => {
    // Returned by /rest/v1/locations?select=geog on 28 September: La Sabana.
    const point = pointOf('0101000020E6100000B4C876BE9F0655C01F85EB51B8DE2340');
    expect(point?.lat).toBeCloseTo(9.935, 3);
    expect(point?.lng).toBeCloseTo(-84.1035, 3);
  });

  it('reads plain WKB with no SRID', () => {
    // Same point, type word 1 with no SRID flag.
    const point = pointOf('0101000000B4C876BE9F0655C01F85EB51B8DE2340');
    expect(point?.lat).toBeCloseTo(9.935, 3);
  });

  it('reads GeoJSON, longitude first', () => {
    expect(pointOf({ type: 'Point', coordinates: [-84.1035, 9.935] })).toEqual({
      lat: 9.935,
      lng: -84.1035,
    });
  });

  it('refuses what is not a point', () => {
    expect(pointOf('not hex')).toBeNull();
    expect(pointOf('0102000020E6100000')).toBeNull();
    expect(pointOf(null)).toBeNull();
    expect(pointOf({ coordinates: ['a', 'b'] })).toBeNull();
  });
});

describe('districtMismatch', () => {
  it('flags a typed district the point is not in', () => {
    // Canchas de Fonseca: typed Moravia, the map says San Juan.
    expect(districtMismatch('Moravia', 'San Juan')).toBe(true);
  });

  it('ignores case, accents and spaces', () => {
    expect(districtMismatch(' san jose ', 'San José')).toBe(false);
  });

  it('is not a mismatch when there is nothing to compare', () => {
    expect(districtMismatch(null, 'San Juan')).toBe(false);
    expect(districtMismatch('  ', 'San Juan')).toBe(false);
    expect(districtMismatch('Moravia', null)).toBe(false);
  });
});

describe('explainVerifyError', () => {
  it('turns each refusal into the rule', () => {
    expect(
      explainVerifyError(new Error('the point is in no district; fix it before verifying')),
    ).toMatch(/no cae en ningún distrito/);
    expect(explainVerifyError(new Error('a private place cannot be verified'))).toBe(
      'Un lugar privado no se puede verificar.',
    );
    expect(explainVerifyError(new Error('only the Movo team can verify a venue'))).toBe(
      'Solo el equipo de Movo puede hacer esto.',
    );
    expect(explainVerifyError(new Error('say what was checked'))).toBe('Escribe qué revisaste.');
  });

  it('shows an unrecognised error as it came', () => {
    expect(explainVerifyError(new Error('algo nuevo'))).toBe('algo nuevo');
  });
});
