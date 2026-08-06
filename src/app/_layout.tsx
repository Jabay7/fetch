import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { ToastProvider } from '@/components/toast';
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
          <ToastProvider>
            <StatusBar style="auto" />
            {/* Web follows website conventions: instant route changes and a
                plain store-picker screen. Native keeps the platform's stack
                animations and the modal picker. */}
            <Stack
              screenOptions={{
                headerShown: false,
                ...(Platform.OS === 'web' ? { animation: 'none' as const } : {}),
              }}
            >
              <Stack.Screen
                name="store-picker"
                options={Platform.OS === 'web' ? {} : { presentation: 'modal' }}
              />
            </Stack>
          </ToastProvider>
        </ThemeProvider>
      </SelectedStoreProvider>
    </QueryClientProvider>
  );
}
