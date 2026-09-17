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
  backText: { ...type.bodySmall, color: color.accent.cool },

  title: { ...type.display, color: color.text.primary },
  subtitle: { ...type.bodySmall, color: color.text.secondary },
  sectionTitle: { ...type.heading, color: color.text.primary },

  group: { gap: space.md },

  /**
   * The left border is on every card, not only the unread ones, and matches
   * the ground when the card is read. Adding the border on unread alone would
   * shift the text of half the list sideways by two pixels as it was read.
   */
  card: {
    backgroundColor: color.bg.surface,
    borderLeftColor: color.bg.surface,
    borderLeftWidth: stroke.thick,
    borderRadius: radius.lg,
    gap: space.xs,
    padding: space.lg,
  },
  /** Unread is lifted, not tinted: depth is luminance here as everywhere. */
  cardUnread: { backgroundColor: color.bg.raised, borderLeftColor: color.accent.cool },

  cardText: { ...type.body, color: color.text.primary },
  cardWhen: { ...type.caption, color: color.text.tertiary },

  /**
   * Cool, never warm. Warmth encodes occupancy across the whole product
   * (ADR 0004), and an unread aviso says nothing about how full anything is.
   */
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: color.accent.deep,
    borderRadius: radius.full,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  badgeText: { ...type.caption, color: color.text.primary },

  /** 36px tall so it does not look like a button; padded to 44 with hitSlop. */
  markRead: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: size.controlSm },
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
