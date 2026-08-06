/**
 * Core domain types for the product-locator data layer.
 *
 * The shapes are modeled on the only verified public retailer API with
 * store-specific aisle data (Kroger's Products API): availability can be
 * absent (=> UNKNOWN) and location details are optional per store. Every
 * provider (mock, Supabase, future retailer adapters) maps into these.
 */

export type Availability = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN';

export type ProviderKind = 'mock' | 'supabase' | 'kroger';

/** Where a location record came from. Community data is only ever shown
 * after review — raw submissions never reach the app. */
export type DataSource =
  | 'RETAILER_API'
  | 'AUTHORIZED_FEED'
  | 'STORE_MANAGED'
  | 'COMMUNITY_VERIFIED'
  | 'UNKNOWN';

/** Review state of a location record (see product_locations in Supabase). */
export type VerificationStatus = 'UNVERIFIED' | 'VERIFIED' | 'COMMUNITY_VERIFIED';

/** Honest per-retailer integration state, mirrored from the database matrix. */
export type RetailerIntegrationStatus =
  | 'live'
  | 'development'
  | 'partnership_required'
  | 'import_supported'
  | 'directory_only'
  | 'unsupported'
  | 'temporarily_unavailable';

export interface Retailer {
  id: string;
  name: string;
}

/**
 * What a store's integration can actually provide. The UI must only render
 * features a store supports — a departments-only store shows no aisle badge.
 */
export interface StoreCapabilities {
  aisleData: boolean;
  inventory: boolean;
  pricing: boolean;
  productImages: boolean;
  storeMap: boolean;
  realtime: boolean;
  /** Absent on records persisted before these flags existed → treat as true. */
  productSearch?: boolean;
  departmentData?: boolean;
  lastSyncedAt?: string;
  lastVerifiedAt?: string;
}

/** Conservative defaults for stores persisted before capabilities existed. */
export const LEGACY_CAPABILITIES: StoreCapabilities = {
  aisleData: true,
  inventory: true,
  pricing: false,
  productImages: false,
  storeMap: false,
  realtime: false,
};

export function storeCapabilities(store: Store): StoreCapabilities {
  return store.capabilities ?? LEGACY_CAPABILITIES;
}

export interface Store {
  id: string;
  name: string;
  chain?: string;
  retailerId?: string;
  retailerName?: string;
  retailerSlug?: string;
  retailerIntegrationStatus?: RetailerIntegrationStatus;
  capabilities?: StoreCapabilities;
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
  /** Free-text location when structured fields don't fit, e.g. "Endcap 4". */
  displayLocation?: string;
  /** Provenance of this location record. */
  dataSource?: DataSource;
  /** Review state of this location record. */
  verificationStatus?: VerificationStatus;
}

export interface ProductHit {
  /** Product id, stable across stores. */
  id: string;
  name: string;
  brand?: string;
  sizeText?: string;
  imageUrl?: string;
  availability: Availability;
  /** Present only when the store's pricing capability provides it. */
  priceCents?: number;
  /** Sale price, when a current promotion exists. */
  salePriceCents?: number;
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
 *
 * Planned extensions for retailer adapters (add here, never ad hoc):
 * getRetailers(), getStoreMap(storeId), getInventoryStatus(storeId, id).
 */
export interface StoreDataProvider {
  readonly kind: ProviderKind;
  /** List stores, optionally filtered by name/city/state/ZIP/retailer text. */
  searchStores(text?: string): Promise<Store[]>;
  getStore(storeId: string): Promise<Store | null>;
  /** Ranked, store-scoped product search. Empty terms resolve to []. */
  searchProducts(storeId: string, term: string): Promise<ProductHit[]>;
  /** Product details at a store; null when the store does not carry it. */
  getProduct(storeId: string, productId: string): Promise<ProductDetails | null>;
  /** Distinct department/section names available at a store. */
  getDepartments(storeId: string): Promise<string[]>;
}
