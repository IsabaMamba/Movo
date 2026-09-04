/**
 * The Supabase client the app shares.
 *
 * `src/lib/activities.ts` deliberately takes a client as an argument rather
 * than importing this module, so those wrappers stay pure and testable. This
 * is the one place a client is actually constructed.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Fail at import rather than on the first query: a missing env var otherwise
// surfaces as an opaque network error inside whichever screen loaded first.
if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and fill in your project values.',
  );
}

const isWeb = Platform.OS === 'web';

/**
 * The anon key is public by design — row-level security, not secrecy, is what
 * protects the data. The service-role key bypasses RLS entirely and must never
 * reach this bundle.
 */
export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    // Web has localStorage; native does not, and without an explicit adapter
    // the session is lost on every cold start.
    storage: isWeb ? undefined : AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    // Email confirmation links land back in the browser with the tokens in
    // the URL fragment. There is no URL to read on native.
    detectSessionInUrl: isWeb,
  },
});

// Refreshing on a timer alone does not survive backgrounding: a suspended app
// misses its refresh window and wakes with an expired token. Tie it to
// foreground state instead. Web has no equivalent problem.
if (!isWeb) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}
