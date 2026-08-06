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

import type { Store } from '@/data/types';

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
      .then((raw) => {
        if (!cancelled) setStore(parseStoredStore(raw));
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
