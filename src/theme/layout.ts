/**
 * Spacing, radius, and touch geometry.
 *
 * Scale of 4. Radii are generous on purpose — the product is warm, not
 * technical. Depth comes from surface luminance, never from shadow, because
 * shadow is invisible on a near-black ground.
 */

export const space = {
  /** 4 */ xs: 4,
  /** 8 */ sm: 8,
  /** 12 */ md: 12,
  /** 16 — default screen gutter */ lg: 16,
  /** 20 */ xl: 20,
  /** 24 */ xxl: 24,
  /** 32 */ xxxl: 32,
  /** 40 */ huge: 40,
} as const;

export const radius = {
  /** Chips, small inputs. */
  sm: 8,
  /** Inputs, rectangular buttons. */
  md: 12,
  /** Cards, sheets, modals. */
  lg: 16,
  /** Join button, filter chips, avatars. */
  full: 999,
} as const;

export const size = {
  /**
   * Minimum touch target, always. A 32px chip still gets 44px of tappable area
   * via padding or hitSlop — the visual size and the target are separate things.
   */
  minTarget: 44,
  /** Standard control height. */
  control: 48,
  /** Compact control (chips, inline actions). */
  controlSm: 36,
  /** Tab bar. */
  tabBar: 64,
  /** Avatar sizes. */
  avatarSm: 26,
  avatarMd: 40,
  avatarLg: 72,
} as const;

/** Border widths. Hairlines vanish on dark grounds; 1 is the floor. */
export const stroke = {
  hair: 1,
  base: 1.5,
  thick: 2,
  /** Focus ring — must be visible without relying on colour alone. */
  focus: 2,
} as const;

/** Copy limits enforced by the schema, surfaced so inputs can count down. */
export const limits = {
  /** activities.title */
  title: 120,
  /** activities.description */
  description: 4000,
  /** activities.meeting_point and short-text attributes */
  shortText: 200,
  /** activities.rules */
  rules: 2000,
} as const;
