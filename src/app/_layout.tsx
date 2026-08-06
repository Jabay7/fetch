import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { queryClient } from '@/lib/query-client';
import { SelectedStoreProvider } from '@/lib/selected-store';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const navTheme = useMemo(() => {
    const scheme = colorScheme === 'dark' ? 'dark' : 'light';
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: Colors[scheme].tint,
        background: Colors[scheme].background,
        card: Colors[scheme].background,
        text: Colors[scheme].text,
        border: Colors[scheme].border,
      },
    };
  }, [colorScheme]);

  return (
    <QueryClientProvider client={queryClient}>
      <SelectedStoreProvider>
        <ThemeProvider value={navTheme}>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="store-picker" options={{ presentation: 'modal' }} />
          </Stack>
        </ThemeProvider>
      </SelectedStoreProvider>
    </QueryClientProvider>
  );
}
