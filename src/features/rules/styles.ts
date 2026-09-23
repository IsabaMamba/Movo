import { StyleSheet } from 'react-native';

import { color, radius, size, space, stroke, type } from '../../theme';

/**
 * A reading screen, not a list of cards: the rules are text somebody may
 * read top to bottom once, so body type and a narrow measure matter more
 * than anything tappable.
 */
export const rulesStyles = StyleSheet.create({
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

  header: { gap: space.sm },
  title: { ...type.display, color: color.text.primary },
  version: { ...type.caption, color: color.text.tertiary },
  intro: { ...type.body, color: color.text.secondary },

  /**
   * Outlined in the warning colour, never filled — a filled Sun surface means
   * "primary action" everywhere else in the product.
   */
  safety: {
    borderColor: color.semantic.warning,
    borderRadius: radius.lg,
    borderWidth: stroke.hair,
    padding: space.lg,
  },
  safetyText: { ...type.body, color: color.text.primary },

  section: { gap: space.lg },
  sectionTitle: { ...type.heading, color: color.text.primary },

  item: { gap: space.xs },
  rule: { ...type.action, color: color.text.primary },
  detail: { ...type.body, color: color.text.secondary },
});
