import { StyleSheet } from 'react-native';

/**
 * Shared by the two auth screens. Bare on purpose — design tokens land once a
 * visual direction is chosen (see src/theme).
 */
export const authStyles = StyleSheet.create({
  screen: { flex: 1, gap: 12, justifyContent: 'center', maxWidth: 420, padding: 24, width: '100%' },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 14, marginBottom: 8, opacity: 0.6 },
  label: { fontSize: 13, opacity: 0.7 },
  input: {
    borderColor: '#c7c7c7',
    borderRadius: 6,
    borderWidth: 1,
    fontSize: 16,
    padding: 12,
  },
  button: { alignItems: 'center', backgroundColor: '#111', borderRadius: 6, padding: 14 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { paddingVertical: 8 },
  linkText: { fontSize: 14, textDecorationLine: 'underline' },
  error: { color: '#b00020', fontSize: 14 },
  notice: { fontSize: 14, lineHeight: 20 },
});
