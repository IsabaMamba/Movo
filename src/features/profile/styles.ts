import { StyleSheet } from 'react-native';

import { color, radius, size, space, stroke, type } from '../../theme';

/**
 * Perfil v2 (16 October). The card is shared by the Perfil tab and the
 * public-profile preview, so the person sees the same object in both places.
 */
export const profileStyles = StyleSheet.create({
  card: { alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  avatarWrap: { marginBottom: space.xs },
  /** Step 22: Sun at the bottom-right of the ring, the way to the photo. */
  cameraBadge: {
    alignItems: 'center',
    backgroundColor: color.accent.primary,
    borderColor: color.bg.base,
    borderRadius: radius.full,
    borderWidth: stroke.thick,
    bottom: -2,
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    right: -2,
    width: 36,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: color.accent.deep,
    borderColor: color.accent.primary,
    borderRadius: 48,
    borderWidth: stroke.thick,
    height: 96,
    justifyContent: 'center',
    width: 96,
  },
  avatarText: { ...type.display, color: color.text.primary },
  name: { ...type.title, color: color.text.primary, textAlign: 'center' },
  zone: { ...type.bodySmall, color: color.text.secondary },
  bio: { ...type.body, color: color.text.secondary, maxWidth: 420, textAlign: 'center' },
  since: { ...type.caption, color: color.text.tertiary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  chip: {
    alignItems: 'center',
    backgroundColor: color.bg.surface,
    borderColor: color.border.strong,
    borderRadius: radius.full,
    borderWidth: stroke.hair,
    flexDirection: 'row',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  chipDot: { borderRadius: radius.full, height: 8, width: 8 },
  chipText: { ...type.caption, color: color.text.primary },

  actions: { flexDirection: 'row', gap: space.md },
  action: {
    alignItems: 'center',
    borderColor: color.border.strong,
    borderRadius: radius.full,
    borderWidth: stroke.hair,
    flexBasis: 0,
    flexDirection: 'row',
    flexGrow: 1,
    gap: space.sm,
    justifyContent: 'center',
    minHeight: size.control,
    minWidth: 0,
    paddingHorizontal: space.md,
  },
  actionText: { ...type.action, color: color.text.primary, textAlign: 'center' },

  groupLabel: { ...type.label, color: color.text.tertiary, letterSpacing: 1 },
  group: {
    backgroundColor: color.bg.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    borderBottomColor: color.border.default,
    borderBottomWidth: stroke.hair,
    flexDirection: 'row',
    gap: space.md,
    minHeight: size.control + 8,
    paddingHorizontal: space.lg,
  },
  rowLast: { borderBottomWidth: 0 },
  rowIcon: { alignItems: 'center', width: 22 },
  rowText: { ...type.body, color: color.text.primary, flex: 1 },
  rowValue: { ...type.bodySmall, color: color.text.tertiary },
  rowTextQuiet: { color: color.text.secondary },
  headerRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  rowChevron: { ...type.body, color: color.text.tertiary },

  notice: {
    backgroundColor: color.bg.surface,
    borderColor: color.accent.cool,
    borderRadius: radius.md,
    borderWidth: stroke.hair,
    padding: space.md,
  },
  noticeText: { ...type.bodySmall, color: color.text.primary },
  hidden: {
    borderColor: color.border.default,
    borderRadius: radius.md,
    borderStyle: 'dashed',
    borderWidth: stroke.hair,
    padding: space.md,
  },
  hiddenText: { ...type.bodySmall, color: color.text.secondary },
});
