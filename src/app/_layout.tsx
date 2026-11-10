import {
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_600SemiBold,
  Barlow_700Bold,
  useFonts,
} from '@expo-google-fonts/barlow';
import { Stack, usePathname, type ErrorBoundaryProps } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AuthProvider } from '../features/auth/AuthProvider';
import { RecoveryRedirect } from '../features/auth/RecoveryRedirect';
import { SuspensionGate } from '../features/auth/SuspensionGate';
import { SignupGate } from '../features/signup/SignupGate';
import { StatusPage } from '../features/web/StatusPage';
import { errorCode } from '../lib/errorCode';
import { pageTitle } from '../lib/pageTitle';
import { isIndexable, NOINDEX } from '../lib/robots';
import { color } from '../theme';

/**
 * «Algo falló de nuestro lado» (Páginas web v1 · 6–7), for any screen that
 * throws while rendering. The code is logged with the error's name and
 * message only — never who was signed in or what they typed — so a report
 * that quotes it can be matched to the log line.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const [code] = useState(() => errorCode());
  useEffect(() => {
    console.error(`[movo] ${code} ${error.name}: ${error.message}`);
  }, [code, error]);
  return (
    <StatusPage
      code={code}
      kind="error"
      onRetry={() => {
        void retry();
      }}
    />
  );
}

export default function RootLayout() {
  // The type tokens name Barlow faces by their loaded names. Without this the
  // whole app silently falls back to the platform serif and every weight in
  // typography.ts is ignored — a failure that looks like a design decision.
  const [fontsLoaded] = useFonts({
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
    Barlow_700Bold,
  });
  const pathname = usePathname();

  // Decided here, once, so a new screen is noindex without anybody remembering
  // to say so (src/lib/robots.ts). Rendered on both branches below: the
  // static web build pre-renders before the fonts load, and the tag has to be
  // in that HTML. Head does nothing on native.
  // The tab title is decided the same way, for the same reason (lib/pageTitle.ts).
  const robots = (
    <Head>
      <title>{pageTitle(pathname)}</title>
      {isIndexable(pathname) ? null : <meta name="robots" content={NOINDEX} />}
    </Head>
  );

  if (!fontsLoaded) {
    // Hold on the ground colour rather than flashing unstyled text.
    return (
      <>
        {robots}
        <View style={{ backgroundColor: color.bg.base, flex: 1 }} />
      </>
    );
  }

  return (
    <AuthProvider>
      {robots}
      {/* Without an explicit content background the navigator flashes white
          between screens, which on a dark ground reads as a broken render. */}
      <RecoveryRedirect />
      <SuspensionGate>
        <SignupGate>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: color.bg.base },
            }}
          />
        </SignupGate>
      </SuspensionGate>
      <StatusBar style="light" />
    </AuthProvider>
  );
}
