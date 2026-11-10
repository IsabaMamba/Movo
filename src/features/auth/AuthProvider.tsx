/**
 * Session state for the whole app.
 *
 * Supabase owns the session; this only mirrors it into React and exposes the
 * three actions a screen needs. Profile rows are created by the
 * on_auth_user_created trigger, so there is nothing to bootstrap here.
 */

import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { disablePush } from '../../lib/push';
import { supabase } from '../../lib/supabase';

/** signUp resolves without a session when the project requires confirmation. */
export type SignUpOutcome = 'signed-in' | 'confirmation-required';

interface AuthValue {
  session: Session | null;
  /** True until the stored session has been read; routing must wait for it. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /**
   * Registro v3: only the email and the password. Name, date of birth,
   * gender, sports, zone and the rules come after, in /registro (0060).
   */
  signUp: (email: string, password: string) => Promise<SignUpOutcome>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Reading the persisted session is async on native, so the first render
    // has no session even for a signed-in user. Routing on that would bounce
    // them to sign-in on every launch.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      loading,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      signUp: async (email, password) => {
        // Nothing rides on the metadata any more: Apple and Google send none,
        // so every account goes through the same steps in /registro, with a
        // session. handle_new_user() (0035) still accepts the old fields.
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo:
              typeof window !== 'undefined' && window.location?.origin
                ? `${window.location.origin}/registro`
                : undefined,
          },
        });
        if (error) throw error;
        return data.session ? 'signed-in' : 'confirmation-required';
      },
      signOut: async () => {
        // Before signing out, while there is still a session to unregister
        // with: a device must not keep receiving somebody's notices after
        // they leave it. Never throws (see lib/push.ts).
        await disablePush(supabase);
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}
