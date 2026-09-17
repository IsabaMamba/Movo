import { describe, expect, it } from 'vitest';

import { parseCoordinates } from './activities';

/**
 * Venues are created by pasting a link, because there is no map picker yet. So
 * this function decides where a real session happens, and a wrong answer is not
 * a rendering bug — it is people standing in the wrong park.
 *
 * `docs/status.md` (P1 · 9) reports a venue on the live project whose latitude
 * matches another venue 17 km away exactly. "Exactly" is the tell: two people
 * mistyping do not collide to five decimal places. Something is reading the
 * same number out of two different links, and the last section of this file is
 * about what.
 */
describe('parseCoordinates', () => {
  const LA_SABANA = { lat: 9.935, lng: -84.1035 };

  describe('the formats people actually paste', () => {
    it('reads a Google Maps viewport link', () => {
      const result = parseCoordinates('https://www.google.com/maps/@9.9350,-84.1035,17z');
      expect(result).toEqual({ ok: true, value: LA_SABANA });
    });

    it('reads a Waze link', () => {
      const result = parseCoordinates('https://waze.com/ul?ll=9.9350,-84.1035&navigate=yes');
      expect(result).toEqual({ ok: true, value: LA_SABANA });
    });

    it('reads a Waze link with the comma percent-encoded', () => {
      // WhatsApp escapes the comma often enough that this is the common case,
      // not the exotic one.
      const result = parseCoordinates('https://waze.com/ul?ll=9.9350%2C-84.1035');
      expect(result).toEqual({ ok: true, value: LA_SABANA });
    });

    it('reads a bare pair typed by hand', () => {
      expect(parseCoordinates('9.9350, -84.1035')).toEqual({ ok: true, value: LA_SABANA });
      expect(parseCoordinates('9.9350,-84.1035')).toEqual({ ok: true, value: LA_SABANA });
    });

    it('ignores surrounding whitespace and text', () => {
      expect(parseCoordinates('  La Sabana 9.9350, -84.1035  ')).toEqual({
        ok: true,
        value: LA_SABANA,
      });
    });
  });

  describe('failures that need different things from the person', () => {
    it('names a shortened link rather than calling it malformed', () => {
      // The person did nothing wrong; the link genuinely does not contain a
      // coordinate, and telling them to "check the format" is useless.
      expect(parseCoordinates('https://maps.app.goo.gl/AbCdEf123')).toEqual({
        ok: false,
        reason: 'short_link',
      });
    });

    it('rejects a coordinate outside Costa Rica, and says what it read', () => {
      // Keeping the value matters: "eso queda en México" is actionable,
      // "formato inválido" is not.
      const result = parseCoordinates('https://www.google.com/maps/@19.4326,-99.1332,17z');
      expect(result).toEqual({
        ok: false,
        reason: 'out_of_range',
        value: { lat: 19.4326, lng: -99.1332 },
      });
    });

    it('reports no pair for text with no coordinate in it', () => {
      expect(parseCoordinates('el parque de siempre')).toEqual({ ok: false, reason: 'no_pair' });
      expect(parseCoordinates('')).toEqual({ ok: false, reason: 'no_pair' });
      expect(parseCoordinates('   ')).toEqual({ ok: false, reason: 'no_pair' });
    });

    it('does not mistake a decimal comma for a pair', () => {
      // A Spanish keyboard writes 9,9350 — that is one number, not two.
      expect(parseCoordinates('9,9350')).toEqual({ ok: false, reason: 'no_pair' });
    });
  });

  /**
   * The bug in P1 · 9, and why two venues share a latitude.
   *
   * A Google Maps place URL carries TWO coordinate pairs:
   *
   *   .../place/Pico+Blanco/@9.8900,-84.1300,12z/data=...!3d9.8512!4d-84.0855
   *                         ^^^^^^^^^^^^^^^^^^^           ^^^^^^^^^^^^^^^^^^
   *                         the map viewport              the actual pin
   *
   * `@` is where the camera is pointing and at what zoom. `!3d`/`!4d` is the
   * place itself. At a wide zoom the viewport is a rounded, city-level point —
   * so two different venues, opened at the same zoom in the same area, produce
   * URLs whose `@` values are identical to several decimal places while their
   * pins are kilometres apart.
   *
   * That is exactly the reported symptom, and it is not a parsing typo: the
   * function reads the right number out of the wrong half of the URL.
   */
  describe('a Google place link carries the viewport and the pin', () => {
    const PLACE_URL =
      'https://www.google.com/maps/place/Cerro+Pico+Blanco/' +
      '@9.8900,-84.1300,12z/data=!4m6!3m5!1s0x0:0x0!8m2!3d9.8512!4d-84.0855';

    it('prefers the pin over the viewport', () => {
      const result = parseCoordinates(PLACE_URL);
      expect(result).toEqual({ ok: true, value: { lat: 9.8512, lng: -84.0855 } });
    });

    it('does not return the viewport centre for a place link', () => {
      const result = parseCoordinates(PLACE_URL);
      // The failure this guards against: two venues opened at the same zoom in
      // the same area share an `@` and end up at the same point.
      expect(result).not.toEqual({ ok: true, value: { lat: 9.89, lng: -84.13 } });
    });

    it('still uses the viewport when a link has no pin', () => {
      // A plain map link has only `@`, and that is the best available answer.
      expect(parseCoordinates('https://www.google.com/maps/@9.9350,-84.1035,17z')).toEqual({
        ok: true,
        value: LA_SABANA,
      });
    });
  });
});
