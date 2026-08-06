/**
 * StoreDataProvider backed by Supabase Postgres. All searching/ranking runs
 * in SQL RPCs (see supabase/migrations); this file only calls them and maps
 * rows. Errors are logged with detail and rethrown with a user-safe message.
 */

import { MIN_SEARCH_LENGTH, normalizeSearchTerm } from '../ranking';
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
    const { data, error } = await getSupabaseClient()
      .from('stores')
      .select('id, name, chain, address_line, city, state, zip')
      .eq('id', storeId)
      .maybeSingle();
    if (error) throw toUserError('getStore', error);
    return data ? rowToStore(data as StoreDbRow) : null;
  },

  async searchProducts(storeId: string, term: string): Promise<ProductHit[]> {
    const normalized = normalizeSearchTerm(term);
    if (normalized.length < MIN_SEARCH_LENGTH) return [];
    const { data, error } = await getSupabaseClient().rpc('search_products', {
      p_store_id: storeId,
      p_term: normalized,
      p_limit: 25,
    });
    if (error) throw toUserError('search_products', error);
    return ((data ?? []) as ProductSearchRow[]).map(rowToProductHit);
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
};
