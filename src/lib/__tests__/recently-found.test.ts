import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearRecentlyFound,
  forStore,
  getRecentlyFound,
  MAX_RECENTLY_FOUND,
  recordRecentlyFound,
  RECENTLY_FOUND_KEY,
} from '../recently-found';

const colgate = {
  id: 'p-1',
  name: 'Colgate Total',
  brand: 'Colgate',
  aisle: 'G18',
  section: 'Oral Care',
  storeId: 'store-a',
  storeName: 'Mariano’s Bucktown',
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('recentlyFound', () => {
  it('remembers the answer, not just the search term', async () => {
    await recordRecentlyFound(colgate);
    const [entry] = await getRecentlyFound();
    expect(entry.name).toBe('Colgate Total');
    expect(entry.aisle).toBe('G18');
    expect(entry.storeName).toBe('Mariano’s Bucktown');
    expect(entry.foundAt).toBeTruthy();
  });

  it('keeps the same product separately per store', async () => {
    // The same item sits in different aisles at different stores. Collapsing
    // these would hand someone the wrong aisle.
    await recordRecentlyFound(colgate);
    await recordRecentlyFound({
      ...colgate,
      aisle: '12',
      storeId: 'store-b',
      storeName: 'Dillons East',
    });

    const all = await getRecentlyFound();
    expect(all).toHaveLength(2);
    expect(forStore(all, 'store-a')[0].aisle).toBe('G18');
    expect(forStore(all, 'store-b')[0].aisle).toBe('12');
  });

  it('moves a re-visited product to the top without duplicating it', async () => {
    await recordRecentlyFound(colgate);
    await recordRecentlyFound({ ...colgate, id: 'p-2', name: 'Crest' });
    await recordRecentlyFound({ ...colgate, aisle: 'G20' });

    const all = await getRecentlyFound();
    expect(all).toHaveLength(2);
    expect(all[0].id).toBe('p-1');
    // The newer answer replaces the older one for that store.
    expect(all[0].aisle).toBe('G20');
  });

  it('caps history so local storage cannot grow without bound', async () => {
    for (let i = 0; i < MAX_RECENTLY_FOUND + 8; i += 1) {
      await recordRecentlyFound({ ...colgate, id: `p-${i}`, name: `Item ${i}` });
    }
    const all = await getRecentlyFound();
    expect(all).toHaveLength(MAX_RECENTLY_FOUND);
    // Newest kept, oldest dropped.
    expect(all[0].name).toBe(`Item ${MAX_RECENTLY_FOUND + 7}`);
  });

  it('returns nothing rather than throwing on a corrupt payload', async () => {
    await AsyncStorage.setItem(RECENTLY_FOUND_KEY, 'not json');
    await expect(getRecentlyFound()).resolves.toEqual([]);
  });

  it('drops malformed entries instead of rendering them', async () => {
    await AsyncStorage.setItem(
      RECENTLY_FOUND_KEY,
      JSON.stringify([{ id: 'ok', name: 'Fine', storeId: 's' }, { nope: true }])
    );
    const all = await getRecentlyFound();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('ok');
  });

  it('clears completely when asked', async () => {
    await recordRecentlyFound(colgate);
    await clearRecentlyFound();
    await expect(getRecentlyFound()).resolves.toEqual([]);
  });

  it('shows nothing when no store is selected', () => {
    expect(forStore([{ ...colgate, foundAt: '' }], undefined)).toEqual([]);
  });
});
