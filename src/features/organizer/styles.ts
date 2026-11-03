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

  /** Set apart by a rule, so it is never read as part of close-out. */
  cancelZone: {
    borderTopColor: color.border.default,
    borderTopWidth: stroke.hair,
    paddingTop: space.lg,
  },
  cancelLinkText: {
    ...type.bodySmall,
    color: color.semantic.dangerOnRaised,
    textDecorationLine: 'underline',
  },

  cancelledBanner: {
    backgroundColor: color.bg.surface,
    borderLeftColor: color.semantic.danger,
    borderLeftWidth: stroke.thick,
    borderRadius: radius.sm,
    gap: space.xs,
    padding: space.md,
  },
  cancelledTitle: { ...type.heading, color: color.text.primary },
  cancelledBody: { ...type.bodySmall, color: color.text.secondary },
});

/** The bars of «Cómo va», at their tallest. */
export const SERIES_BAR_MAX = 64;

/**
 * Una serie, step 27 of the 2 November walkthrough: what the club looks like
 * week to week, before the form that changes it.
 */
export const seriesStyles = StyleSheet.create({
  topBar: { alignItems: 'center', flexDirection: 'row', minHeight: size.minTarget },
  topBack: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: space.xs,
    minHeight: size.minTarget,
  },
  topBackText: { ...type.bodySmall, color: color.text.primary, fontWeight: '600' },
  topTitle: { ...type.action, color: color.text.primary },
  topSpacer: { flex: 1 },

  eyebrowRow: { alignItems: 'center', flexDirection: 'row', gap: space.xs },
  eyebrow: { ...type.label, color: color.accent.cool, letterSpacing: 1 },
  title: { ...type.title, color: color.text.primary },

  stats: { flexDirection: 'row', gap: space.sm },
  stat: {
    backgroundColor: color.bg.surface,
    borderRadius: radius.md,
    flex: 1,
    gap: space.xs,
    padding: space.md,
  },
  statValue: { ...type.title, color: color.text.primary },
  statGood: { color: color.semantic.success },
  statLabel: { ...type.caption, color: color.text.secondary },

  card: {
    backgroundColor: color.bg.surface,
    borderColor: color.border.default,
    borderRadius: radius.lg,
    borderWidth: stroke.hair,
    gap: space.md,
    padding: space.lg,
  },
  cardHead: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between' },
  overline: { ...type.label, color: color.text.tertiary, letterSpacing: 1 },
  cardHint: { ...type.caption, color: color.text.tertiary },

  bars: { flexDirection: 'row', gap: space.sm },
  barCol: { alignItems: 'center', flex: 1, gap: space.xs },
  barArea: { height: SERIES_BAR_MAX, justifyContent: 'flex-end', width: '100%' },
  /** Success, like «Llegó»: the bars count arrivals. Older weeks recede. */
  bar: {
    backgroundColor: color.semantic.success,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    opacity: 0.55,
    width: '100%',
  },
  barLast: { opacity: 1 },
  barValue: { ...type.caption, color: color.text.secondary },
  barDate: { ...type.caption, color: color.text.tertiary },

  linkRow: {
    alignItems: 'center',
    backgroundColor: color.bg.surface,
    borderColor: color.border.default,
    borderRadius: radius.lg,
    borderWidth: stroke.hair,
    flexDirection: 'row',
    gap: space.md,
    minHeight: size.control + 8,
    paddingHorizontal: space.lg,
  },
  linkText: { flex: 1 },
  linkTitle: { ...type.bodySmall, color: color.text.primary, fontWeight: '700' },
  linkSub: { ...type.caption, color: color.text.secondary },

  dates: { gap: 0 },
  dateRow: {
    alignItems: 'center',
    borderBottomColor: color.border.default,
    borderBottomWidth: stroke.hair,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: size.minTarget + 4,
  },
  dateDay: { ...type.bodySmall, color: color.text.primary },
  dateFill: { ...type.caption, color: color.text.secondary },
  dateFillStrong: { color: color.text.primary, fontWeight: '700' },

  actions: { flexDirection: 'row', gap: space.md },
  action: {
    alignItems: 'center',
    borderColor: color.border.strong,
    borderRadius: radius.full,
    borderWidth: stroke.hair,
    flex: 1,
    flexDirection: 'row',
    gap: space.sm,
    justifyContent: 'center',
    minHeight: size.control,
    paddingHorizontal: space.md,
  },
  actionOn: { backgroundColor: color.bg.raised },
  actionText: { ...type.action, color: color.text.primary },
});
