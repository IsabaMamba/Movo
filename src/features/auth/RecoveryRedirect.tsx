/**
 * Takes somebody who opened a «cambia tu contraseña» link to /recuperar.
 *
 * The link comes back to the address Supabase was given, but only if that
 * address is in the project's allowed redirects; otherwise it falls back to
 * the site's home page. The person would then be inside Movo, signed in by
 * the link, with nowhere to choose the password they came to choose. This
 * sends them there once, whichever page the link landed on.
 */

import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { arrivedFromRecovery } from '../../lib/supabase';

import { useAuth } from './AuthProvider';

export function RecoveryRedirect() {
  const { session } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const sent = useRef(false);

  useEffect(() => {
    if (!arrivedFromRecovery || !session || sent.current) return;
    sent.current = true;
    if (pathname !== '/recuperar') router.replace('/recuperar');
  }, [session, pathname, router]);

  return null;
}
