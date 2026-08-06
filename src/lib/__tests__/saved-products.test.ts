import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearSavedProducts,
  getSavedProducts,
  isProductSaved,
  MAX_SAVED_PRODUCTS,
  removeSavedProduct,
  toggleSavedProduct,
} from '../saved-products';

const colgate = { id: 'p-colgate-total', name: 'Colgate Total Toothpaste', brand: 'Colgate' };
const milk = { id: 'p-whole-milk', name: 'Whole Milk' };

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('saved products', () => {
  it('starts empty', async () => {
    await expect(getSavedProducts()).resolves.toEqual([]);
  });

  it('toggles a product on and off', async () => {
    const on = await toggleSavedProduct(colgate);
    expect(on.saved).toBe(true);
    expect(isProductSaved(on.list, colgate.id)).toBe(true);

    const off = await toggleSavedProduct(colgate);
    expect(off.saved).toBe(false);
    expect(off.list).toEqual([]);
  });

  it('keeps the newest first and removes individual items', async () => {
    await toggleSavedProduct(colgate);
    await toggleSavedProduct(milk);
    const list = await getSavedProducts();
    expect(list.map((p) => p.id)).toEqual(['p-whole-milk', 'p-colgate-total']);

    const removed = await removeSavedProduct('p-whole-milk');
    expect(removed.map((p) => p.id)).toEqual(['p-colgate-total']);
  });

  it('caps the list length', async () => {
    for (let i = 0; i < MAX_SAVED_PRODUCTS + 5; i++) {
      await toggleSavedProduct({ id: `p-${i}`, name: `Product ${i}` });
    }
    await expect(getSavedProducts()).resolves.toHaveLength(MAX_SAVED_PRODUCTS);
  });

  it('clears', async () => {
    await toggleSavedProduct(colgate);
    await clearSavedProducts();
    await expect(getSavedProducts()).resolves.toEqual([]);
  });

  it('survives corrupt storage', async () => {
    await AsyncStorage.setItem('fetch.savedProducts.v1', 'not json');
    await expect(getSavedProducts()).resolves.toEqual([]);
  });
});
