import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  addRecentSearch,
  clearRecentSearches,
  getRecentSearches,
  MAX_RECENT_SEARCHES,
} from '../recents';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('recent searches', () => {
  it('starts empty', async () => {
    await expect(getRecentSearches()).resolves.toEqual([]);
  });

  it('adds normalized terms, most recent first', async () => {
    await addRecentSearch('  Toothpaste ');
    const recents = await addRecentSearch('milk');
    expect(recents).toEqual(['milk', 'toothpaste']);
  });

  it('dedupes case-insensitively by moving the term to the front', async () => {
    await addRecentSearch('toothpaste');
    await addRecentSearch('milk');
    const recents = await addRecentSearch('TOOTHPASTE');
    expect(recents).toEqual(['toothpaste', 'milk']);
  });

  it('ignores terms that are too short', async () => {
    const recents = await addRecentSearch('a');
    expect(recents).toEqual([]);
  });

  it('caps the list length', async () => {
    for (let i = 0; i < MAX_RECENT_SEARCHES + 3; i++) {
      await addRecentSearch(`term number ${i}`);
    }
    await expect(getRecentSearches()).resolves.toHaveLength(MAX_RECENT_SEARCHES);
  });

  it('clears', async () => {
    await addRecentSearch('toothpaste');
    await clearRecentSearches();
    await expect(getRecentSearches()).resolves.toEqual([]);
  });
});
