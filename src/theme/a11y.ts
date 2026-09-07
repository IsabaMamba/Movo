/**
 * Accessibility floors, as code rather than prose.
 *
 * An audit of the first three screens found the same class of defect repeatedly:
 * rules that were written down, agreed, and then not applied. A constant is
 * harder to forget than a paragraph, so the ones that can be expressed as
 * numbers or helpers live here.
 */

import { size } from './layout';

/**
 * Smallest readable size, in px.
 *
 * Uppercase text with letter-spacing survives smaller sizes than lowercase, so
 * it gets its own (slightly lower) floor. Anything below `trackedLabel` is not
 * a size choice — it is a decision that the text does not need to be read, and
 * should be removed instead.
 */
export const minFontSize = {
  /** Sentence-case body, labels, helper text. */
  body: 11,
  /** Uppercase + letter-spacing ≥ 0.1em only. */
  trackedLabel: 10,
} as const;

/**
 * Expands a control's touch area to `size.minTarget` without changing how big
 * it looks. Visual size and target size are independent — a 30px chip is fine,
 * a 30px target is not.
 *
 *   <Pressable hitSlop={hitSlopFor(30)} …>
 */
export function hitSlopFor(visualSize: number): number {
  const missing = size.minTarget - visualSize;
  return missing > 0 ? Math.ceil(missing / 2) : 0;
}

/**
 * Focus ring, for the web build. Expo web ships before either app store, so a
 * control with no visible focus state is simply unreachable by keyboard.
 * Applied to every pressable surface — cards and chips included, which is where
 * the audit found it missing.
 */
export const focusRing = {
  outlineWidth: 2,
  outlineOffset: 2,
  /** `color.border.focus` — imported at the call site to avoid a cycle. */
} as const;

/**
 * Spoken description of a session's occupancy.
 *
 * The heat colour and the count encode the same variable, so the bar is
 * decorative to a screen reader and takes `aria-hidden` / `accessibilityElementsHidden`.
 * This string carries the meaning instead — the colour alone says nothing aloud.
 */
export function occupancyA11yLabel(joined: number, max: number | null, density: number): string {
  const people = `${joined} ${joined === 1 ? 'persona' : 'personas'}`;
  const of = max === null ? '' : ` de ${max}`;
  const band =
    density >= 0.85
      ? 'casi llena'
      : density >= 0.5
        ? 'muy activa'
        : density >= 0.2
          ? 'activa'
          : 'tranquila';
  return `${people}${of} — sesión ${band}`;
}

/**
 * BCP 47 tag for the app.
 *
 * `es-419` is Latin American Spanish, which is what the copy is now written in.
 * It is not cosmetic: it changes screen-reader pronunciation and which keyboard
 * the OS offers. `es-CR` would be wrong the moment there is a user in Panamá.
 */
export const locale = 'es-419' as const;

/** IANA zone for display. Times are stored as instants; this is presentation. */
export const timeZone = 'America/Costa_Rica' as const;
