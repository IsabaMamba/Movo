import { StyleSheet } from 'react-native';

import { color, radius, size, space, stroke, type } from '../../theme';

/**
 * The report queue is a desk tool, like the organizer console it borrows its
 * proportions from. It is read in one column at whatever width is available,
 * because the work is reading a paragraph somebody wrote while upset and then
 * deciding — not scanning a table.
 *
 * Nothing here is red by default. A queue that shouts at every row stops
 * carrying any signal; `semantic.warning` marks the one control that writes a
 * judgement about a person, and that is the only colour that means alarm.
 */
export const staffStyles = StyleSheet.create({
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
  linkText: { ...type.bodySmall, color: color.accent.cool, textDecorationLine: 'underline' },

  title: { ...type.display, color: color.text.primary },
  subtitle: { ...type.bodySmall, color: color.text.secondary },
  sectionTitle: { ...type.heading, color: color.text.primary },
  hint: { ...type.caption, color: color.text.tertiary },

  /** Which half of the queue. Two chips, same geometry as Descubrir's filters. */
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    alignItems: 'center',
    borderColor: color.border.strong,
    borderRadius: radius.full,
    borderWidth: stroke.hair,
    justifyContent: 'center',
    minHeight: size.controlSm,
    paddingHorizontal: space.lg,
  },
  chipOn: { backgroundColor: color.alpha.aqua10, borderColor: color.border.focus },
  chipText: { ...type.action, color: color.text.secondary },
  chipTextOn: { color: color.accent.cool },

  list: { gap: space.md },
  card: {
    backgroundColor: color.bg.surface,
    borderRadius: radius.lg,
    gap: space.sm,
    padding: space.lg,
  },
  cardTop: { alignItems: 'center', flexDirection: 'row', gap: space.md },

  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  badgeText: { ...type.caption },
  badgeOpen: { backgroundColor: color.bg.raised },
  badgeOpenText: { color: color.text.secondary },
  badgeReviewing: { backgroundColor: color.accent.deep },
  badgeReviewingText: { color: color.text.primary },
  badgeDone: { backgroundColor: color.bg.raised },
  badgeDoneText: { color: color.semantic.success },

  /** The age of a report is the reason to open it, so it sits beside the state. */
  waiting: {
    ...type.dataSmall,
    // The token's fontVariant is a readonly tuple; RN wants it mutable.
    fontVariant: [...type.dataSmall.fontVariant],
    color: color.text.primary,
    flex: 1,
    textAlign: 'right',
  },

  eyebrow: { ...type.label, color: color.text.tertiary },
  reason: { ...type.title, color: color.text.primary },
  meta: { ...type.bodySmall, color: color.text.secondary },
  /** What the person actually wrote. Never quieter than the metadata above it. */
  details: { ...type.body, color: color.text.primary },
  noDetails: { ...type.bodySmall, color: color.text.tertiary },

  /**
   * The reported thing, inset inside the report. Read as a sibling of the
   * reason it looks like a second report; the rule on the left says it is
   * evidence attached to this one.
   */
  subject: {
    borderLeftColor: color.border.default,
    borderLeftWidth: stroke.thick,
    gap: space.xs,
    paddingLeft: space.md,
  },
  subjectTitle: { ...type.heading, color: color.text.primary },
  subjectMeta: { ...type.bodySmall, color: color.text.secondary },
  subjectMissing: { ...type.bodySmall, color: color.text.tertiary },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingTop: space.xs },
  action: {
    alignItems: 'center',
    borderColor: color.border.strong,
    borderRadius: radius.sm,
    borderWidth: stroke.hair,
    justifyContent: 'center',
    minHeight: size.controlSm,
    paddingHorizontal: space.lg,
  },
  /**
   * Outline, not a fill. A filled Sun surface means "primary action" — the
   * button that writes a judgement about somebody is not the happy path.
   */
  actionGrave: { borderColor: color.semantic.warning },
  actionText: { ...type.action, color: color.text.primary },
  actionGraveText: { color: color.semantic.warning },
  actionDisabled: { borderColor: color.border.default },
  actionDisabledText: { color: color.text.disabledOnly },

  confirm: {
    backgroundColor: color.bg.raised,
    borderLeftColor: color.semantic.warning,
    borderLeftWidth: stroke.thick,
    borderRadius: radius.md,
    gap: space.md,
    marginTop: space.sm,
    padding: space.lg,
  },
  confirmText: { ...type.body, color: color.text.primary },
  confirmRow: { flexDirection: 'row', gap: space.md },
  confirmButton: {
    alignItems: 'center',
    borderColor: color.semantic.warning,
    borderRadius: radius.md,
    borderWidth: stroke.hair,
    flex: 1,
    justifyContent: 'center',
    minHeight: size.control,
  },
  confirmButtonText: { ...type.action, color: color.semantic.warning },
  backButton: {
    alignItems: 'center',
    borderColor: color.border.strong,
    borderRadius: radius.md,
    borderWidth: stroke.hair,
    flex: 1,
    justifyContent: 'center',
    minHeight: size.control,
  },

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
  counter: { ...type.caption, color: color.text.tertiary, textAlign: 'right' },

  /** One banner, two tones: the result of a decision, or a failure to load. */
  banner: {
    backgroundColor: color.bg.surface,
    borderLeftColor: color.semantic.success,
    borderLeftWidth: stroke.thick,
    borderRadius: radius.sm,
    padding: space.md,
  },
  bannerBad: { borderLeftColor: color.semantic.danger },
  bannerText: { ...type.bodySmall, color: color.text.primary },
  bannerTextBad: { color: color.semantic.dangerOnRaised },

  /** Resolved rows keep the audit trail visible: who decided, when, and what. */
  resolution: {
    borderTopColor: color.border.default,
    borderTopWidth: stroke.hair,
    gap: space.xs,
    paddingTop: space.md,
  },

  empty: { alignItems: 'center', gap: space.sm, padding: space.huge },
  emptyBody: { ...type.bodySmall, color: color.text.secondary, textAlign: 'center' },
});
