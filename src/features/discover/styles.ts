import { StyleSheet } from 'react-native';

import { color, radius, size, space, stroke, type } from '../../theme';

export const discoverStyles = StyleSheet.create({
  screen: { backgroundColor: color.bg.base, flex: 1, paddingTop: space.huge },

  header: { gap: space.xs, paddingHorizontal: space.xl },
  title: { ...type.display, color: color.text.primary },
  account: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  accountText: { ...type.caption, color: color.text.tertiary },
  linkText: { ...type.bodySmall, color: color.accent.cool, textDecorationLine: 'underline' },

  /**
   * flexShrink 0 is the fix, not a detail. The list below is flex: 1, and on
   * web a horizontal ScrollView shrinks by default — so both chip rows were
   * squeezed to about half their height and every chip rendered cut in half.
   */
  filters: { flexGrow: 0, flexShrink: 0, marginTop: space.lg },
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

  /** The heat band. Height is set by the component, which owns the geometry. */
  bandWrap: { flexShrink: 0, marginHorizontal: space.xl, marginTop: space.lg },
  band: {
    backgroundColor: color.bg.sunken,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  bandCanvas: { left: 0, position: 'absolute', top: 0 },
  bandCaption: {
    ...type.caption,
    color: color.text.secondary,
    left: space.md,
    position: 'absolute',
    top: space.sm,
  },
  bandMessage: {
    alignItems: 'center',
    bottom: space.xxl,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: space.xxl,
  },
  bandMessageText: { ...type.caption, color: color.text.secondary, textAlign: 'center' },
  bandLegend: {
    alignItems: 'center',
    bottom: space.sm,
    flexDirection: 'row',
    gap: space.sm,
    left: space.md,
    position: 'absolute',
    right: space.md,
  },
  bandScale: { ...type.caption, color: color.text.primary, fontVariant: ['tabular-nums'] },
  bandRamp: { borderRadius: 2, flex: 1, flexDirection: 'row', height: 6, overflow: 'hidden' },
  bandStop: { flex: 1 },
  bandCredit: {
    ...type.caption,
    color: color.text.tertiary,
    marginTop: space.xs,
    textAlign: 'right',
  },

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
  /** Not warm: the rhythm of a series says nothing about how full it is. */
  cardSeries: { ...type.label, color: color.text.secondary },
  cardFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, paddingTop: space.xs },
  fact: { ...type.caption, color: color.text.tertiary },

  centred: { alignItems: 'center', gap: space.sm, padding: space.huge },
  emptyTitle: { ...type.heading, color: color.text.primary },
  emptyBody: { ...type.bodySmall, color: color.text.secondary, textAlign: 'center' },
  error: { ...type.bodySmall, color: color.semantic.dangerOnRaised, paddingHorizontal: space.xl },
});
