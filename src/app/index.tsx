/**
 * Signed-in home. Still a scaffold rather than the real discover screen, but
 * it now proves the parts that matter: the session survives a reload, the
 * on_auth_user_created trigger produced a profile row, and RLS lets the owner
 * read it back.
 */

import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../features/auth/AuthProvider';
import { fetchCategories } from '../lib/activities';
import { supabase } from '../lib/supabase';
import type { Category } from '../types/database';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; categories: Category[]; displayName: string | null }
  | { status: 'error'; message: string };

export default function Index() {
  const { session, loading, signOut } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const load = async () => {
      const [categories, profile] = await Promise.all([
        fetchCategories(supabase),
        supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle(),
      ]);
      if (profile.error) throw profile.error;
      return {
        categories,
        displayName: (profile.data?.display_name as string | undefined) ?? null,
      };
    };

    load()
      .then(({ categories, displayName }) => {
        if (!cancelled) setState({ status: 'ready', categories, displayName });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: cause instanceof Error ? cause.message : 'Unknown error',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return <ActivityIndicator style={styles.fill} />;
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Movo</Text>
      <Text style={styles.subtitle}>
        {state.status === 'ready' && state.displayName
          ? `Hola, ${state.displayName}`
          : session.user.email}
      </Text>

      {state.status === 'loading' && <ActivityIndicator />}
      {state.status === 'error' && <Text style={styles.error}>{state.message}</Text>}

      {state.status === 'ready' && (
        <FlatList
          data={state.categories}
          keyExtractor={(category) => category.id}
          ListEmptyComponent={<Text style={styles.empty}>No hay categorías.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowName}>{item.name_es}</Text>
              <Text style={styles.rowId}>{item.id}</Text>
            </View>
          )}
        />
      )}

      <Pressable
        onPress={() => {
          void signOut();
        }}
        style={styles.signOut}
      >
        <Text style={styles.signOutText}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  screen: { flex: 1, gap: 8, padding: 24, paddingTop: 64 },
  title: { fontSize: 32, fontWeight: '700' },
  subtitle: { fontSize: 14, marginBottom: 16, opacity: 0.6 },
  error: { color: '#b00020' },
  empty: { opacity: 0.6 },
  row: { borderBottomColor: '#e0e0e0', borderBottomWidth: 1, paddingVertical: 12 },
  rowName: { fontSize: 18 },
  rowId: { fontSize: 12, opacity: 0.5 },
  signOut: { paddingVertical: 16 },
  signOutText: { fontSize: 14, textDecorationLine: 'underline' },
});
