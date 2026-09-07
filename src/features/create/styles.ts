import { StyleSheet } from 'react-native';

import { color, radius, size, space, stroke, type } from '../../theme';

/**
 * First screen built against the thermal tokens rather than placeholder
 * values. Warm colour is reserved: `accent.primary` is the publish action and
 * nothing else on this screen, because heat means occupancy density everywhere
 * else in the product (ADR 0004).
 */
export const createStyles = StyleSheet.create({
  screen: { backgroundColor: color.bg.base, flex: 1 },
  content: { gap: space.xxl, padding: space.lg, paddingBottom: space.huge, paddingTop: space.xxxl },

  header: { gap: space.xs },
  title: { ...type.display, color: color.text.primary },
  subtitle: { ...type.bodySmall, color: color.text.secondary },

  section: { gap: space.md },
  sectionHead: { alignItems: 'baseline', flexDirection: 'row', gap: space.sm },
  sectionNumber: {
    ...type.dataSmall,
    // The token's fontVariant is a readonly tuple; RN wants a mutable array.
    fontVariant: [...type.dataSmall.fontVariant],
    color: color.accent.cool,
  },
  sectionTitle: { ...type.heading, color: color.text.primary },

  field: { gap: space.sm },
  labelRow: { alignItems: 'baseline', flexDirection: 'row', gap: space.sm },
  label: { ...type.label, color: color.text.secondary },
  optional: { ...type.caption, color: color.text.tertiary },

  input: {
    ...type.body,
    backgroundColor: color.bg.raised,
    borderColor: color.border.default,
    borderRadius: radius.md,
    borderWidth: stroke.hair,
    color: color.text.primary,
    minHeight: size.control,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  inputError: { borderColor: color.border.error },

  hint: { ...type.caption, color: color.text.tertiary },
  emptyNote: { ...type.bodySmall, color: color.text.tertiary, paddingVertical: space.sm },
  error: { ...type.caption, color: color.semantic.dangerOnRaised },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    alignItems: 'center',
    borderColor: color.border.default,
    borderRadius: radius.full,
    borderWidth: stroke.hair,
    justifyContent: 'center',
    minHeight: size.controlSm,
    paddingHorizontal: space.lg,
  },
  chipOn: { backgroundColor: color.accent.deep, borderColor: color.accent.cool },
  chipText: { ...type.action, color: color.text.secondary },
  chipTextOn: { color: color.text.primary },

  /**
   * The aqua rule is load-bearing, not decoration: everything inside it was
   * generated from attribute_schema and nothing in it is hand written.
   */
  schemaBlock: {
    borderLeftColor: color.accent.cool,
    borderLeftWidth: stroke.thick,
    gap: space.lg,
    paddingLeft: space.lg,
  },

  row: { flexDirection: 'row', gap: space.md },
  rowItem: { flex: 1, gap: space.sm },

  venue: {
    backgroundColor: color.bg.raised,
    borderColor: color.border.default,
    borderRadius: radius.md,
    borderWidth: stroke.hair,
    gap: space.xs,
    padding: space.md,
  },
  venueOn: { borderColor: color.accent.cool },
  venueName: { ...type.heading, color: color.text.primary },
  venueMeta: { ...type.caption, color: color.text.tertiary },

  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.md,
    minHeight: size.minTarget,
  },
  switchLabel: { ...type.body, color: color.text.primary, flex: 1 },

  publish: {
    alignItems: 'center',
    backgroundColor: color.accent.primary,
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: size.control,
  },
  publishDisabled: { opacity: 0.4 },
  publishText: { ...type.action, color: color.text.inverse },

  banner: {
    backgroundColor: color.bg.raised,
    borderLeftColor: color.semantic.dangerOnRaised,
    borderLeftWidth: stroke.thick,
    borderRadius: radius.sm,
    padding: space.md,
  },
  bannerOk: { borderLeftColor: color.semantic.success },
  bannerText: { ...type.bodySmall, color: color.text.primary },

  link: { paddingVertical: space.sm },
  linkText: { ...type.bodySmall, color: color.accent.cool, textDecorationLine: 'underline' },
});
