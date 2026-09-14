import { StyleSheet } from 'react-native';

import { color, radius, size, space, stroke, type } from '../../theme';

export const venueStyles = StyleSheet.create({
  /** Collapsed: one line that reads as an offer, not as a form. */
  toggle: { justifyContent: 'center', minHeight: size.minTarget },
  toggleText: { ...type.bodySmall, color: color.accent.cool, textDecorationLine: 'underline' },

  panel: {
    backgroundColor: color.bg.raised,
    borderColor: color.border.default,
    borderRadius: radius.md,
    borderWidth: stroke.hair,
    gap: space.md,
    padding: space.lg,
  },
  panelTitle: { ...type.heading, color: color.text.primary },

  /**
   * A venue is shared the moment it is saved. That is the one thing about this
   * form somebody could not guess, so it carries the Sun edge rather than
   * sitting in grey helper text at the bottom.
   */
  shared: {
    backgroundColor: color.bg.surface,
    borderLeftColor: color.accent.primary,
    borderLeftWidth: stroke.thick,
    borderRadius: radius.sm,
    padding: space.md,
  },
  sharedText: { ...type.bodySmall, color: color.text.secondary },

  field: { gap: space.sm },
  labelRow: { alignItems: 'baseline', flexDirection: 'row', gap: space.sm },
  label: { ...type.label, color: color.text.secondary },
  optional: { ...type.caption, color: color.text.tertiary },
  input: {
    ...type.body,
    backgroundColor: color.bg.sunken,
    borderColor: color.border.strong,
    borderRadius: radius.md,
    borderWidth: stroke.hair,
    color: color.text.primary,
    minHeight: size.control,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  inputError: { borderColor: color.border.error },
  hint: { ...type.caption, color: color.text.tertiary },
  error: { ...type.bodySmall, color: color.semantic.dangerOnRaised },

  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  ghost: {
    alignItems: 'center',
    borderColor: color.border.strong,
    borderRadius: radius.md,
    borderWidth: stroke.hair,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: size.control,
    paddingHorizontal: space.md,
  },
  ghostText: { ...type.action, color: color.text.primary },

  /** The parsed pair, shown back as numbers so it can be checked. */
  readback: {
    backgroundColor: color.bg.sunken,
    borderRadius: radius.sm,
    gap: space.xs,
    padding: space.md,
  },
  readbackValue: { ...type.body, color: color.text.primary },
  readbackLabel: { ...type.caption, color: color.text.tertiary },
  verify: { ...type.bodySmall, color: color.accent.cool, textDecorationLine: 'underline' },

  save: {
    alignItems: 'center',
    backgroundColor: color.accent.primary,
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: size.control,
    paddingHorizontal: space.lg,
  },
  saveDisabled: { opacity: 0.4 },
  saveText: { ...type.action, color: color.text.inverse },
  missing: { ...type.bodySmall, color: color.text.warm },

  banner: {
    backgroundColor: color.bg.surface,
    borderLeftColor: color.semantic.success,
    borderLeftWidth: stroke.thick,
    borderRadius: radius.sm,
    padding: space.md,
  },
  bannerText: { ...type.bodySmall, color: color.text.primary },
});
