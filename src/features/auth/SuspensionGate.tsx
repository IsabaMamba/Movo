/**
 * The suspension screen.
 *
 * A suspended account sees this instead of the app. It says the account is
 * suspended, until when, and what that means — and nothing about why, or
 * that anybody reported: `my_suspension()` returns only the end date.
 *
 * This is courtesy, not the control. Every write a suspended account could
 * attempt is refused by the triggers in 0020 whether or not this screen
 * rendered, so a failed check lets the app through rather than locking a
 * person out on a network error.
 */

import { Link, usePathname } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { supabase } from '../../lib/supabase';
import { fetchMySuspension, suspensionUntilLabel, type MySuspension } from '../../lib/suspensions';
import { staffStyles as s } from '../staff/styles';
import { useAuth } from './AuthProvider';

export function SuspensionGate({ children }: { children: ReactNode }) {
  const { session, signOut } = useAuth();
  const pathname = usePathname();
  const userId = session?.user.id;

  const [suspension, setSuspension] = useState<MySuspension | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    if (!userId) {
      setSuspension(null);
      return;
    }
    setChecking(true);
    try {
      setSuspension(await fetchMySuspension(supabase));
    } catch {
      // See the header: the database refuses the writes either way.
      setSuspension(null);
    } finally {
      setChecking(false);
    }
  }, [userId]);

  useEffect(() => {
    void check();
  }, [check]);

  // The rules are the one screen a suspended person is let through to: they
  // were suspended under them, and must be able to read them.
  if (!suspension || pathname === '/normas') return <>{children}</>;

  return (
    <ScrollView contentContainerStyle={s.content} style={s.screen}>
      <View>
        <Text accessibilityRole="header" style={s.title}>
          Tu cuenta está suspendida
        </Text>
        <Text style={s.subtitle}>
          El equipo de Movo suspendió tu cuenta {suspensionUntilLabel(suspension.endsAt)}.
        </Text>
      </View>

      <View style={s.card}>
        <Text style={s.details}>
          Mientras dure no puedes crear sesiones, unirte a una, escribir en los chats ni crear
          grupos o lugares. Tus sesiones futuras se cancelaron y a quienes iban les llegó un aviso.
        </Text>
        <Text style={s.meta}>
          {suspension.endsAt === null
            ? 'No tiene fecha de fin: dura hasta que el equipo la levante.'
            : 'Cuando llegue esa fecha termina sola; no tienes que hacer nada.'}
        </Text>
        <Link href="/normas" style={s.back}>
          <Text style={s.linkText}>Leer las normas de la comunidad</Text>
        </Link>
      </View>

      <View style={s.confirmRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Revisar de nuevo"
          accessibilityHint="Vuelve a preguntar si la suspensión sigue vigente"
          aria-busy={checking}
          disabled={checking}
          onPress={() => {
            void check();
          }}
          style={s.backButton}
        >
          {checking ? (
            <ActivityIndicator aria-label="Revisando" />
          ) : (
            <Text style={s.actionText}>Revisar de nuevo</Text>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesión"
          onPress={() => {
            void signOut();
          }}
          style={s.backButton}
        >
          <Text style={s.actionText}>Cerrar sesión</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
