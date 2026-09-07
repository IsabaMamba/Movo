/**
 * Movo colour tokens.
 *
 * Values are React Native friendly (plain hex strings, no CSS functions) because
 * the same tokens serve the Expo web build and the native builds.
 *
 * Every value here has been measured against WCAG AA on the real backgrounds.
 * The ratios in the comments are against `bg.base` unless stated otherwise.
 */

/** Raw palette. Do not reference these directly in screens — use `color` below. */
export const palette = {
  deepNavy: '#0B0F1F',
  navy: '#151A2E',
  charcoal: '#1F2437',
  abyss: '#070A14',
  slate: '#2A344A',
  steel: '#3B445B',
  blueGray: '#4B5A73',
  mist: '#6E7A91',
  cloud: '#A9B2C3',
  fog: '#8892A8',
  white: '#FFFFFF',
  sand: '#F6E9D7',
  teal: '#2F7A8A',
  aqua: '#60D1D4',
  sun: '#FFC56B',
  coral: '#FF7A4D',
  heatRed: '#E94E3D',
  emerald: '#46D6A0',
} as const;

export const color = {
  bg: {
    /** Screen ground. */
    base: palette.deepNavy,
    /** Bars, sections, sheets. */
    surface: palette.navy,
    /** Cards and modals — depth is luminance, not shadow. */
    raised: palette.charcoal,
    /** Map well and input interiors. */
    sunken: palette.abyss,
  },

  border: {
    /** Dividers and hairlines. */
    default: palette.slate,
    /** Input and chip outlines. */
    strong: palette.steel,
    /** Focus ring. */
    focus: palette.aqua,
    /** Invalid input outline. */
    error: palette.heatRed,
  },

  text: {
    /** 19.05:1 — titles, values, anything that must be read. */
    primary: palette.white,
    /** 8.93:1 — descriptions and metadata. */
    secondary: palette.cloud,
    /**
     * 6.10:1 — field labels, hints, helper text, timestamps, counts.
     * This is the floor for anything a user is expected to read.
     */
    tertiary: palette.fog,
    /**
     * 4.40:1 — BELOW the AA threshold. Disabled text is exempt from it; nothing
     * else is. The long name is deliberate: an audit found this value used for
     * helper text on three separate screens, because `text.disabled` was short
     * enough to reach for. Helper and hint text goes to `text.tertiary`.
     */
    disabledOnly: palette.mist,
    /** On Sun and Aqua fills. White on Sun is 1.56:1 — never do it. */
    inverse: palette.deepNavy,
    /** On heat-ramp surfaces. */
    warm: palette.sand,
    /** 5.10:1 on base, 4.12:1 on raised — see `semantic.dangerOnRaised`. */
    error: palette.heatRed,
    /**
     * Report, block, help. 8.93:1 — never quieter than body text.
     * An audit found "Reportar esta sesión" as the least readable string on the
     * detail screen; on a product that introduces strangers, the safety
     * affordance is the last thing that should recede.
     */
    safety: palette.cloud,
  },

  accent: {
    /** Primary action, active tab. Always paired with `text.inverse`. */
    primary: palette.sun,
    /** Icons, links, selection. */
    cool: palette.aqua,
    /** Map base and cool surfaces. */
    deep: palette.teal,
  },

  semantic: {
    /** Errors, destructive actions, notification badges. */
    danger: palette.heatRed,
    /**
     * `danger` only reaches 4.12:1 on `bg.raised`. Use this lifted value for
     * error text that sits inside a card.
     */
    dangerOnRaised: '#F26150',
    /** Confirmed, attended. */
    success: palette.emerald,
    /**
     * Warnings borrow Sun, but outline only — a filled Sun surface means
     * "primary action", and a warning that looks like a button is a trap.
     */
    warning: palette.sun,
  },

  /**
   * Transparent overlays. RN accepts 8-digit hex, so these work on both targets.
   */
  alpha: {
    /** Selected chip fill. */
    aqua10: '#60D1D41A',
    /** Pressed state on dark surfaces. */
    white08: '#FFFFFF14',
    /** Scrim behind modals and sheets. */
    scrim: '#070A14CC',
  },
} as const;

export type ColorTokens = typeof color;
