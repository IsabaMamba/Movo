import { StyleSheet } from 'react-native';

import { color, radius, size, space, stroke, type } from '../../theme';

/**
 * A reading screen, not a list of cards: the rules are text somebody may
 * read top to bottom once, so body type and a narrow measure matter more
 * than anything tappable. The index (step 31) is the one list on it.
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

  topBar: {
    alignItems: 'center',
    borderBottomColor: color.border.default,
    borderBottomWidth: stroke.hair,
    flexDirection: 'row',
    gap: space.sm,
    paddingBottom: space.md,
  },
  topBack: {
    alignItems: 'center',
    height: size.minTarget,
    justifyContent: 'center',
    marginLeft: -space.md,
    width: size.minTarget,
  },
  topText: { flex: 1 },
  topTitle: { ...type.action, color: color.text.primary },
  topSub: { ...type.caption, color: color.text.tertiary },

  header: { gap: space.sm },
  title: { ...type.title, color: color.text.primary },
  version: { ...type.caption, color: color.text.tertiary },
  intro: { ...type.bodySmall, color: color.text.secondary },

  /**
   * Outlined, never filled — a filled surface means "primary action"
   * everywhere else in the product. Danger rather than Sun since step 31:
   * the box is about being in danger, and it is the only red on the page.
   */
  safety: {
    borderColor: color.semantic.danger,
    borderRadius: radius.lg,
    borderWidth: stroke.hair,
    padding: space.lg,
  },
  safetyText: { ...type.bodySmall, color: color.text.secondary },
  safetyLead: { color: color.text.primary, fontWeight: '700' },

  index: { gap: space.sm },
  overline: { ...type.label, color: color.text.tertiary, letterSpacing: 1 },
  indexRow: {
    alignItems: 'center',
    backgroundColor: color.bg.surface,
    borderColor: color.border.default,
    borderRadius: radius.lg,
    borderWidth: stroke.hair,
    flexDirection: 'row',
    gap: space.md,
    minHeight: size.control + 8,
    paddingHorizontal: space.lg,
  },
  indexTitle: { ...type.bodySmall, color: color.text.primary, flex: 1, fontWeight: '600' },
  indexCount: { ...type.caption, color: color.text.tertiary },

  section: { gap: space.lg },
  sectionTitle: { ...type.heading, color: color.text.primary },

  item: { gap: space.xs },
  rule: { ...type.action, color: color.text.primary },
  detail: { ...type.body, color: color.text.secondary },
});
