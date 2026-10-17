import { StyleSheet } from 'react-native';

import { color, radius, size, space, stroke, type } from '../../theme';

/**
 * Perfil v2 (16 October). The card is shared by the Perfil tab and the
 * public-profile preview, so the person sees the same object in both places.
 */
export const profileStyles = StyleSheet.create({
  card: { alignItems: 'center', gap: space.sm, paddingVertical: space.md },
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
  name: { ...type.display, color: color.text.primary, textAlign: 'center' },
  zone: { ...type.bodySmall, color: color.text.secondary },
  bio: { ...type.body, color: color.text.secondary, maxWidth: 420, textAlign: 'center' },
  since: { ...type.caption, color: color.text.tertiary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  chip: {
    borderColor: color.border.strong,
    borderRadius: radius.full,
    borderWidth: stroke.hair,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  chipText: { ...type.caption, color: color.text.primary },

  actions: { flexDirection: 'row', gap: space.md },
  action: {
    alignItems: 'center',
    borderColor: color.border.strong,
    borderRadius: radius.full,
    borderWidth: stroke.hair,
    flexBasis: 0,
    flexGrow: 1,
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
  rowText: { ...type.body, color: color.text.primary, flex: 1 },
  rowValue: { ...type.bodySmall, color: color.text.tertiary },
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
