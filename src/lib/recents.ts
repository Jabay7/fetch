/**
 * Recent searches, stored locally only (never sent anywhere). Terms are
 * added when the user commits a search — submitting the keyboard or opening
 * a result — not on every keystroke.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { normalizeSearchTerm } from '@/data/ranking';

export const RECENT_SEARCHES_KEY = 'fetch.recentSearches.v1';
export const MAX_RECENT_SEARCHES = 8;

export async function getRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }
  } catch (error) {
    console.warn('[fetch] Failed to load recent searches', error);
  }
  return [];
}

export async function addRecentSearch(term: string): Promise<string[]> {
  const normalized = normalizeSearchTerm(term);
  if (normalized.length < 2) return getRecentSearches();
  const existing = await getRecentSearches();
  const next = [
    normalized,
    ...existing.filter((item) => item.toLowerCase() !== normalized),
  ].slice(0, MAX_RECENT_SEARCHES);
  try {
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('[fetch] Failed to save recent searches', error);
  }
  return next;
}

export async function clearRecentSearches(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch (error) {
    console.warn('[fetch] Failed to clear recent searches', error);
  }
}
