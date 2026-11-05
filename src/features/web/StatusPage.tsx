/**
 * The two pages nobody wants to see (Páginas web v1 · 4–7).
 *
 * «No encontramos esta página» gives the three reasons a session link stops
 * working all at once — it was mistyped, the session passed or was
 * cancelled, or it is only for a group — and never says which, so a private
 * session is not revealed by its 404. «Algo falló de nuestro lado» takes the
 * blame, says the person's data is fine, and shows a short code to quote in
 * a report. Both are noindex: neither path is in the robots allowlist.
 */

import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, radius, size, space, type } from '../../theme';
import { Icon, type IconName } from '../nav/Icon';

interface Props {
  kind: 'not_found' | 'error';
  /** «Algo falló» only: the code to quote. */
  code?: string;
  /** «Algo falló» only: try the screen again. */
  onRetry?: () => void;
}

export function StatusPage({ kind, code, onRetry }: Props) {
  const router = useRouter();
  const notFound = kind === 'not_found';
  const icon: IconName = notFound ? 'alert' : 'repeat';

  return (
    <View style={styles.screen}>
      <View style={styles.body}>
        <View aria-hidden style={[styles.badge, !notFound && styles.badgeError]}>
          <Icon
            color={notFound ? color.accent.primary : color.semantic.dangerOnRaised}
            name={icon}
            size={26}
          />
        </View>
        {notFound && <Text style={styles.eyebrow}>Error 404</Text>}
        <Text accessibilityRole="header" style={styles.title}>
          {notFound ? 'No encontramos esta página' : 'Algo falló de nuestro lado'}
        </Text>
        <Text style={styles.text}>
          {notFound
            ? 'Puede que el enlace esté mal escrito. Si alguien te pasó el enlace de una sesión, puede que ya haya pasado, que se haya cancelado o que sea solo para un grupo.'
            : 'No es tu conexión ni algo que hiciste. Prueba de nuevo en unos minutos; tus sesiones y tus datos están bien.'}
        </Text>

        <View style={styles.actions}>
          {!notFound && onRetry && (
            <Pressable accessibilityRole="button" onPress={onRetry} style={styles.primary}>
              <Text style={styles.primaryText}>Intentar de nuevo</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="link"
            onPress={() => {
              router.replace('/');
            }}
            style={notFound ? styles.primary : styles.secondary}
          >
            <Text style={notFound ? styles.primaryText : styles.secondaryText}>Ir al inicio</Text>
          </Pressable>
          {notFound && (
            <Pressable
              accessibilityRole="link"
              onPress={() => {
                router.replace('/normas');
              }}
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>Ver las normas</Text>
            </Pressable>
          )}
        </View>

        {code && (
          <Text selectable style={styles.code}>
            Código del error: {code}. Si lo mencionas en un reporte, lo encontramos más rápido.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: color.bg.base, flex: 1, justifyContent: 'center' },
  body: {
    alignItems: 'center',
    alignSelf: 'center',
    gap: space.md,
    maxWidth: 520,
    padding: space.xl,
    width: '100%',
  },
  badge: {
    alignItems: 'center',
    backgroundColor: color.bg.surface,
    borderRadius: radius.full,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  badgeError: { borderColor: color.semantic.danger, borderWidth: 1 },
  eyebrow: { ...type.caption, color: color.text.tertiary },
  title: { ...type.title, color: color.text.primary, textAlign: 'center' },
  text: { ...type.body, color: color.text.secondary, textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: space.sm, marginTop: space.sm },
  primary: {
    alignItems: 'center',
    backgroundColor: color.accent.primary,
    borderRadius: radius.full,
    justifyContent: 'center',
    minHeight: size.control,
  },
  primaryText: { ...type.action, color: color.text.inverse },
  secondary: {
    alignItems: 'center',
    borderColor: color.border.strong,
    borderRadius: radius.full,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: size.control,
  },
  secondaryText: { ...type.action, color: color.text.primary },
  code: { ...type.caption, color: color.text.tertiary, textAlign: 'center' },
});
