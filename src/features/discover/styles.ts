import { StyleSheet } from 'react-native';

import { color, radius, size, space, stroke, type } from '../../theme';

export const discoverStyles = StyleSheet.create({
  screen: { backgroundColor: color.bg.base, flex: 1, paddingTop: space.huge },

  header: { gap: space.xs, paddingHorizontal: space.xl },
  title: { ...type.display, color: color.text.primary },
  account: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  accountText: { ...type.caption, color: color.text.tertiary },
  linkText: { ...type.bodySmall, color: color.accent.cool, textDecorationLine: 'underline' },

  filters: { flexGrow: 0, marginTop: space.lg },
  filterRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.xl },
  chip: {
    alignItems: 'center',
    borderColor: color.border.default,
    borderRadius: radius.full,
    borderWidth: stroke.hair,
    justifyContent: 'center',
    minHeight: size.controlSm,
    paddingHorizontal: space.lg,
  },
  chipOn: { backgroundColor: color.accent.deep, borderColor: color.accent.cool },
  chipText: { ...type.action, color: color.text.secondary },
  chipTextOn: { color: color.text.primary },

  meta: { ...type.caption, color: color.text.tertiary, paddingBottom: space.sm },

  /**
   * The heat scale. ADR 0004: any surface that uses heat has to show the scale
   * that decodes it, otherwise the colour is decoration pretending to be data.
   */
  legend: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
  },
  legendLabel: { ...type.caption, color: color.text.tertiary },
  legendRamp: { borderRadius: radius.sm, flexDirection: 'row', overflow: 'hidden' },
  legendStop: { height: 6, width: 14 },

  list: { paddingBottom: space.huge, paddingHorizontal: space.xl, paddingTop: space.lg },
  card: {
    backgroundColor: color.bg.surface,
    borderRadius: radius.lg,
    gap: space.xs,
    marginBottom: space.md,
    padding: space.lg,
  },
  cardTop: { alignItems: 'center', flexDirection: 'row', gap: space.md },
  cardTitle: { ...type.title, color: color.text.primary, flex: 1 },
  /** Warm fill encodes occupancy density and nothing else. */
  heatDot: { borderRadius: radius.full, height: 10, width: 10 },
  cardWhen: { ...type.body, color: color.text.warm },
  cardWhere: { ...type.bodySmall, color: color.text.secondary },
  cardFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, paddingTop: space.xs },
  fact: { ...type.caption, color: color.text.tertiary },

  centred: { alignItems: 'center', gap: space.sm, padding: space.huge },
  emptyTitle: { ...type.heading, color: color.text.primary },
  emptyBody: { ...type.bodySmall, color: color.text.secondary, textAlign: 'center' },
  error: { ...type.bodySmall, color: color.semantic.dangerOnRaised, paddingHorizontal: space.xl },
});
