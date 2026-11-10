/**
 * Sends a signed-in account that has not finished Registro v3 to /registro.
 *
 * Apple and Google create the account before Movo knows the person's age,
 * so the steps come after the account. Until `finish_signup()` (0060) the
 * app is the steps — plus the pages a person may need to read first: the
 * rules, the terms, the privacy notice and help.
 *
 * Like SuspensionGate, this is courtesy rather than the control: a failed
 * check lets the app through instead of trapping somebody on a network
 * error. What must hold — no account under 18 — is enforced by
 * `set_about_me()` in the database.
 */

import { usePathname, useRouter } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { fetchSignupStatus } from '../../lib/signup';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

/** Pages open before the steps are done. */
const OPEN_PATHS = new Set([
  '/registro',
  '/auth-callback',
  '/normas',
  '/terminos',
  '/privacidad',
  '/ayuda',
  '/sign-in',
  '/sign-up',
  // Somebody choosing a new password has a session but may not have finished
  // the steps; the steps come right after.
  '/recuperar',
]);

interface SignupGateValue {
  /** Called by /registro once `finish_signup()` succeeded. */
  markDone: () => void;
}

const SignupGateContext = createContext<SignupGateValue>({ markDone: () => undefined });

export function useSignupGate(): SignupGateValue {
  return useContext(SignupGateContext);
}

export function SignupGate({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const userId = session?.user.id;
  // Keyed by account, so a different sign-in on the same device is checked again.
  const [doneFor, setDoneFor] = useState<string | null>(null);
  const [pendingFor, setPendingFor] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || doneFor === userId) return;
    let cancelled = false;
    fetchSignupStatus(supabase)
      .then((status) => {
        if (cancelled) return;
        if (status === null || status.completed) setDoneFor(userId);
        else setPendingFor(userId);
      })
      .catch(() => {
        // See the header: let the app through.
        if (!cancelled) setDoneFor(userId);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, doneFor]);

  const markDone = useCallback(() => {
    if (userId) setDoneFor(userId);
  }, [userId]);
  const value = useMemo(() => ({ markDone }), [markDone]);

  const mustSignUp =
    userId !== undefined &&
    pendingFor === userId &&
    doneFor !== userId &&
    !OPEN_PATHS.has(pathname) &&
    !pathname.startsWith('/ayuda');

  // Navigating rather than rendering <Redirect> in place of the Stack: the
  // Stack is the navigator, and it has to stay mounted to navigate.
  useEffect(() => {
    if (mustSignUp) router.replace('/registro');
  }, [mustSignUp, router]);

  return <SignupGateContext.Provider value={value}>{children}</SignupGateContext.Provider>;
}
