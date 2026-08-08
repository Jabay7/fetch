/**
 * Recently found products — "where was that again?"
 *
 * A shopper who looked something up last week usually wants the same answer
 * this week, and the thing they remember is the product, not the words they
 * typed to find it. Recent *search terms* cannot answer that: "toothpaste"
 * does not tell you it was aisle G18 at the Bucktown store.
 *
 * So each entry keeps the answer alongside the product, per store. This is
 * a record of what we told them, not a claim about what is true now — the
 * store screen always re-resolves live before acting on it, and entries carry
 * the time they were found so a stale one can say so.
 *
 * Local only, no account, and capped so it cannot grow without bound.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const RECENTLY_FOUND_KEY = 'fetch.recentlyFound.v1';
export const MAX_RECENTLY_FOUND = 20;

export interface RecentlyFoundProduct {
  id: string;
  name: string;
  brand?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  /** The aisle we showed, if the store had one. */
  aisle?: string;
  section?: string;
  storeId: string;
  storeName: string;
  foundAt: string;
}

function isRecentlyFound(value: unknown): value is RecentlyFoundProduct {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as RecentlyFoundProduct).id === 'string' &&
    typeof (value as RecentlyFoundProduct).name === 'string' &&
    typeof (value as RecentlyFoundProduct).storeId === 'string'
  );
}

export async function getRecentlyFound(): Promise<RecentlyFoundProduct[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_FOUND_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (Array.isArray(value)) return value.filter(isRecentlyFound);
  } catch (error) {
    console.warn('[fetch] Failed to read recently found', error);
  }
  return [];
}

/**
 * Record that we showed this product's location at this store.
 *
 * Keyed by product *and* store: the same item sits in different aisles in
 * different stores, so collapsing them would hand someone the wrong aisle.
 */
export async function recordRecentlyFound(
  entry: Omit<RecentlyFoundProduct, 'foundAt'>
): Promise<RecentlyFoundProduct[]> {
  const existing = await getRecentlyFound();
  const next = [
    { ...entry, foundAt: new Date().toISOString() },
    ...existing.filter((item) => !(item.id === entry.id && item.storeId === entry.storeId)),
  ].slice(0, MAX_RECENTLY_FOUND);
  try {
    await AsyncStorage.setItem(RECENTLY_FOUND_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('[fetch] Failed to record recently found', error);
  }
  return next;
}

export async function clearRecentlyFound(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RECENTLY_FOUND_KEY);
  } catch (error) {
    console.warn('[fetch] Failed to clear recently found', error);
  }
}

/** Entries found at the given store, most recent first. */
export function forStore(
  entries: RecentlyFoundProduct[],
  storeId?: string
): RecentlyFoundProduct[] {
  if (!storeId) return [];
  return entries.filter((entry) => entry.storeId === storeId);
}
