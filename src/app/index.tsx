/**
 * Connectivity check, not a product screen.
 *
 * It reads the seeded categories through PostgREST, which exercises the whole
 * chain in one go: env vars, the Supabase client, the anon role's grants, and
 * the row-level security policy on `categories`. Styling is deliberately bare
 * — design tokens land once a visual direction is chosen (see src/theme).
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import { fetchCategories } from '../lib/activities';
import { supabase } from '../lib/supabase';
import type { Category } from '../types/database';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; categories: Category[] }
  | { status: 'error'; message: string };

export default function Index() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    fetchCategories(supabase)
      .then((categories) => {
        if (!cancelled) setState({ status: 'ready', categories });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      });

    // The screen can unmount before the request settles; without this the
    // state update lands on a dead component.
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Movo</Text>
      <Text style={styles.subtitle}>Categorías desde Supabase</Text>

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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 8, justifyContent: 'center', padding: 24 },
  title: { fontSize: 32, fontWeight: '700' },
  subtitle: { fontSize: 14, marginBottom: 16, opacity: 0.6 },
  error: { color: '#b00020' },
  empty: { opacity: 0.6 },
  row: { borderBottomColor: '#e0e0e0', borderBottomWidth: 1, paddingVertical: 12 },
  rowName: { fontSize: 18 },
  rowId: { fontSize: 12, opacity: 0.5 },
});
