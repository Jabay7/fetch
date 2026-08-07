/**
 * Saved products, stored locally only — no account required. A saved entry
 * is a small product snapshot; live location/availability is always resolved
 * against the currently selected store when displayed.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const SAVED_PRODUCTS_KEY = 'fetch.savedProducts.v1';
export const MAX_SAVED_PRODUCTS = 50;

export interface SavedProduct {
  id: string;
  name: string;
  brand?: string;
  sizeText?: string;
  imageUrl?: string;
  /** How many to pick up; defaults to 1 when absent. */
  quantity?: number;
  /** Free-text list entry with no catalog product behind it. */
  isTextItem?: boolean;
  savedAt: string;
}

function isSavedProduct(value: unknown): value is SavedProduct {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SavedProduct).id === 'string' &&
    typeof (value as SavedProduct).name === 'string'
  );
}

export async function getSavedProducts(): Promise<SavedProduct[]> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_PRODUCTS_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (Array.isArray(value)) return value.filter(isSavedProduct);
  } catch (error) {
    console.warn('[fetch] Failed to load saved products', error);
  }
  return [];
}

async function persist(list: SavedProduct[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SAVED_PRODUCTS_KEY, JSON.stringify(list));
  } catch (error) {
    console.warn('[fetch] Failed to save products list', error);
  }
}

export function isProductSaved(list: SavedProduct[], productId: string): boolean {
  return list.some((item) => item.id === productId);
}

/** Add or remove a product; returns the new list and whether it is now saved. */
export async function toggleSavedProduct(product: {
  id: string;
  name: string;
  brand?: string;
  sizeText?: string;
  imageUrl?: string;
}): Promise<{ saved: boolean; list: SavedProduct[] }> {
  const existing = await getSavedProducts();
  if (isProductSaved(existing, product.id)) {
    const list = existing.filter((item) => item.id !== product.id);
    await persist(list);
    return { saved: false, list };
  }
  const entry: SavedProduct = {
    id: product.id,
    name: product.name,
    brand: product.brand,
    sizeText: product.sizeText,
    imageUrl: product.imageUrl,
    savedAt: new Date().toISOString(),
  };
  const list = [entry, ...existing].slice(0, MAX_SAVED_PRODUCTS);
  await persist(list);
  return { saved: true, list };
}

/** Add a resolved product (or bump its quantity if already listed). */
export async function addListProduct(product: {
  id: string;
  name: string;
  brand?: string;
  sizeText?: string;
  imageUrl?: string;
}): Promise<SavedProduct[]> {
  const existing = await getSavedProducts();
  const current = existing.find((item) => item.id === product.id);
  if (current) {
    return setItemQuantity(product.id, (current.quantity ?? 1) + 1);
  }
  const entry: SavedProduct = {
    ...product,
    savedAt: new Date().toISOString(),
  };
  const list = [entry, ...existing].slice(0, MAX_SAVED_PRODUCTS);
  await persist(list);
  return list;
}

/** Add a free-text item ("birthday candles") with no catalog match. */
export async function addTextItem(name: string): Promise<SavedProduct[]> {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return getSavedProducts();
  const existing = await getSavedProducts();
  const entry: SavedProduct = {
    id: `text:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    name: trimmed.slice(0, 80),
    isTextItem: true,
    savedAt: new Date().toISOString(),
  };
  const list = [entry, ...existing].slice(0, MAX_SAVED_PRODUCTS);
  await persist(list);
  return list;
}

/** Set an item's quantity (1–99); quantity 1 is stored as absent. */
export async function setItemQuantity(
  itemId: string,
  quantity: number
): Promise<SavedProduct[]> {
  const clamped = Math.min(Math.max(Math.round(quantity), 1), 99);
  const list = (await getSavedProducts()).map((item) =>
    item.id === itemId
      ? { ...item, quantity: clamped === 1 ? undefined : clamped }
      : item
  );
  await persist(list);
  return list;
}

/** Remove several items at once (used by "clear completed"). */
export async function removeSavedProducts(ids: string[]): Promise<SavedProduct[]> {
  const remove = new Set(ids);
  const list = (await getSavedProducts()).filter((item) => !remove.has(item.id));
  await persist(list);
  return list;
}

export async function removeSavedProduct(productId: string): Promise<SavedProduct[]> {
  const list = (await getSavedProducts()).filter((item) => item.id !== productId);
  await persist(list);
  return list;
}

export async function clearSavedProducts(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SAVED_PRODUCTS_KEY);
  } catch (error) {
    console.warn('[fetch] Failed to clear saved products', error);
  }
}
