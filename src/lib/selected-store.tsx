/**
 * Selected-store state, persisted to AsyncStorage. The store stays selected
 * across launches until the user changes it. All product queries key off
 * `store.id`, so switching stores automatically drops any cross-store data.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { dataProvider } from '@/data';
import type { Store } from '@/data/types';
import { recordRecentStore } from '@/lib/store-history';

export const SELECTED_STORE_KEY = 'fetch.selectedStore.v1';

export function parseStoredStore(raw: string | null): Store | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as Store).id === 'string' &&
      typeof (value as Store).name === 'string' &&
      typeof (value as Store).city === 'string'
    ) {
      return value as Store;
    }
  } catch {
    // Corrupt payload — treat as no selection.
  }
  return null;
}

interface SelectedStoreContextValue {
  store: Store | null;
  /** True while the persisted selection is being loaded on launch. */
  isHydrating: boolean;
  selectStore: (store: Store) => void;
  clearStore: () => void;
}

const SelectedStoreContext = createContext<SelectedStoreContextValue | null>(null);

export function SelectedStoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(SELECTED_STORE_KEY)
      .then(async (raw) => {
        const persisted = parseStoredStore(raw);
        if (cancelled) return;
        // Show the persisted store immediately — revalidation must not make
        // the app wait on the network at launch.
        setStore(persisted);
        if (!persisted) return;

        // A selection is a snapshot, and the world moves: stores get merged
        // into a canonical twin, close permanently, or turn out to be demo
        // data. Re-resolve it so a shopper is never quietly served a store
        // that no longer exists.
        try {
          const current = await dataProvider.getStore(persisted.id);
          if (cancelled) return;
          if (!current) {
            setStore(null);
            await AsyncStorage.removeItem(SELECTED_STORE_KEY);
          } else if (current.id !== persisted.id || current.name !== persisted.name) {
            setStore(current);
            await AsyncStorage.setItem(SELECTED_STORE_KEY, JSON.stringify(current));
          }
        } catch {
          // Offline or backend trouble: keep the persisted selection rather
          // than stranding someone standing in the store.
        }
      })
      .catch((error) => {
        console.warn('[fetch] Failed to load selected store', error);
      })
      .finally(() => {
        if (!cancelled) setIsHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectStore = useCallback((next: Store) => {
    setStore(next);
    AsyncStorage.setItem(SELECTED_STORE_KEY, JSON.stringify(next)).catch((error) =>
      console.warn('[fetch] Failed to persist selected store', error)
    );
    recordRecentStore(next).catch((error) =>
      console.warn('[fetch] Failed to record recent store', error)
    );
  }, []);

  const clearStore = useCallback(() => {
    setStore(null);
    AsyncStorage.removeItem(SELECTED_STORE_KEY).catch((error) =>
      console.warn('[fetch] Failed to clear selected store', error)
    );
  }, []);

  const value = useMemo(
    () => ({ store, isHydrating, selectStore, clearStore }),
    [store, isHydrating, selectStore, clearStore]
  );

  return (
    <SelectedStoreContext.Provider value={value}>
      {children}
    </SelectedStoreContext.Provider>
  );
}

export function useSelectedStore(): SelectedStoreContextValue {
  const context = useContext(SelectedStoreContext);
  if (!context) {
    throw new Error('useSelectedStore must be used within SelectedStoreProvider');
  }
  return context;
}
