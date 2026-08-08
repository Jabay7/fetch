/**
 * In-memory StoreDataProvider used when Supabase is not configured and in
 * tests. Behaves like the real backend: async, ranked, strictly store-scoped.
 */

import { normalizeSearchTerm, rankCatalog } from '../ranking';
import type {
  ProductAtStore,
  ProductDetails,
  ProductHit,
  ProductLocation,
  Store,
  StoreDataProvider,
  StoreTierFilter,
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

  async searchStores(text?: string, tier: StoreTierFilter = 'SUPPORTED'): Promise<Store[]> {
    await delay(SIMULATED_LATENCY_MS);
    // The bundled demo catalog is entirely product-supported by construction,
    // so there is no Coming Soon tab to fill.
    if (tier === 'COMING_SOON') return [];
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

  // Demo stores carry no coordinates, so "nearby" honestly returns the full
  // demo directory without distances.
  async searchStoresNearby(
    _latitude?: number,
    _longitude?: number,
    tier: StoreTierFilter = 'SUPPORTED'
  ): Promise<Store[]> {
    await delay(SIMULATED_LATENCY_MS);
    if (tier === 'COMING_SOON') return [];
    return [...MOCK_STORES];
  },

  async findProductAtStores(
    productId: string,
    excludeStoreId?: string
  ): Promise<ProductAtStore[]> {
    await delay(SIMULATED_LATENCY_MS);
    const rows: ProductAtStore[] = [];
    for (const store of MOCK_STORES) {
      if (store.id === excludeStoreId) continue;
      const placement = (MOCK_PLACEMENTS[store.id] ?? []).find(
        (p) => p.productId === productId
      );
      if (!placement) continue;
      rows.push({
        storeId: store.id,
        storeName: store.name,
        city: store.city,
        aisle: placement.aisle,
        availability: placement.availability,
        priceCents: placement.priceCents,
      });
    }
    return rows.sort((a, b) => Number(Boolean(b.aisle)) - Number(Boolean(a.aisle)));
  },

  async getPopularTerms(): Promise<string[]> {
    return []; // no telemetry in demo mode — UI falls back to curated terms
  },
};
