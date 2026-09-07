import { StyleSheet } from 'react-native';

import { color, radius, size, space, stroke, type } from '../../theme';

export const gruposStyles = StyleSheet.create({
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
  hint: { ...type.caption, color: color.text.tertiary },

  card: {
    backgroundColor: color.bg.surface,
    borderRadius: radius.lg,
    gap: space.xs,
    padding: space.lg,
  },
  cardTitle: { ...type.title, color: color.text.primary },
  cardSlug: { ...type.caption, color: color.text.tertiary },
  cardBody: { ...type.bodySmall, color: color.text.secondary },

  badge: {
    alignSelf: 'flex-start',
    backgroundColor: color.bg.raised,
    borderRadius: radius.full,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  badgeText: { ...type.caption, color: color.text.tertiary },

  field: { gap: space.sm },
  label: { ...type.label, color: color.text.secondary },
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

  primary: {
    alignItems: 'center',
    backgroundColor: color.accent.primary,
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: size.control,
  },
  primaryDisabled: { opacity: 0.4 },
  primaryText: { ...type.action, color: color.text.inverse },
  secondary: {
    alignItems: 'center',
    borderColor: color.border.strong,
    borderRadius: radius.md,
    borderWidth: stroke.hair,
    justifyContent: 'center',
    minHeight: size.control,
  },
  secondaryText: { ...type.action, color: color.text.primary },

  row: {
    alignItems: 'center',
    borderBottomColor: color.border.default,
    borderBottomWidth: stroke.hair,
    flexDirection: 'row',
    gap: space.md,
    paddingVertical: space.md,
  },
  rowName: { ...type.body, color: color.text.primary, flex: 1 },
  rowRole: { ...type.caption, color: color.text.tertiary },
  rowRoleOwner: { color: color.text.warm },

  rules: {
    backgroundColor: color.bg.surface,
    borderLeftColor: color.accent.cool,
    borderLeftWidth: stroke.thick,
    borderRadius: radius.md,
    gap: space.xs,
    padding: space.lg,
  },
  rulesLabel: { ...type.label, color: color.accent.cool },
  rulesText: { ...type.body, color: color.text.primary },

  banner: {
    backgroundColor: color.bg.surface,
    borderLeftColor: color.semantic.success,
    borderLeftWidth: stroke.thick,
    borderRadius: radius.sm,
    padding: space.md,
  },
  bannerText: { ...type.bodySmall, color: color.text.primary },
  error: { ...type.bodySmall, color: color.semantic.dangerOnRaised },

  empty: { alignItems: 'center', gap: space.sm, padding: space.huge },
  emptyBody: { ...type.bodySmall, color: color.text.secondary, textAlign: 'center' },
  linkText: { ...type.bodySmall, color: color.accent.cool, textDecorationLine: 'underline' },
});
