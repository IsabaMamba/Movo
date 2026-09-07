import { StyleSheet } from 'react-native';

import { color, radius, size, space, stroke, type } from '../../theme';

export const soloStyles = StyleSheet.create({
  screen: { backgroundColor: color.bg.base, flex: 1 },
  content: {
    gap: space.xl,
    marginHorizontal: 'auto',
    maxWidth: 640,
    padding: space.xl,
    paddingBottom: space.huge,
    paddingTop: space.xxxl,
    width: '100%',
  },

  back: { justifyContent: 'center', minHeight: size.minTarget },
  backText: { ...type.bodySmall, color: color.accent.cool },

  title: { ...type.display, color: color.text.primary },
  subtitle: { ...type.body, color: color.text.secondary },
  sectionTitle: { ...type.heading, color: color.text.primary },
  hint: { ...type.caption, color: color.text.tertiary },
  label: { ...type.label, color: color.text.secondary },

  field: { gap: space.sm },
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

  /**
   * "Avisar a alguien" is the one block that must not read as secondary. Going
   * out alone before dawn is the highest-risk thing this product suggests, so
   * it carries the Sun edge that the meeting point carries on a session.
   */
  tell: {
    backgroundColor: color.bg.surface,
    borderLeftColor: color.accent.primary,
    borderLeftWidth: stroke.thick,
    borderRadius: radius.md,
    gap: space.md,
    padding: space.lg,
  },
  tellTitle: { ...type.heading, color: color.text.primary },
  tellWhy: { ...type.bodySmall, color: color.text.secondary },
  message: {
    ...type.bodySmall,
    backgroundColor: color.bg.sunken,
    borderRadius: radius.sm,
    color: color.text.primary,
    padding: space.md,
  },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },

  primary: {
    alignItems: 'center',
    backgroundColor: color.accent.primary,
    borderRadius: radius.md,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: size.control,
    paddingHorizontal: space.lg,
  },
  primaryText: { ...type.action, color: color.text.inverse },
  secondary: {
    alignItems: 'center',
    borderColor: color.border.strong,
    borderRadius: radius.md,
    borderWidth: stroke.hair,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: size.control,
    paddingHorizontal: space.lg,
  },
  secondaryText: { ...type.action, color: color.text.primary },

  summary: {
    backgroundColor: color.bg.surface,
    borderRadius: radius.lg,
    gap: space.md,
    padding: space.lg,
  },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xl },
  summaryItem: { gap: space.xs },
  summaryValue: { ...type.title, color: color.text.primary },
  summaryLabel: { ...type.caption, color: color.text.tertiary },

  /** Absent capabilities are stated, never faked. */
  pending: {
    borderColor: color.border.default,
    borderRadius: radius.md,
    borderStyle: 'dashed',
    borderWidth: stroke.hair,
    gap: space.xs,
    padding: space.lg,
  },
  pendingTitle: { ...type.label, color: color.text.tertiary },
  pendingBody: { ...type.bodySmall, color: color.text.tertiary },

  banner: {
    backgroundColor: color.bg.surface,
    borderLeftColor: color.semantic.success,
    borderLeftWidth: stroke.thick,
    borderRadius: radius.sm,
    padding: space.md,
  },
  bannerText: { ...type.bodySmall, color: color.text.primary },
});
