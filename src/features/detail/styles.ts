import { StyleSheet } from 'react-native';

import { color, radius, size, space, stroke, type } from '../../theme';

export const detailStyles = StyleSheet.create({
  screen: { backgroundColor: color.bg.base, flex: 1 },
  content: { gap: space.xl, padding: space.xl, paddingBottom: space.huge, paddingTop: space.xxxl },

  back: { minHeight: size.minTarget, justifyContent: 'center' },
  backText: { ...type.bodySmall, color: color.accent.cool },

  eyebrow: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  eyebrowText: { ...type.label, color: color.text.tertiary },
  seriesTag: {
    backgroundColor: color.bg.raised,
    borderRadius: radius.full,
    color: color.text.warm,
    overflow: 'hidden',
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    ...type.caption,
  },
  title: { ...type.display, color: color.text.primary },

  /**
   * Occupancy. The bar and its number are the same variable, and heat is only
   * allowed here because it encodes density — ADR 0004.
   */
  occupancy: { gap: space.sm },
  occupancyTop: { alignItems: 'baseline', flexDirection: 'row', gap: space.sm },
  occupancyCount: { ...type.title, color: color.text.primary },
  occupancyWord: { ...type.bodySmall, color: color.text.secondary },
  bar: {
    backgroundColor: color.bg.sunken,
    borderRadius: radius.full,
    height: 8,
    overflow: 'hidden',
  },
  barFill: { borderRadius: radius.full, height: 8 },
  barScale: { flexDirection: 'row', justifyContent: 'space-between' },
  scaleLabel: { ...type.caption, color: color.text.tertiary },

  organizer: { alignItems: 'center', flexDirection: 'row', gap: space.md },
  avatar: {
    alignItems: 'center',
    backgroundColor: color.bg.raised,
    borderRadius: radius.full,
    height: size.avatarMd,
    justifyContent: 'center',
    width: size.avatarMd,
  },
  avatarText: { ...type.label, color: color.text.secondary },
  organizerName: { ...type.heading, color: color.text.primary },
  organizerMeta: { ...type.caption, color: color.text.tertiary },

  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  fact: { gap: space.xs, minWidth: 92 },
  factLabel: { ...type.caption, color: color.text.tertiary },
  factValue: { ...type.heading, color: color.text.primary },

  /**
   * The meeting point is the only datum whose absence makes somebody not turn
   * up after saying yes, so it is lifted out of the fact grid and given the Sun
   * edge rather than buried among them.
   */
  meeting: {
    backgroundColor: color.bg.surface,
    borderLeftColor: color.accent.primary,
    borderLeftWidth: stroke.thick,
    borderRadius: radius.md,
    gap: space.xs,
    padding: space.lg,
  },
  meetingLabel: { ...type.label, color: color.text.warm },
  meetingValue: { ...type.body, color: color.text.primary },
  meetingNote: { ...type.bodySmall, color: color.text.secondary },

  section: { gap: space.sm },
  sectionTitle: { ...type.heading, color: color.text.primary },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tag: {
    backgroundColor: color.bg.raised,
    borderRadius: radius.full,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  tagText: { ...type.caption, color: color.text.secondary },

  roster: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  rosterName: { ...type.caption, color: color.text.secondary },
  privacyNote: { ...type.caption, color: color.text.tertiary },

  action: {
    alignItems: 'center',
    backgroundColor: color.accent.primary,
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: size.control,
  },
  actionSecondary: {
    backgroundColor: 'transparent',
    borderColor: color.border.strong,
    borderWidth: stroke.hair,
  },
  actionDisabled: { opacity: 0.4 },
  actionText: { ...type.action, color: color.text.inverse },
  actionTextSecondary: { color: color.text.primary },
  actionNote: { ...type.caption, color: color.text.tertiary, textAlign: 'center' },

  status: {
    backgroundColor: color.bg.surface,
    borderLeftColor: color.semantic.success,
    borderLeftWidth: stroke.thick,
    borderRadius: radius.sm,
    padding: space.md,
  },
  statusWait: { borderLeftColor: color.accent.cool },
  statusText: { ...type.bodySmall, color: color.text.primary },

  error: { ...type.bodySmall, color: color.semantic.dangerOnRaised },

  /** Reporting lives on this screen, not in settings — see the design notes. */
  report: { minHeight: size.minTarget, justifyContent: 'center' },
  reportText: { ...type.caption, color: color.text.tertiary, textDecorationLine: 'underline' },
});
