import { StyleSheet } from 'react-native';

import { color, radius, size, space, stroke, type } from '../../theme';

/**
 * Built on Mis sesiones, which links here: the same column, the same cards.
 * The one addition is the notice, which is set as body text and not as a
 * caption — a consent nobody can comfortably read is not consent.
 */
export const historyStyles = StyleSheet.create({
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

  notice: {
    backgroundColor: color.bg.surface,
    borderRadius: radius.lg,
    gap: space.md,
    padding: space.lg,
  },
  noticeText: { ...type.body, color: color.text.primary },
  noticeMeta: { ...type.caption, color: color.text.tertiary },

  group: { gap: space.md },
  card: {
    backgroundColor: color.bg.surface,
    borderRadius: radius.lg,
    gap: space.xs,
    padding: space.lg,
  },
  cardText: { ...type.body, color: color.text.primary },
  cardMeta: { ...type.caption, color: color.text.tertiary },

  empty: { ...type.bodySmall, color: color.text.secondary },

  /** Turning it on is the one primary action on the screen. */
  primary: {
    alignItems: 'center',
    backgroundColor: color.accent.primary,
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: size.control,
  },
  primaryText: { ...type.action, color: color.text.inverse },

  /**
   * Deleting is never quieter than enabling was. Outlined rather than filled,
   * because a filled button reads as the thing the screen wants you to do.
   */
  grave: {
    alignItems: 'center',
    borderColor: color.semantic.warning,
    borderRadius: radius.md,
    borderWidth: stroke.hair,
    justifyContent: 'center',
    minHeight: size.control,
    paddingHorizontal: space.lg,
  },
  graveText: { ...type.action, color: color.semantic.warning },

  plain: {
    alignItems: 'center',
    borderColor: color.border.strong,
    borderRadius: radius.md,
    borderWidth: stroke.hair,
    justifyContent: 'center',
    minHeight: size.control,
    paddingHorizontal: space.lg,
  },
  plainText: { ...type.action, color: color.text.primary },

  actions: { gap: space.md },
  confirm: {
    backgroundColor: color.bg.raised,
    borderRadius: radius.lg,
    gap: space.md,
    padding: space.lg,
  },
  confirmRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },

  status: { ...type.bodySmall, color: color.text.primary },
  error: { ...type.bodySmall, color: color.semantic.dangerOnRaised },
});
