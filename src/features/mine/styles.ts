import { StyleSheet } from 'react-native';

import { color, radius, size, space, stroke, type } from '../../theme';

/**
 * Mis sesiones v4 (2 November walkthrough): title with the bell, «Próximas /
 * Pasadas», the week strip, «Tu próxima», then the days.
 */
export const mineStyles = StyleSheet.create({
  screen: { backgroundColor: color.bg.base, flex: 1 },
  content: {
    gap: space.lg,
    marginHorizontal: 'auto',
    maxWidth: 720,
    padding: space.xl,
    paddingBottom: space.huge,
    paddingTop: space.xxxl,
    width: '100%',
  },

  back: { justifyContent: 'center', minHeight: size.minTarget },
  backText: { ...type.bodySmall, color: color.accent.cool },

  headerRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headerIcons: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  title: { ...type.display, color: color.text.primary },
  subtitle: { ...type.bodySmall, color: color.text.secondary },
  sectionTitle: { ...type.heading, color: color.text.primary, textAlign: 'center' },

  segment: {
    backgroundColor: color.bg.surface,
    borderColor: color.border.default,
    borderRadius: radius.full,
    borderWidth: stroke.hair,
    flexDirection: 'row',
    padding: 4,
  },
  segmentItem: {
    alignItems: 'center',
    borderRadius: radius.full,
    flex: 1,
    justifyContent: 'center',
    minHeight: size.controlSm,
  },
  segmentItemOn: { backgroundColor: color.accent.primary },
  segmentText: { ...type.action, color: color.text.secondary },
  segmentTextOn: { color: color.text.inverse },

  weekHead: { flexDirection: 'row', justifyContent: 'space-between' },
  weekTitle: { ...type.label, color: color.text.primary },
  weekHint: { ...type.caption, color: color.text.tertiary },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDay: { alignItems: 'center', gap: 4, minWidth: 40 },
  weekLetter: { ...type.caption, color: color.text.tertiary },
  weekNumber: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  weekNumberToday: { backgroundColor: color.accent.primary },
  weekNumberOn: { borderColor: color.accent.primary, borderWidth: 2 },
  weekNumberText: { ...type.heading, color: color.text.secondary, fontVariant: ['tabular-nums'] },
  weekNumberTextOn: { color: color.text.primary },
  weekDot: { borderRadius: 3, height: 5, width: 5 },
  weekDotOn: { backgroundColor: color.semantic.danger },

  group: { gap: space.sm },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: space.sm },
  dayLabel: { ...type.label, color: color.text.secondary, letterSpacing: 1 },
  dayRelative: { ...type.caption, color: color.text.tertiary },

  item: {
    alignItems: 'flex-start',
    backgroundColor: color.bg.surface,
    borderColor: color.border.default,
    borderRadius: radius.lg,
    borderWidth: stroke.hair,
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
  },
  itemBar: { alignSelf: 'stretch', borderRadius: 2, width: 3 },
  itemTime: { ...type.heading, color: color.text.primary, fontVariant: ['tabular-nums'] },
  itemBody: { flex: 1, gap: 3, minWidth: 0 },
  itemTitle: { ...type.bodySmall, color: color.text.primary, fontWeight: '600' },
  itemMeta: { ...type.caption, color: color.text.tertiary },

  card: {
    backgroundColor: color.bg.surface,
    borderRadius: radius.lg,
    gap: space.xs,
    padding: space.lg,
  },
  cardTitle: { ...type.title, color: color.text.primary },
  cardMeta: { ...type.bodySmall, color: color.text.secondary },
  /** Helper text sits at the readable floor, never at `disabledOnly`. */
  cardNote: { ...type.caption, color: color.text.tertiary, paddingTop: space.xs },

  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    marginTop: 2,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  badgeText: { ...type.caption, fontWeight: '600' },

  /**
   * Warmth is reserved for occupancy everywhere else in Movo (ADR 0004), so
   * none of these states borrow it. They are states of a person, not of a
   * session filling up.
   */
  badgeGoing: { backgroundColor: color.accent.deep },
  badgeGoingText: { color: color.text.primary },
  badgeWait: { backgroundColor: color.bg.raised },
  badgeWaitText: { color: color.accent.cool },
  badgeDone: { backgroundColor: 'rgba(76,201,147,0.16)' },
  badgeDoneText: { color: color.semantic.success },
  badgeMiss: { backgroundColor: color.bg.raised },
  badgeMissText: { color: color.semantic.dangerOnRaised },
  badgeOpen: { backgroundColor: color.bg.raised },
  badgeOpenText: { color: color.text.tertiary },

  error: { ...type.bodySmall, color: color.semantic.dangerOnRaised },

  empty: {
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.xxl,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: color.bg.surface,
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  emptyBody: { ...type.bodySmall, color: color.text.secondary, textAlign: 'center' },
  emptyButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: color.accent.primary,
    borderRadius: radius.full,
    justifyContent: 'center',
    minHeight: size.control,
  },
  emptyButtonText: { ...type.action, color: color.text.inverse },
  pastNote: { ...type.caption, color: color.text.tertiary },
  months: { gap: space.xs },

  linkText: { ...type.bodySmall, color: color.accent.cool, textDecorationLine: 'underline' },
});
