/**
 * The Supabase client the app shares.
 *
 * `src/lib/activities.ts` deliberately takes a client as an argument rather
 * than importing this module, so those wrappers stay pure and testable. This
 * is the one place a client is actually constructed.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

/**
 * The anon key is public by design — row-level security, not secrecy, is what
 * protects the data. The service-role key bypasses RLS entirely and must never
 * reach this bundle.
 */
export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    // No auth flow yet. When sign-in lands, native needs an AsyncStorage
    // adapter here or sessions will not survive a cold start.
    persistSession: false,
  },
});
