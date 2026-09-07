import {
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_600SemiBold,
  Barlow_700Bold,
  useFonts,
} from '@expo-google-fonts/barlow';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { AuthProvider } from '../features/auth/AuthProvider';
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

  if (!fontsLoaded) {
    // Hold on the ground colour rather than flashing unstyled text.
    return <View style={{ backgroundColor: color.bg.base, flex: 1 }} />;
  }

  return (
    <AuthProvider>
      {/* Without an explicit content background the navigator flashes white
          between screens, which on a dark ground reads as a broken render. */}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.bg.base },
        }}
      />
      <StatusBar style="light" />
    </AuthProvider>
  );
}
