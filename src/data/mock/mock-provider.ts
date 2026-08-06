/**
 * In-memory StoreDataProvider used when Supabase is not configured and in
 * tests. Behaves like the real backend: async, ranked, strictly store-scoped.
 */

import { normalizeSearchTerm, rankCatalog } from '../ranking';
import type {
  ProductDetails,
  ProductHit,
  ProductLocation,
  Store,
  StoreDataProvider,
} from '../types';
import { MOCK_PLACEMENTS, MOCK_PRODUCTS, MOCK_STORES, type MockPlacement } from './data';

const SIMULATED_LATENCY_MS = process.env.NODE_ENV === 'test' ? 0 : 150;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toLocation(placement: MockPlacement): ProductLocation | undefined {
  const { aisle, bay, shelf, section, department, dataSource } = placement;
  if (!aisle && !bay && !shelf && !section && !department) return undefined;
  return { aisle, bay, shelf, section, department, dataSource };
}

interface CatalogEntry {
  name: string;
  extraText?: string;
  hit: ProductHit;
}

function buildCatalogForStore(storeId: string): CatalogEntry[] {
  const placements = MOCK_PLACEMENTS[storeId] ?? [];
  const entries: CatalogEntry[] = [];
  for (const placement of placements) {
    const product = MOCK_PRODUCTS.find((p) => p.id === placement.productId);
    if (!product) continue;
    entries.push({
      name: product.name,
      extraText: [product.brand, placement.section, placement.department]
        .filter(Boolean)
        .join(' '),
      hit: {
        id: product.id,
        name: product.name,
        brand: product.brand,
        sizeText: product.sizeText,
        availability: placement.availability,
        priceCents: placement.priceCents,
        location: toLocation(placement),
        updatedAt: placement.updatedAt,
      },
    });
  }
  return entries;
}

export const mockProvider: StoreDataProvider = {
  kind: 'mock',

  async searchStores(text?: string): Promise<Store[]> {
    await delay(SIMULATED_LATENCY_MS);
    const query = normalizeSearchTerm(text ?? '');
    if (!query) return [...MOCK_STORES];
    return MOCK_STORES.filter((store) =>
      [
        store.name,
        store.city,
        store.state,
        store.zip,
        store.addressLine,
        store.retailerName ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  },

  async getStore(storeId: string): Promise<Store | null> {
    await delay(SIMULATED_LATENCY_MS);
    return MOCK_STORES.find((store) => store.id === storeId) ?? null;
  },

  async searchProducts(storeId: string, term: string): Promise<ProductHit[]> {
    await delay(SIMULATED_LATENCY_MS);
    const catalog = buildCatalogForStore(storeId);
    return rankCatalog(term, catalog).map((entry) => entry.hit);
  },

  async getProduct(storeId: string, productId: string): Promise<ProductDetails | null> {
    await delay(SIMULATED_LATENCY_MS);
    const placement = (MOCK_PLACEMENTS[storeId] ?? []).find(
      (p) => p.productId === productId
    );
    const product = MOCK_PRODUCTS.find((p) => p.id === productId);
    if (!placement || !product) return null;
    return {
      id: product.id,
      name: product.name,
      brand: product.brand,
      sizeText: product.sizeText,
      description: product.description,
      upc: product.upc,
      availability: placement.availability,
      priceCents: placement.priceCents,
      location: toLocation(placement),
      updatedAt: placement.updatedAt,
    };
  },

  async getDepartments(storeId: string): Promise<string[]> {
    await delay(SIMULATED_LATENCY_MS);
    const sections = new Set<string>();
    for (const placement of MOCK_PLACEMENTS[storeId] ?? []) {
      if (placement.section) sections.add(placement.section);
    }
    return [...sections].sort((a, b) => a.localeCompare(b));
  },
};
