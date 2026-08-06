import { Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';

import { getHasOnboarded } from '@/lib/onboarding';
import { useSelectedStore } from '@/lib/selected-store';

/**
 * Launch gate: onboarding (first run) → store selection (no store yet) →
 * the tab shell. The splash stays up until both persisted flags load, so
 * the user never sees a flash of the wrong screen.
 */
export default function Index() {
  const { store, isHydrating } = useSelectedStore();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    getHasOnboarded().then(setOnboarded);
  }, []);

  const ready = !isHydrating && onboarded !== null;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {
        // Splash may already be hidden; nothing to recover.
      });
    }
  }, [ready]);

  if (!ready) return null;
  if (!onboarded) return <Redirect href="/onboarding" />;
  if (!store) return <Redirect href="/store-picker" />;
  return <Redirect href="/home" />;
}
