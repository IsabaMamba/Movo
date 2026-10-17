import { StyleSheet } from 'react-native';

import { color, radius, size, space, stroke, type } from '../../theme';

/**
 * Asistencia v2 (16 October): «Llegué» on the participant's card, and the
 * code with the live list on the organizer's side. The participant's card
 * carries the Sun edge, like the meeting point: it is the one thing on the
 * screen that needs doing now.
 */
export const checkInStyles = StyleSheet.create({
  next: {
    backgroundColor: color.bg.surface,
    borderLeftColor: color.accent.primary,
    borderLeftWidth: stroke.thick,
    borderRadius: radius.lg,
    gap: space.sm,
    padding: space.lg,
  },
  eyebrow: { ...type.label, color: color.text.warm },
  time: { ...type.display, color: color.text.primary },
  title: { ...type.title, color: color.text.primary },
  meta: { ...type.bodySmall, color: color.text.secondary },
  note: { ...type.caption, color: color.text.tertiary, textAlign: 'center' },

  arrive: {
    alignItems: 'center',
    backgroundColor: color.accent.primary,
    borderRadius: radius.full,
    justifyContent: 'center',
    minHeight: size.control + 8,
  },
  arriveDisabled: { opacity: 0.4 },
  arriveText: { ...type.action, color: color.text.inverse },

  codeInput: {
    ...type.display,
    backgroundColor: color.bg.raised,
    borderColor: color.border.default,
    borderRadius: radius.md,
    borderWidth: stroke.hair,
    color: color.text.primary,
    letterSpacing: 16,
    minHeight: size.control + 16,
    textAlign: 'center',
  },
  row: { flexDirection: 'row', gap: space.md },
  secondary: {
    alignItems: 'center',
    borderColor: color.border.strong,
    borderRadius: radius.md,
    borderWidth: stroke.hair,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: size.control,
  },
  secondaryText: { ...type.action, color: color.text.primary },
  ok: { ...type.bodySmall, color: color.semantic.success },
  bad: { ...type.bodySmall, color: color.semantic.dangerOnRaised },

  // Organizer: the code, large enough to read across a parking lot.
  codePanel: {
    backgroundColor: color.bg.surface,
    borderColor: color.accent.primary,
    borderRadius: radius.lg,
    borderWidth: stroke.hair,
    gap: space.sm,
    padding: space.lg,
  },
  codeLabel: { ...type.label, color: color.text.warm },
  codeDigits: {
    ...type.display,
    color: color.text.primary,
    fontSize: 56,
    letterSpacing: 18,
    lineHeight: 64,
    textAlign: 'center',
  },
  codeNote: { ...type.caption, color: color.text.secondary, textAlign: 'center' },
  progress: { backgroundColor: color.bg.raised, borderRadius: radius.full, height: 6 },
  progressFill: {
    backgroundColor: color.semantic.success,
    borderRadius: radius.full,
    height: 6,
  },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progressText: { ...type.bodySmall, color: color.text.primary },
  progressNote: { ...type.caption, color: color.text.tertiary },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  filter: {
    borderColor: color.border.default,
    borderRadius: radius.full,
    borderWidth: stroke.hair,
    justifyContent: 'center',
    minHeight: size.controlSm,
    paddingHorizontal: space.md,
  },
  filterOn: { backgroundColor: color.accent.deep, borderColor: color.accent.cool },
  filterText: { ...type.caption, color: color.text.secondary },
  filterTextOn: { color: color.text.primary },
  how: { ...type.caption, color: color.semantic.success },
  undo: { ...type.caption, color: color.text.tertiary, textDecorationLine: 'underline' },
});
