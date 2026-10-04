import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
  Outfit_900Black,
} from '@expo-google-fonts/outfit';
import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { startSync, useAuthStatus } from '@/data/store';
import { DialogHost } from '@/ui/dialog';
import { colors, fonts } from '@/ui/theme';

SplashScreen.preventAutoHideAsync();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.line,
    primary: colors.primary,
  },
};

export default function RootLayout() {
  const auth = useAuthStatus();
  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    Outfit_900Black,
  });

  useEffect(() => {
    startSync();
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  const ready = auth !== 'loading' && fontsLoaded;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: fonts.display, fontSize: 22 },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.bg },
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="group/new" options={{ presentation: 'modal', title: 'Nouveau groupe' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal', title: 'Abonnement' }} />
        <Stack.Screen name="account" options={{ title: 'Mon compte' }} />
        <Stack.Screen name="legal/[doc]" options={{ title: '' }} />
        <Stack.Screen name="join/[code]" options={{ title: 'Rejoindre' }} />
        <Stack.Screen name="group/[groupId]/index" options={{ title: '' }} />
        <Stack.Screen name="session/new" options={{ presentation: 'modal', title: 'Nouveau match' }} />
        <Stack.Screen name="session/[sessionId]" options={{ title: 'Session' }} />
        <Stack.Screen name="match/[matchId]/index" options={{ title: 'Match' }} />
        <Stack.Screen name="match/[matchId]/compo" options={{ title: 'Composition' }} />
        <Stack.Screen name="match/[matchId]/live" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="match/[matchId]/vote" options={{ title: 'Votes MVP' }} />
      </Stack>
      <DialogHost />
    </ThemeProvider>
  );
}
