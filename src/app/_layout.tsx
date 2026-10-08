import {
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_600SemiBold,
  Barlow_700Bold,
  useFonts,
} from '@expo-google-fonts/barlow';
import { Stack, usePathname } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { AuthProvider } from '../features/auth/AuthProvider';
import { SuspensionGate } from '../features/auth/SuspensionGate';
import { isIndexable, NOINDEX } from '../lib/robots';
import { color } from '../theme';

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
  const robots = isIndexable(pathname) ? null : (
    <Head>
      <meta name="robots" content={NOINDEX} />
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
      <SuspensionGate>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: color.bg.base },
          }}
        />
      </SuspensionGate>
      <StatusBar style="light" />
    </AuthProvider>
  );
}
