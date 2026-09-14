import { StyleSheet } from 'react-native';

import { color, radius, size, space, type } from '../../theme';

/**
 * Deliberately close to the organizer console: the two screens answer the
 * same question from opposite sides, and somebody who both organises and
 * attends should not have to learn two layouts to read their own week.
 */
export const mineStyles = StyleSheet.create({
  screen: { backgroundColor: color.bg.base, flex: 1 },
  content: {
    gap: space.xl,
    marginHorizontal: 'auto',
    maxWidth: 720,
    padding: space.xl,
    paddingBottom: space.huge,
    paddingTop: space.xxxl,
    width: '100%',
  },

  back: { justifyContent: 'center', minHeight: size.minTarget },
  backText: { ...type.bodySmall, color: color.accent.cool },

  title: { ...type.display, color: color.text.primary },
  subtitle: { ...type.bodySmall, color: color.text.secondary },
  sectionTitle: { ...type.heading, color: color.text.primary },

  group: { gap: space.md },

  card: {
    backgroundColor: color.bg.surface,
    borderRadius: radius.lg,
    gap: space.xs,
    padding: space.lg,
  },
  cardTitle: { ...type.title, color: color.text.primary },
  cardMeta: { ...type.bodySmall, color: color.text.secondary },
  /** Helper text sits at the readable floor, never at `disabledOnly`. */
  cardNote: { ...type.caption, color: color.text.tertiary, paddingTop: space.xs },

  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  badgeText: { ...type.caption },

  /**
   * Warmth is reserved for occupancy everywhere else in Movo (ADR 0004), so
   * none of these states borrow it. They are states of a person, not of a
   * session filling up, and a warm chip here would read as a heat value with
   * no scale beside it.
   */
  badgeGoing: { backgroundColor: color.accent.deep },
  badgeGoingText: { color: color.text.primary },
  badgeWait: { backgroundColor: color.bg.raised },
  badgeWaitText: { color: color.accent.cool },
  badgeDone: { backgroundColor: color.bg.raised },
  badgeDoneText: { color: color.semantic.success },
  badgeMiss: { backgroundColor: color.bg.raised },
  badgeMissText: { color: color.semantic.dangerOnRaised },
  badgeOpen: { backgroundColor: color.bg.raised },
  badgeOpenText: { color: color.text.tertiary },

  error: { ...type.bodySmall, color: color.semantic.dangerOnRaised },

  empty: { alignItems: 'center', gap: space.sm, padding: space.huge },
  emptyBody: { ...type.bodySmall, color: color.text.secondary, textAlign: 'center' },

  linkText: { ...type.bodySmall, color: color.accent.cool, textDecorationLine: 'underline' },
});
