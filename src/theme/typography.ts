/**
 * Typography.
 *
 * Barlow, one family in three roles. It is a signage grotesque — drawn to be
 * read fast and at a distance, which is the real use condition: somebody
 * checking their phone before walking out the door at 5 a.m.
 *
 * One family rather than two keeps the Expo bundle small and removes any chance
 * of two faces disagreeing. Load with `expo-font`; the fallback stack matters
 * because the first paint happens before the font resolves.
 */

export const fontFamily = {
  regular: 'Barlow_400Regular',
  medium: 'Barlow_500Medium',
  semibold: 'Barlow_600SemiBold',
  bold: 'Barlow_700Bold',
  /** Web build only — RN ignores it, CSS needs it. */
  fallback: 'Barlow, "Helvetica Neue", Arial, sans-serif',
} as const;

/**
 * React Native wants unitless numbers for `fontSize`, `lineHeight` and
 * `letterSpacing` — line height in px, not a ratio. Values below are px.
 */
export const type = {
  /** Screen titles. Uppercase in the design; do not uppercase in the data. */
  display: {
    fontFamily: fontFamily.bold,
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: -1,
  },
  /** Session and club names. */
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  /** Card headings. */
  heading: {
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.1,
  },
  /** Body copy, descriptions, rules. */
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0,
  },
  /** Secondary metadata under a title. */
  bodySmall: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0,
  },
  /** Field labels and section eyebrows. Always uppercase, always tracked out. */
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.3,
  },
  /** Buttons and chips. */
  action: {
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0.2,
  },
  /** Helper text, character counters, error messages. */
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.1,
  },
  /**
   * Times, counts, prices, distances. Always tabular — these update live and a
   * proportional figure makes the whole row shift when 9 becomes 10.
   */
  data: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    lineHeight: 24,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'] as const,
  },
  dataSmall: {
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    lineHeight: 18,
    letterSpacing: 0,
    fontVariant: ['tabular-nums'] as const,
  },
} as const;

export type TypeTokens = typeof type;
