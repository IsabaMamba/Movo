import { StyleSheet } from 'react-native';

import { color, radius, size, space, stroke, type } from '../../theme';

/** The sport picker of Sesión v2 · 1: chips with the family dot, a search, the families. */
export const sportPickerStyles = StyleSheet.create({
  root: { gap: space.md },

  search: {
    alignItems: 'center',
    backgroundColor: color.bg.surface,
    borderColor: color.border.strong,
    borderRadius: radius.md,
    borderWidth: stroke.hair,
    flexDirection: 'row',
    gap: space.sm,
    minHeight: size.control,
    paddingHorizontal: space.md,
  },
  searchInput: { ...type.body, color: color.text.primary, flex: 1, minHeight: size.control },

  group: { gap: space.sm },
  groupLabel: { ...type.label, color: color.text.secondary },
  familyLabel: { ...type.label, letterSpacing: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },

  chip: {
    alignItems: 'center',
    borderColor: color.border.strong,
    borderRadius: radius.full,
    borderWidth: stroke.hair,
    flexDirection: 'row',
    gap: space.xs,
    minHeight: size.controlSm,
    paddingHorizontal: space.md,
  },
  /** Selected: Sun outline, as on the board, never a filled Sun surface. */
  chipOn: { backgroundColor: color.bg.raised, borderColor: color.accent.primary },
  chipText: { ...type.bodySmall, color: color.text.secondary },
  chipTextOn: { color: color.text.primary, fontWeight: '700' },
  dot: { borderRadius: radius.full, height: 8, width: 8 },

  more: { alignItems: 'center', flexDirection: 'row', gap: space.xs, minHeight: size.minTarget },
  moreText: { ...type.bodySmall, color: color.accent.cool, fontWeight: '600' },
  empty: { ...type.bodySmall, color: color.text.tertiary },
});
