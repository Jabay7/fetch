import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

function subscribe(onChange: () => void) {
  const subscription = Appearance.addChangeListener(onChange);
  return () => subscription.remove();
}

/**
 * Web variant: static rendering has no client color scheme, so the server
 * snapshot is 'light' and the real value takes over on hydration.
 */
export function useColorScheme() {
  return useSyncExternalStore(
    subscribe,
    () => Appearance.getColorScheme() ?? 'light',
    () => 'light'
  );
}
