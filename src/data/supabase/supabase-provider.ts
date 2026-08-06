/**
 * StoreDataProvider backed by Supabase Postgres. All searching/ranking runs
 * in SQL RPCs (see supabase/migrations); this file only calls them and maps
 * rows. Synonym/plural handling happens client-side: candidates from
 * expandSearchTerms are tried in order until one returns results, so the
 * SQL stays simple and the behavior matches the mock provider.
 */

import { expandSearchTerms, normalizeSearchTerm } from '../ranking';
import type {
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
  type ProductDetailsRow,
  type ProductSearchRow,
  type StoreDbRow,
} from './mappers';

function toUserError(context: string, error: { message: string }): Error {
  console.warn(`[fetch] Supabase ${context} failed:`, error.message);
  return new Error('Could not reach the store database.');
}

export const supabaseProvider: StoreDataProvider = {
  kind: 'supabase',

  async searchStores(text?: string): Promise<Store[]> {
    const { data, error } = await getSupabaseClient().rpc('search_stores', {
      p_term: normalizeSearchTerm(text ?? ''),
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
};
