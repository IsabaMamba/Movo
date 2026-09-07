import { StyleSheet } from 'react-native';

import { color, radius, size, space, stroke, type } from '../../theme';

/**
 * The organizer console is a desk tool, not a phone screen — rosters are
 * tables and close-out is deliberate work. It still has to survive a phone,
 * so rows wrap rather than scroll sideways.
 */
export const organizerStyles = StyleSheet.create({
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
  cardMeta: { ...type.bodySmall, color: color.text.secondary },

  /** State reads as a chip, not only as a word, so the list scans. */
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  badgeText: { ...type.caption },
  badgeDraft: { backgroundColor: color.bg.raised },
  badgeDraftText: { color: color.text.tertiary },
  badgeLive: { backgroundColor: color.accent.deep },
  badgeLiveText: { color: color.text.primary },
  badgeDone: { backgroundColor: color.bg.raised },
  badgeDoneText: { color: color.semantic.success },

  /** Counts are the point of this screen, so they get tabular figures. */
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xl },
  count: { gap: space.xs },
  countValue: {
    ...type.data,
    // The token's fontVariant is a readonly tuple; RN wants it mutable.
    fontVariant: [...type.data.fontVariant],
    color: color.text.primary,
  },
  countLabel: { ...type.caption, color: color.text.tertiary },

  row: {
    alignItems: 'center',
    borderBottomColor: color.border.default,
    borderBottomWidth: stroke.hair,
    flexDirection: 'row',
    gap: space.md,
    paddingVertical: space.md,
  },
  rowName: { ...type.body, color: color.text.primary, flex: 1, minWidth: 120 },
  rowState: { ...type.caption, color: color.text.tertiary },

  checkButton: {
    alignItems: 'center',
    borderColor: color.border.strong,
    borderRadius: radius.sm,
    borderWidth: stroke.hair,
    justifyContent: 'center',
    minHeight: size.controlSm,
    paddingHorizontal: space.lg,
  },
  checkButtonDone: { backgroundColor: color.bg.raised, borderColor: color.semantic.success },
  checkText: { ...type.action, color: color.text.primary },
  checkTextDone: { color: color.semantic.success },

  close: {
    alignItems: 'center',
    borderColor: color.semantic.danger,
    borderRadius: radius.md,
    borderWidth: stroke.hair,
    justifyContent: 'center',
    minHeight: size.control,
  },
  closeText: { ...type.action, color: color.semantic.dangerOnRaised },

  /**
   * Close-out is irreversible and turns absent people into a permanent
   * no_show, so the confirmation states the consequence as a number rather
   * than asking "are you sure".
   */
  confirm: {
    backgroundColor: color.bg.surface,
    borderLeftColor: color.semantic.danger,
    borderLeftWidth: stroke.thick,
    borderRadius: radius.md,
    gap: space.md,
    padding: space.lg,
  },
  confirmText: { ...type.body, color: color.text.primary },
  confirmRow: { flexDirection: 'row', gap: space.md },

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
