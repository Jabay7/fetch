/**
 * StoreDataProvider backed by Supabase Postgres. All searching/ranking runs
 * in SQL RPCs (see supabase/migrations); this file only calls them and maps
 * rows. Synonym/plural handling happens client-side: candidates from
 * expandSearchTerms are tried in order until one returns results, so the
 * SQL stays simple and the behavior matches the mock provider.
 */

import { expandSearchTerms, normalizeSearchTerm } from '../ranking';
import type {
  ProductAtStore,
  ProductDetails,
  ProductHit,
  Store,
  StoreDataProvider,
} from '../types';
import { getSupabaseClient } from './client';
import {
  rowToProductDetails,
  rowToProductHit,
  rowToStore,
  trustedResultToHit,
  type ProductDetailsRow,
  type ProductSearchRow,
  type StoreDbRow,
  type TrustedResultDto,
} from './mappers';

function toUserError(context: string, error: { message: string }): Error {
  console.warn(`[fetch] Supabase ${context} failed:`, error.message);
  return new Error('Could not reach the store database.');
}

/**
 * The product-search-assistant Edge Function adds AI-assisted interpretation
 * on top of the same deterministic SQL search. It is optional: when it is
 * unreachable (not deployed, network error, cold start timeout) the provider
 * falls back to direct RPCs, and stops retrying for a cooldown period so a
 * missing function costs one failed request every few minutes at worst.
 */
const EDGE_SEARCH_COOLDOWN_MS = 5 * 60_000;
let edgeSearchDisabledUntil = 0;

async function searchViaEdgeFunction(
  storeId: string,
  term: string
): Promise<ProductHit[] | null> {
  if (Date.now() < edgeSearchDisabledUntil) return null;
  try {
    const { data, error } = await getSupabaseClient().functions.invoke(
      'product-search-assistant',
      { body: { store_id: storeId, term } }
    );
    if (error) throw new Error(error.message ?? 'edge function error');
    const results = (data as { results?: TrustedResultDto[] } | null)?.results;
    if (!Array.isArray(results)) throw new Error('unexpected edge response');
    return results.map(trustedResultToHit);
  } catch (error) {
    edgeSearchDisabledUntil = Date.now() + EDGE_SEARCH_COOLDOWN_MS;
    console.warn(
      '[fetch] product-search-assistant unavailable; using direct search:',
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

let edgeStoreSearchDisabledUntil = 0;

/**
 * The store-search Edge Function merges the database directory with live
 * retailer store discovery (ZIP queries find real Kroger-family stores).
 * Optional, with the same cooldown fallback as product search.
 */
async function searchStoresViaEdgeFunction(term: string): Promise<Store[] | null> {
  if (Date.now() < edgeStoreSearchDisabledUntil) return null;
  try {
    const { data, error } = await getSupabaseClient().functions.invoke('store-search', {
      body: { term },
    });
    if (error) throw new Error(error.message ?? 'edge function error');
    const stores = (data as { stores?: StoreDbRow[] } | null)?.stores;
    if (!Array.isArray(stores)) throw new Error('unexpected edge response');
    return stores.map(rowToStore);
  } catch (error) {
    edgeStoreSearchDisabledUntil = Date.now() + EDGE_SEARCH_COOLDOWN_MS;
    console.warn(
      '[fetch] store-search unavailable; using direct search:',
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

export const supabaseProvider: StoreDataProvider = {
  kind: 'supabase',

  async searchStores(text?: string): Promise<Store[]> {
    const term = normalizeSearchTerm(text ?? '');
    const edgeStores = await searchStoresViaEdgeFunction(term);
    if (edgeStores !== null) return edgeStores;

    const { data, error } = await getSupabaseClient().rpc('search_stores', {
      p_term: term,
    });
    if (error) throw toUserError('search_stores', error);
    return ((data ?? []) as StoreDbRow[]).map(rowToStore);
  },

  async getStore(storeId: string): Promise<Store | null> {
    const { data, error } = await getSupabaseClient().rpc('get_store', {
      p_store_id: storeId,
    });
    if (error) throw toUserError('get_store', error);
    const rows = (data ?? []) as StoreDbRow[];
    return rows.length > 0 ? rowToStore(rows[0]) : null;
  },

  async searchProducts(storeId: string, term: string): Promise<ProductHit[]> {
    // Preferred path: the Edge Function (deterministic pipeline + AI
    // interpretation for hard queries). Falls back to direct RPCs.
    const edgeHits = await searchViaEdgeFunction(storeId, term);
    if (edgeHits !== null) return edgeHits;

    const candidates = expandSearchTerms(term);
    for (const candidate of candidates) {
      const { data, error } = await getSupabaseClient().rpc('search_products', {
        p_store_id: storeId,
        p_term: candidate,
        p_limit: 25,
      });
      if (error) throw toUserError('search_products', error);
      const rows = (data ?? []) as ProductSearchRow[];
      if (rows.length > 0) return rows.map(rowToProductHit);
    }
    return [];
  },

  async getProduct(storeId: string, productId: string): Promise<ProductDetails | null> {
    const { data, error } = await getSupabaseClient().rpc('get_product_at_store', {
      p_store_id: storeId,
      p_product_id: productId,
    });
    if (error) throw toUserError('get_product_at_store', error);
    const rows = (data ?? []) as ProductDetailsRow[];
    return rows.length > 0 ? rowToProductDetails(rows[0]) : null;
  },

  async getDepartments(storeId: string): Promise<string[]> {
    const { data, error } = await getSupabaseClient().rpc('get_departments', {
      p_store_id: storeId,
    });
    if (error) throw toUserError('get_departments', error);
    return ((data ?? []) as { section: string }[]).map((row) => row.section);
  },

  async searchStoresNearby(latitude: number, longitude: number): Promise<Store[]> {
    // Prefer the edge function (may enrich later); direct RPC works too.
    try {
      const { data, error } = await getSupabaseClient().functions.invoke('store-search', {
        body: { lat: latitude, lon: longitude },
      });
      if (error) throw new Error(error.message ?? 'edge function error');
      const stores = (data as { stores?: StoreDbRow[] } | null)?.stores;
      if (Array.isArray(stores)) return stores.map(rowToStore);
    } catch {
      // fall through to direct RPC
    }
    const { data, error } = await getSupabaseClient().rpc('search_stores_near', {
      p_lat: latitude,
      p_lon: longitude,
    });
    if (error) throw toUserError('search_stores_near', error);
    return ((data ?? []) as StoreDbRow[]).map(rowToStore);
  },

  async findProductAtStores(
    productId: string,
    excludeStoreId?: string
  ): Promise<ProductAtStore[]> {
    const { data, error } = await getSupabaseClient().rpc('find_product_at_stores', {
      p_product_id: productId,
      p_exclude_store_id: excludeStoreId ?? null,
    });
    if (error) throw toUserError('find_product_at_stores', error);
    return ((data ?? []) as {
      store_id: string;
      store_name: string;
      city: string | null;
      aisle: string | null;
      availability: string | null;
      price_cents: number | null;
    }[]).map((row) => ({
      storeId: row.store_id,
      storeName: row.store_name,
      city: row.city ?? undefined,
      aisle: row.aisle ?? undefined,
      availability:
        row.availability === 'IN_STOCK' ||
        row.availability === 'LOW_STOCK' ||
        row.availability === 'OUT_OF_STOCK'
          ? row.availability
          : 'UNKNOWN',
      priceCents: row.price_cents ?? undefined,
    }));
  },

  async getPopularTerms(storeId: string): Promise<string[]> {
    const { data, error } = await getSupabaseClient().rpc('get_popular_terms', {
      p_store_id: storeId,
    });
    if (error) return []; // trending is decorative — never break search over it
    return ((data ?? []) as { term: string }[]).map((row) => row.term);
  },
};
