/**
 * Core domain types for the product-locator data layer.
 *
 * The shapes are deliberately modeled on the only verified public retailer
 * API with store-specific aisle data (Kroger's Products API): availability
 * can be absent (=> UNKNOWN) and location details are optional per store.
 * Every provider (mock, Supabase, future Kroger adapter) maps into these.
 */

export type Availability = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN';

export type ProviderKind = 'mock' | 'supabase' | 'kroger';

export interface Store {
  id: string;
  name: string;
  chain?: string;
  addressLine: string;
  city: string;
  state: string;
  zip: string;
}

export interface ProductLocation {
  /** Aisle code as displayed in-store, e.g. "G18" or "12". */
  aisle?: string;
  bay?: string;
  shelf?: string;
  /** Shelf section label, e.g. "Oral Care". */
  section?: string;
  /** Store department, e.g. "Health & Beauty". */
  department?: string;
}

export interface ProductHit {
  /** Product id, stable across stores. */
  id: string;
  name: string;
  brand?: string;
  sizeText?: string;
  imageUrl?: string;
  availability: Availability;
  /** Absent when the store carries the item but has no planogram data. */
  location?: ProductLocation;
  /** ISO timestamp of the last location/availability update. */
  updatedAt?: string;
}

export interface ProductDetails extends ProductHit {
  description?: string;
  upc?: string;
}

/**
 * The single seam between the UI and any data source.
 *
 * Implementations must guarantee store scoping: results for `storeId` may
 * never include location/availability data from another store.
 */
export interface StoreDataProvider {
  readonly kind: ProviderKind;
  /** List stores, optionally filtered by name/city/state/ZIP text. */
  searchStores(text?: string): Promise<Store[]>;
  getStore(storeId: string): Promise<Store | null>;
  /** Ranked, store-scoped product search. Empty terms resolve to []. */
  searchProducts(storeId: string, term: string): Promise<ProductHit[]>;
  /** Product details at a store; null when the store does not carry it. */
  getProduct(storeId: string, productId: string): Promise<ProductDetails | null>;
}
