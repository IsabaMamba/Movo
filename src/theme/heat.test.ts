import { describe, expect, it } from 'vitest';

import { UNCAPPED_REFERENCE, densityOf, heatColor, heatStops, occupancyLabel } from './heat';

/**
 * The heat ramp is the only thing on Descubrir that says "this session is worth
 * going to" without words. A person scanning the map reads colour first and the
 * count second, so an arithmetic slip here does not look like a bug — it looks
 * like a quiet Tuesday run club, and nobody shows up.
 *
 * Two properties carry that meaning and both are tested as properties, not as
 * sampled values: density is bounded, and lightness only ever rises.
 */

/** sRGB relative luminance (WCAG 2.x). Stands in for "how bright this reads". */
function luminance(hex: string): number {
  const channel = (byte: number): number => {
    const s = byte / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = channel(parseInt(hex.slice(1, 3), 16));
  const g = channel(parseInt(hex.slice(3, 5), 16));
  const b = channel(parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const HEX = /^#[0-9A-F]{6}$/;

describe('densityOf', () => {
  /**
   * `max` being nullable is the whole difficulty. A pickup game at a court with
   * twelve spots and an open-invite run club are the same row in the same table,
   * and they cannot share a denominator.
   */
  describe('a session with a capacity', () => {
    it('reads empty at zero and full at the cap', () => {
      expect(densityOf(0, 12)).toBe(0);
      expect(densityOf(12, 12)).toBe(1);
    });

    it('puts half a roster halfway up the ramp', () => {
      expect(densityOf(6, 12)).toBeCloseTo(0.5, 10);
    });

    it('does not go past full when the roster overflows', () => {
      // `activities_capacity` keeps joined_count under the cap in the database,
      // but this function is also handed counts a screen has already adjusted
      // locally. A t above 1 walks off the end of the stop array, so the clamp
      // is load-bearing rather than defensive tidiness.
      expect(densityOf(20, 12)).toBe(1);
    });

    it('treats a capacity of zero as no capacity rather than dividing by it', () => {
      // The column is constrained to 2–1000, so a 0 only arrives from something
      // already wrong. It must not become NaN: NaN indexes the stop array as
      // `undefined` and the colour function throws on it.
      expect(densityOf(0, 0)).toBe(0);
      expect(Number.isNaN(densityOf(5, 0))).toBe(false);
    });
  });

  describe('a session with no capacity', () => {
    it('scales against the fixed reference instead of inventing a cap', () => {
      expect(densityOf(0, null)).toBe(0);
      expect(densityOf(UNCAPPED_REFERENCE, null)).toBe(1);
      expect(densityOf(UNCAPPED_REFERENCE / 2, null)).toBeCloseTo(0.5, 10);
    });

    it('saturates rather than overflowing when a big crowd turns up', () => {
      expect(densityOf(400, null)).toBe(1);
    });

    /**
     * The product rule worth protecting: twelve people is a FULL court and a
     * QUIET run club, and the map has to say so. If an uncapped session reached
     * the hot end at the same headcount as a capped one, every popular open
     * invite would look closed and people would stop tapping it.
     */
    it('never reads as full at a headcount that fills a capped session', () => {
      for (const joined of [4, 8, 12, 20]) {
        expect(densityOf(joined, joined)).toBe(1);
        expect(densityOf(joined, null)).toBeLessThan(1);
      }
    });
  });

  it('clamps a negative count to empty', () => {
    // No path writes one today, but a count arriving negative from a bad join
    // would otherwise produce a negative t and a stop index of -1.
    expect(densityOf(-3, 12)).toBe(0);
    expect(densityOf(-3, null)).toBe(0);
  });
});

describe('occupancyLabel', () => {
  /**
   * This is the sentence a person weighs before deciding to go. "8 de 12" says
   * there is room; "8 van" says eight people are coming and there is no queue.
   * Collapsing the two shapes would make one of those claims falsely.
   */
  it('gives a capped session a denominator', () => {
    expect(occupancyLabel(8, 12)).toBe('8 de 12');
    expect(occupancyLabel(0, 12)).toBe('0 de 12');
    expect(occupancyLabel(12, 12)).toBe('12 de 12');
  });

  it('gives an uncapped session a count and no denominator', () => {
    expect(occupancyLabel(8, null)).toBe('8 van');
    expect(occupancyLabel(0, null)).toBe('0 van');
  });

  it('agrees the verb with one person', () => {
    // "1 van" is the kind of wrong that makes an app feel machine-made, and a
    // session with exactly one person signed up is the most common case there is.
    expect(occupancyLabel(1, null)).toBe('1 va');
    expect(occupancyLabel(2, null)).toBe('2 van');
  });

  it('never invents a denominator for an uncapped session', () => {
    expect(occupancyLabel(8, null)).not.toContain('de');
  });
});

describe('heatStops', () => {
  it('returns the same number of stops in both modes', () => {
    // Deliberately not a hardcoded count. The ramp went from eight stops to
    // nine when the mauve crossing was replaced, and a literal here turned a
    // colour decision into two failing tests that said nothing about colour.
    // What must hold is that a legend and the ramp agree, whatever the length.
    const calma = heatStops('calma');
    expect(calma.length).toBeGreaterThanOrEqual(5);
    expect(heatStops('heatwave')).toHaveLength(calma.length);
  });

  it('returns renderable hex in both modes', () => {
    // A legend swatch that receives `undefined` renders transparent, which on a
    // dark map is invisible rather than obviously broken.
    for (const mode of ['calma', 'heatwave'] as const) {
      for (const stop of heatStops(mode)) {
        expect(stop).toMatch(HEX);
      }
    }
  });

  it('shares its endpoints with the ramp itself', () => {
    for (const mode of ['calma', 'heatwave'] as const) {
      const stops = heatStops(mode);
      expect(stops[0]).toBe(heatColor(0, mode));
      expect(stops[stops.length - 1]).toBe(heatColor(1, mode));
    }
  });

  /**
   * Rule 1 of the ramp, finally checked instead of asserted.
   *
   * `heat.ts` has said "lightness rises monotonically" since the first
   * version. Nothing enforced it. That is how the mauve crossing survived
   * two audits, and it is why three candidate ramps that kept teal looked
   * fine in a swatch strip and were wrong: saturated magenta cannot reach
   * the luminance its slot needs.
   *
   * WCAG relative luminance, because it is the one definition already used
   * everywhere else in this repo for contrast.
   */
  it('rises in luminance at every step, in both modes', () => {
    const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };

    for (const mode of ['calma', 'heatwave'] as const) {
      const stops = heatStops(mode);
      for (let i = 1; i < stops.length; i++) {
        const previous = luminance(stops[i - 1]!);
        const current = luminance(stops[i]!);
        expect(
          current,
          `${mode}: stop ${i} (${stops[i]}) is not brighter than stop ${i - 1} (${stops[i - 1]})`,
        ).toBeGreaterThan(previous);
      }
    }
  });

  it('starts at the empty-cell colour in both modes', () => {
    // The coldest stop is deliberately bg.base, so an empty cell disappears
    // instead of drawing a dark blue dot on every quiet corner of the map.
    expect(heatStops('calma')[0]).toBe('#0B0F1F');
    expect(heatStops('heatwave')[0]).toBe('#0B0F1F');
  });

  it('reaches heat earlier in heatwave than in calma', () => {
    // The two modes are one exponent apart, not two palettes. If they ever
    // returned the same ramp the mode switch would be a no-op control.
    const calma = heatStops('calma');
    const heatwave = heatStops('heatwave');
    expect(heatwave).not.toEqual(calma);
    for (let i = 1; i < 7; i++) {
      expect(luminance(heatwave[i]!)).toBeGreaterThan(luminance(calma[i]!));
    }
  });
});

describe('heatColor', () => {
  it('anchors both ends of the ramp', () => {
    for (const mode of ['calma', 'heatwave'] as const) {
      expect(heatColor(0, mode)).toBe('#0B0F1F');
      expect(heatColor(1, mode)).toBe('#F6E9D7');
    }
  });

  it('defaults to calma when no mode is given', () => {
    expect(heatColor(0.5)).toBe(heatColor(0.5, 'calma'));
  });

  it('returns valid hex across the whole range in both modes', () => {
    for (const mode of ['calma', 'heatwave'] as const) {
      for (let i = 0; i <= 100; i++) {
        expect(heatColor(i / 100, mode)).toMatch(HEX);
      }
    }
  });

  describe('values that should never arrive but do', () => {
    /**
     * `t` comes from `densityOf`, which clamps — but `heatColor` is exported and
     * called directly from legends and previews. The failure mode is specific:
     * an out-of-range `t` indexes past the stop array, `hexToRgb(undefined)`
     * throws, and a throw inside a map cell takes the whole screen down.
     */
    it('clamps below zero to the cold end', () => {
      expect(heatColor(-0.5)).toBe('#0B0F1F');
      expect(heatColor(-100)).toBe('#0B0F1F');
      expect(heatColor(-Infinity)).toBe('#0B0F1F');
    });

    it('clamps above one to the hot end', () => {
      expect(heatColor(1.5)).toBe('#F6E9D7');
      expect(heatColor(100)).toBe('#F6E9D7');
      expect(heatColor(Infinity)).toBe('#F6E9D7');
    });

    it('never returns undefined or a partial hex', () => {
      for (const t of [-1, -0.0001, 0, 0.9999, 1, 1.0001, 2]) {
        for (const mode of ['calma', 'heatwave'] as const) {
          expect(heatColor(t, mode)).toMatch(HEX);
        }
      }
    });
  });

  /**
   * Rule 1 of the ramp: brighter always means busier. This is what lets the map
   * survive a greyscale screenshot, a cheap phone panel, and the roughly one in
   * twelve men who will not see the teal-to-orange hue shift at all. If
   * lightness ever dipped, two different densities would read as the same
   * brightness and the ordering would be lost for exactly those people.
   */
  describe('lightness only rises', () => {
    it('rises across the eight stops', () => {
      for (const mode of ['calma', 'heatwave'] as const) {
        const ys = heatStops(mode).map(luminance);
        for (let i = 1; i < ys.length; i++) {
          expect(ys[i]!).toBeGreaterThan(ys[i - 1]!);
        }
      }
    });

    it('rises across the continuous ramp, allowing for 8-bit rounding', () => {
      // The ramp is interpolated in floating point and then rounded to a
      // 24-bit hex string, so two samples a few thousandths apart can round in
      // opposite directions. That quantisation noise is bounded by one channel
      // step (~0.004 luminance near the bright end); anything larger would be a
      // real dip in the ramp.
      const QUANTISATION = 0.005;
      for (const mode of ['calma', 'heatwave'] as const) {
        let previous = -Infinity;
        for (let i = 0; i <= 500; i++) {
          const y = luminance(heatColor(i / 500, mode));
          expect(y).toBeGreaterThanOrEqual(previous - QUANTISATION);
          previous = Math.max(previous, y);
        }
      }
    });

    it('separates the ends far enough to be visible in greyscale', () => {
      // If the ramp only spanned a narrow band of lightness, monotonic would
      // still be true and useless.
      expect(luminance(heatColor(1)) - luminance(heatColor(0))).toBeGreaterThan(0.5);
    });
  });
});
