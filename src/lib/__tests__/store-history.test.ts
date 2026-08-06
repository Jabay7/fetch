import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Store } from '@/data/types';
import { getHasOnboarded, setHasOnboarded } from '../onboarding';
import {
  getFavoriteStores,
  getRecentStores,
  isFavoriteStore,
  MAX_RECENT_STORES,
  recordRecentStore,
  toggleFavoriteStore,
} from '../store-history';

function makeStore(id: string, name: string): Store {
  return { id, name, addressLine: '1 Main St', city: 'Chicago', state: 'IL', zip: '60601' };
}

const schaumburg = makeStore('s-1', 'Schaumburg Main Store');
const naperville = makeStore('s-2', 'Naperville West Store');

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('favorite stores', () => {
  it('toggles favorites on and off', async () => {
    const on = await toggleFavoriteStore(schaumburg);
    expect(on.favorite).toBe(true);
    expect(isFavoriteStore(on.list, 's-1')).toBe(true);

    const off = await toggleFavoriteStore(schaumburg);
    expect(off.favorite).toBe(false);
    await expect(getFavoriteStores()).resolves.toEqual([]);
  });
});

describe('recent stores', () => {
  it('records selections most-recent-first with dedupe', async () => {
    await recordRecentStore(schaumburg);
    await recordRecentStore(naperville);
    await recordRecentStore(schaumburg);
    const recents = await getRecentStores();
    expect(recents.map((s) => s.id)).toEqual(['s-1', 's-2']);
  });

  it('caps the list', async () => {
    for (let i = 0; i < MAX_RECENT_STORES + 3; i++) {
      await recordRecentStore(makeStore(`s-${i}`, `Store ${i}`));
    }
    await expect(getRecentStores()).resolves.toHaveLength(MAX_RECENT_STORES);
  });
});

describe('onboarding flag', () => {
  it('defaults to false and persists once set', async () => {
    await expect(getHasOnboarded()).resolves.toBe(false);
    await setHasOnboarded();
    await expect(getHasOnboarded()).resolves.toBe(true);
  });
});
