import { StyleSheet } from 'react-native';

import { color, radius, size, space, stroke, type } from '../../theme';

/**
 * Built on Mis sesiones, which is the same shape of screen: a list of things
 * that are yours, each one a card you can open. Somebody who reads their week
 * on one should not have to learn a second layout to read it on the other.
 */
export const inboxStyles = StyleSheet.create({
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

  /** Step 20: back arrow, the title, «Marcar todo» on the right. */
  header: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  headerBack: {
    alignItems: 'center',
    height: size.controlSm,
    justifyContent: 'center',
    marginLeft: -space.sm,
    width: size.controlSm,
  },
  title: { ...type.title, color: color.text.primary, flex: 1 },
  markAll: { justifyContent: 'center', minHeight: size.controlSm },
  markAllText: { ...type.bodySmall, color: color.accent.cool, fontWeight: '600' },

  /** The same chips as Grupos: white when on, outlined when off. */
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    alignItems: 'center',
    borderColor: color.border.strong,
    borderRadius: radius.full,
    borderWidth: stroke.hair,
    justifyContent: 'center',
    minHeight: size.controlSm,
    paddingHorizontal: space.lg,
  },
  chipOn: { backgroundColor: color.text.primary, borderColor: color.text.primary },
  chipText: { ...type.bodySmall, color: color.text.primary, fontWeight: '600' },
  chipTextOn: { color: color.text.inverse },

  sectionTitle: { ...type.heading, color: color.text.primary },
  overline: { ...type.label, color: color.text.tertiary, letterSpacing: 1 },

  group: { gap: space.sm },

  /** A row: icon circle, the sentence over the time, the unread dot. */
  card: {
    alignItems: 'flex-start',
    backgroundColor: color.bg.surface,
    borderRadius: radius.lg,
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
  },
  /** The inert card stacks its row over the «Marcar como leído» link. */
  cardColumn: {
    backgroundColor: color.bg.surface,
    borderRadius: radius.lg,
    gap: space.xs,
    padding: space.lg,
  },
  cardInner: { alignItems: 'flex-start', flexDirection: 'row', gap: space.md },
  /** Unread is lifted, not tinted: depth is luminance here as everywhere. */
  cardUnread: { backgroundColor: color.bg.raised },

  iconCircle: {
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: stroke.thick,
    height: size.controlSm,
    justifyContent: 'center',
    width: size.controlSm,
  },
  rowText: { flex: 1, gap: space.xs },
  cardText: { ...type.bodySmall, color: color.text.primary },
  cardTextRead: { color: color.text.secondary },
  cardWhen: { ...type.caption, color: color.text.tertiary },

  /**
   * Sun, as in the walkthrough. A dot is not a surface, so it does not read as
   * occupancy (ADR 0004) or as a button.
   */
  unreadDot: {
    backgroundColor: color.accent.primary,
    borderRadius: radius.full,
    height: 10,
    marginTop: space.xs,
    width: 10,
  },

  /** 36px tall so it does not look like a button; padded to 44 with hitSlop. */
  markRead: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    marginLeft: size.controlSm + space.md,
    minHeight: size.controlSm,
  },
  markReadText: { ...type.bodySmall, color: color.accent.cool, textDecorationLine: 'underline' },

  error: { ...type.bodySmall, color: color.semantic.dangerOnRaised },

  empty: { alignItems: 'center', gap: space.sm, padding: space.huge },
  emptyBody: { ...type.bodySmall, color: color.text.secondary, textAlign: 'center' },

  linkText: { ...type.bodySmall, color: color.accent.cool, textDecorationLine: 'underline' },
});

/**
 * The Descubrir header link.
 *
 * It lives here rather than in the Descubrir stylesheet because it is part of
 * the inbox — the count, the badge and the sentence a screen reader hears all
 * come from this feature, and the header only places it.
 */
export const unreadLinkStyles = StyleSheet.create({
  link: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
    justifyContent: 'center',
    minHeight: size.controlSm,
  },

  /**
   * `semantic.danger` is the notification badge colour by definition. Its text
   * is `text.inverse`: white on this red measures 3.3:1, the dark ground 5.1:1,
   * and a count nobody can read is a dot with extra steps.
   */
  badge: {
    alignItems: 'center',
    backgroundColor: color.semantic.danger,
    borderRadius: radius.full,
    justifyContent: 'center',
    minWidth: size.avatarSm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  badgeText: {
    ...type.dataSmall,
    color: color.text.inverse,
    // The token's tuple is readonly; StyleSheet wants a mutable array.
    fontVariant: [...type.dataSmall.fontVariant],
  },
});

/**
 * The push switch on /avisos. A surface, not a card: it is a setting about the
 * list below it, and a card would read as one more aviso.
 */
export const pushStyles = StyleSheet.create({
  panel: {
    borderColor: color.border.default,
    borderRadius: radius.lg,
    borderWidth: stroke.hair,
    gap: space.sm,
    padding: space.lg,
  },
  title: { ...type.heading, color: color.text.primary },
  body: { ...type.bodySmall, color: color.text.secondary },
  error: { ...type.bodySmall, color: color.semantic.dangerOnRaised },

  /** Off is the primary action; on is outlined, so turning it off never looks urgent. */
  button: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: color.accent.primary,
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: size.minTarget,
    paddingHorizontal: space.xl,
  },
  buttonOn: {
    backgroundColor: 'transparent',
    borderColor: color.border.strong,
    borderWidth: stroke.hair,
  },
  buttonText: { ...type.action, color: color.text.inverse },
  buttonTextOn: { color: color.text.primary },
});
