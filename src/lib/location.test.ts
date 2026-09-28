import { describe, expect, it, vi } from 'vitest';

// expo-location is a native module; the pure half of location.ts is what is
// tested here, so the import only has to resolve.
vi.mock('expo-location', () => ({}));

import { coarsen, GAM_CENTRE, originFailureText } from './location';

/**
 * Device location is the one place a precise position could enter Movo. It
 * must leave the device already rounded, or the "no precise location" line in
 * docs/security.md stops being true the first time somebody taps «Cerca de mí».
 */
describe('coarsen', () => {
  it('rounds to two decimals, about a kilometre', () => {
    expect(coarsen({ lat: 9.934871, lng: -84.103529 })).toEqual({ lat: 9.93, lng: -84.1 });
  });

  it('rounds rather than truncates', () => {
    expect(coarsen({ lat: 9.936, lng: -84.096 })).toEqual({ lat: 9.94, lng: -84.1 });
  });

  it('never keeps more than two decimals', () => {
    const { lat, lng } = coarsen({ lat: 10.123456789, lng: -85.987654321 });
    for (const value of [lat, lng]) {
      const decimals = String(value).split('.')[1] ?? '';
      expect(decimals.length).toBeLessThanOrEqual(2);
    }
  });

  it('moves a point by at most about 800 m', () => {
    // Half of 0.01° on each axis, diagonally: ~0.0071° ≈ 790 m at this latitude.
    const exact = { lat: 9.935, lng: -84.1035 };
    const rough = coarsen(exact);
    const dLat = (rough.lat - exact.lat) * 111_320;
    const dLng = (rough.lng - exact.lng) * 111_320 * Math.cos((exact.lat * Math.PI) / 180);
    expect(Math.hypot(dLat, dLng)).toBeLessThan(800);
  });
});

describe('the fallback', () => {
  it('is the GAM centre', () => {
    expect(GAM_CENTRE).toEqual({ lat: 9.9281, lng: -84.0907 });
  });

  it('says why it fell back, in both cases', () => {
    expect(originFailureText('denied')).toMatch(/^Sin permiso de ubicación/);
    expect(originFailureText('unavailable')).toMatch(/^No pudimos saber dónde estás/);
  });
});
