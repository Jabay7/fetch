import { Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { useSelectedStore } from '@/lib/selected-store';

/**
 * Launch gate: wait for the persisted store selection, then land on search
 * (store already chosen) or the welcome flow (first run).
 */
export default function Index() {
  const { store, isHydrating } = useSelectedStore();

  useEffect(() => {
    if (!isHydrating) {
      SplashScreen.hideAsync().catch(() => {
        // Splash may already be hidden; nothing to recover.
      });
    }
  }, [isHydrating]);

  if (isHydrating) return null;
  return <Redirect href={store ? '/search' : '/welcome'} />;
}
