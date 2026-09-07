import { StyleSheet } from 'react-native';

import { color, radius, size, space, stroke, type } from '../../theme';

/**
 * Shared by the two auth screens. Sun is the primary action here and nowhere
 * else on these screens — heat is reserved for occupancy density everywhere it
 * carries meaning (ADR 0004), and a sign-in button carries none.
 */
export const authStyles = StyleSheet.create({
  screen: {
    backgroundColor: color.bg.base,
    flex: 1,
    gap: space.md,
    justifyContent: 'center',
    maxWidth: 420,
    padding: space.xxl,
    width: '100%',
  },
  title: { ...type.display, color: color.text.primary },
  subtitle: { ...type.bodySmall, color: color.text.secondary, marginBottom: space.sm },
  label: { ...type.label, color: color.text.secondary },
  input: {
    ...type.body,
    backgroundColor: color.bg.raised,
    borderColor: color.border.default,
    borderRadius: radius.md,
    borderWidth: stroke.hair,
    color: color.text.primary,
    minHeight: size.control,
    paddingHorizontal: space.md,
  },
  button: {
    alignItems: 'center',
    backgroundColor: color.accent.primary,
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: size.control,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { ...type.action, color: color.text.inverse },
  link: { minHeight: size.minTarget, justifyContent: 'center' },
  linkText: { ...type.bodySmall, color: color.accent.cool, textDecorationLine: 'underline' },
  error: { ...type.bodySmall, color: color.semantic.dangerOnRaised },
  notice: { ...type.body, color: color.text.primary },
});
