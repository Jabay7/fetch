/**
 * Favorite and recently used stores, stored locally only. Store snapshots
 * are kept whole so the lists render offline; ids stay the source of truth.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Store } from '@/data/types';

export const FAVORITE_STORES_KEY = 'fetch.favoriteStores.v1';
export const RECENT_STORES_KEY = 'fetch.recentStores.v1';
export const MAX_FAVORITE_STORES = 10;
export const MAX_RECENT_STORES = 5;

function isStore(value: unknown): value is Store {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Store).id === 'string' &&
    typeof (value as Store).name === 'string'
  );
}

async function readStoreList(key: string): Promise<Store[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (Array.isArray(value)) return value.filter(isStore);
  } catch (error) {
    console.warn(`[fetch] Failed to load ${key}`, error);
  }
  return [];
}

async function writeStoreList(key: string, list: Store[]): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(list));
  } catch (error) {
    console.warn(`[fetch] Failed to write ${key}`, error);
  }
}

export function getFavoriteStores(): Promise<Store[]> {
  return readStoreList(FAVORITE_STORES_KEY);
}

export function isFavoriteStore(list: Store[], storeId: string): boolean {
  return list.some((store) => store.id === storeId);
}

/** Add or remove a favorite; returns the new list and whether it is now a favorite. */
export async function toggleFavoriteStore(
  store: Store
): Promise<{ favorite: boolean; list: Store[] }> {
  const existing = await getFavoriteStores();
  if (isFavoriteStore(existing, store.id)) {
    const list = existing.filter((item) => item.id !== store.id);
    await writeStoreList(FAVORITE_STORES_KEY, list);
    return { favorite: false, list };
  }
  const list = [store, ...existing].slice(0, MAX_FAVORITE_STORES);
  await writeStoreList(FAVORITE_STORES_KEY, list);
  return { favorite: true, list };
}

export function getRecentStores(): Promise<Store[]> {
  return readStoreList(RECENT_STORES_KEY);
}

/** Record a store selection, most recent first, deduplicated. */
export async function recordRecentStore(store: Store): Promise<void> {
  const existing = await getRecentStores();
  const list = [store, ...existing.filter((item) => item.id !== store.id)].slice(
    0,
    MAX_RECENT_STORES
  );
  await writeStoreList(RECENT_STORES_KEY, list);
}
