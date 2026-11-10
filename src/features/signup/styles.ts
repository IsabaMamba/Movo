import { StyleSheet } from 'react-native';

import { color, radius, size, space, stroke, type } from '../../theme';

/**
 * Registro v3. The steps share a frame: «movo» and «Paso N de 4» on top,
 * four bars, the step, and one warm button pinned at the bottom.
 */
export const signupStyles = StyleSheet.create({
  screen: { backgroundColor: color.bg.base, flex: 1 },
  content: {
    alignSelf: 'center',
    flexGrow: 1,
    gap: space.lg,
    maxWidth: 480,
    padding: space.xxl,
    paddingBottom: space.huge,
    width: '100%',
  },

  top: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  brand: { ...type.heading, color: color.text.primary, fontWeight: '800' },
  stepOf: { ...type.caption, color: color.text.tertiary },
  bars: { flexDirection: 'row', gap: space.xs },
  bar: { backgroundColor: color.border.default, borderRadius: 2, flex: 1, height: 4 },
  barOn: { backgroundColor: color.accent.primary },

  title: { ...type.title, color: color.text.primary },
  lead: { ...type.body, color: color.text.secondary },
  label: { ...type.label, color: color.text.secondary },
  hint: { ...type.caption, color: color.text.secondary },
  error: { ...type.bodySmall, color: color.semantic.dangerOnRaised },

  box: {
    backgroundColor: color.bg.surface,
    borderColor: color.border.default,
    borderRadius: radius.lg,
    borderWidth: stroke.hair,
    gap: space.sm,
    padding: space.lg,
  },
  boxTitle: { ...type.bodySmall, color: color.text.primary, fontWeight: '700' },

  checks: { gap: space.sm },
  check: { flexDirection: 'row', gap: space.sm },
  checkText: { ...type.bodySmall, color: color.text.secondary, flex: 1 },

  /** «Tu zona, nunca tu dirección»: a blob, not a pin. */
  zoneArt: {
    alignItems: 'center',
    backgroundColor: color.bg.surface,
    borderColor: color.border.default,
    borderRadius: radius.lg,
    borderWidth: stroke.hair,
    gap: space.sm,
    justifyContent: 'center',
    paddingVertical: space.xxl,
  },
  zoneBlob: {
    backgroundColor: color.alpha.aqua10,
    borderColor: color.accent.cool,
    borderRadius: radius.full,
    borderStyle: 'dashed',
    borderWidth: stroke.hair,
    height: 96,
    width: 96,
  },
  zoneArtText: { ...type.caption, color: color.text.secondary },

  place: {
    alignItems: 'center',
    backgroundColor: color.bg.surface,
    borderColor: color.border.default,
    borderRadius: radius.lg,
    borderWidth: stroke.hair,
    flexDirection: 'row',
    gap: space.md,
    minHeight: size.control + 12,
    paddingHorizontal: space.lg,
  },
  placeText: { flex: 1 },
  placeName: { ...type.bodySmall, color: color.text.primary, fontWeight: '700' },
  placeSub: { ...type.caption, color: color.text.tertiary },
  placeAction: { ...type.action, color: color.accent.cool },

  segment: {
    borderColor: color.border.default,
    borderRadius: radius.full,
    borderWidth: stroke.hair,
    flexDirection: 'row',
    padding: space.xs,
  },
  segmentItem: {
    alignItems: 'center',
    borderRadius: radius.full,
    flex: 1,
    justifyContent: 'center',
    minHeight: size.minTarget,
  },
  segmentOn: { backgroundColor: color.accent.primary },
  segmentText: { ...type.bodySmall, color: color.text.secondary },
  segmentTextOn: { color: color.text.inverse, fontWeight: '700' },

  results: {
    backgroundColor: color.bg.surface,
    borderColor: color.border.default,
    borderRadius: radius.lg,
    borderWidth: stroke.hair,
  },
  result: {
    borderBottomColor: color.border.default,
    borderBottomWidth: stroke.hair,
    justifyContent: 'center',
    minHeight: size.minTarget + 8,
    paddingHorizontal: space.lg,
  },
  resultOn: { backgroundColor: color.bg.raised },

  family: { gap: space.sm },
  familyName: { ...type.label, letterSpacing: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    alignItems: 'center',
    borderColor: color.border.default,
    borderRadius: radius.full,
    borderWidth: stroke.hair,
    flexDirection: 'row',
    gap: space.xs,
    minHeight: size.minTarget,
    paddingHorizontal: space.md,
  },
  chipOn: { borderColor: color.accent.primary, borderWidth: stroke.thick },
  chipText: { ...type.bodySmall, color: color.text.primary },

  rule: {
    borderBottomColor: color.border.default,
    borderBottomWidth: stroke.hair,
    flexDirection: 'row',
    gap: space.md,
    paddingVertical: space.md,
  },
  ruleText: { flex: 1, gap: 2 },

  bell: {
    alignItems: 'center',
    backgroundColor: color.bg.surface,
    borderColor: color.accent.primary,
    borderRadius: radius.full,
    borderWidth: stroke.hair,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  lockRow: { alignItems: 'center', flexDirection: 'row', gap: space.md },
  appIcon: {
    alignItems: 'center',
    backgroundColor: color.accent.primary,
    borderRadius: radius.sm,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  appIconText: { ...type.action, color: color.text.inverse },

  spacer: { flexGrow: 1 },
  button: {
    alignItems: 'center',
    backgroundColor: color.accent.primary,
    borderRadius: radius.full,
    justifyContent: 'center',
    minHeight: size.control,
  },
  buttonOff: { opacity: 0.4 },
  buttonText: { ...type.action, color: color.text.inverse },
  ghost: {
    alignItems: 'center',
    borderColor: color.border.strong,
    borderRadius: radius.full,
    borderWidth: stroke.hair,
    justifyContent: 'center',
    minHeight: size.control,
  },
  ghostText: { ...type.action, color: color.text.primary },
  link: { alignItems: 'center', flexDirection: 'row', gap: space.sm, minHeight: size.minTarget },
  linkText: { ...type.bodySmall, color: color.accent.cool },
  footnote: { ...type.caption, color: color.text.tertiary, textAlign: 'center' },
});
