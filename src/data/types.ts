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

/**
 * What this store can actually do for a shopper right now — measured, not
 * assumed. A store's presence in the directory says nothing about whether it
 * can answer "which aisle?", so the app leads with this rather than hiding it
 * behind a failed search.
 *
 *   FULL_LOCATION  products, images, availability, and a real aisle or
 *                  department for each one
 *   PRODUCT        real products with images and availability, no verified
 *                  aisle yet
 *   COMMUNITY      locations contributed and confirmed by shoppers, labelled
 *                  as such and never presented as retailer data
 *   COMING_SOON    a directory record and nothing more
 */
export type StoreSupportTier =
  | 'FULL_LOCATION'
  | 'PRODUCT'
  | 'COMMUNITY'
  | 'COMING_SOON';

/** Whether a tier can answer a product search at all. */
export function isSupportedTier(tier?: StoreSupportTier): boolean {
  return tier !== undefined && tier !== 'COMING_SOON';
}

/** Which slice of the directory a store query is asking for. */
export type StoreTierFilter = 'SUPPORTED' | 'COMING_SOON' | 'ALL';

/** Measured coverage behind the tier, for honest "N products mapped" copy. */
export interface StoreCoverage {
  tier: StoreSupportTier;
  productCount: number;
  aisleLocationCount: number;
  communityLocationCount: number;
}

export interface Store {
  id: string;
  name: string;
  chain?: string;
  /** Measured coverage; absent on records from before coverage existed. */
  coverage?: StoreCoverage;
  retailerId?: string;
  retailerName?: string;
  retailerSlug?: string;
  retailerIntegrationStatus?: RetailerIntegrationStatus;
  retailerWebsiteUrl?: string;
  capabilities?: StoreCapabilities;
  addressLine: string;
  city: string;
  state: string;
  zip: string;
  /** Directory provenance: where this store record came from. */
  directorySource?: 'SEED' | 'RETAILER_API' | 'OSM' | 'STORE_MANAGED' | 'COMMUNITY';
  /** Distance from the user, when the search was geographic. */
  distanceMiles?: number;
}

/**
 * Full capability object per store (spec shape). Directory presence is
 * always true — a store in the results exists in the directory by
 * definition; every other flag reflects what its integration provides.
 */
export interface StoreCapabilityModel {
  directory: true;
  productSearch: boolean;
  aisleLocation: boolean;
  departmentLocation: boolean;
  inventory: boolean;
  pricing: boolean;
  productImages: boolean;
  storeMap: boolean;
  barcodeLookup: boolean;
  officialIntegration: boolean;
}

export function storeCapabilityModel(store: Store): StoreCapabilityModel {
  const caps = storeCapabilities(store);
  return {
    directory: true,
    productSearch: caps.productSearch ?? true,
    aisleLocation: caps.aisleData,
    departmentLocation: caps.departmentData ?? true,
    inventory: caps.inventory,
    pricing: caps.pricing,
    productImages: caps.productImages,
    storeMap: caps.storeMap,
    barcodeLookup: caps.productSearch ?? true,
    officialIntegration: store.directorySource === 'RETAILER_API',
  };
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
  /** Responsive variants, when the provider publishes them. */
  thumbnailUrl?: string;
  mediumImageUrl?: string;
  largeImageUrl?: string;
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
/** One row of "this product elsewhere" — verified data from other stores. */
export interface ProductAtStore {
  storeId: string;
  storeName: string;
  city?: string;
  aisle?: string;
  availability: Availability;
  priceCents?: number;
}

export interface StoreDataProvider {
  readonly kind: ProviderKind;
  /** List stores, optionally filtered by name/city/state/ZIP/retailer text. */
  /**
   * `tier` selects which stores the picker is asking for. 'SUPPORTED' — the
   * default — returns only stores that can answer a product search, so a
   * shopper is never handed a store that will disappoint them. 'COMING_SOON'
   * returns the directory remainder for the secondary tab.
   */
  searchStores(text?: string, tier?: StoreTierFilter): Promise<Store[]>;
  getStore(storeId: string): Promise<Store | null>;
  /** Ranked, store-scoped product search. Empty terms resolve to []. */
  searchProducts(storeId: string, term: string): Promise<ProductHit[]>;
  /** Product details at a store; null when the store does not carry it. */
  getProduct(storeId: string, productId: string): Promise<ProductDetails | null>;
  /** Distinct department/section names available at a store. */
  getDepartments(storeId: string): Promise<string[]>;
  /** Stores near a coordinate, nearest first. Optional per provider. */
  searchStoresNearby?(
    latitude: number,
    longitude: number,
    tier?: StoreTierFilter
  ): Promise<Store[]>;
  /** Other stores carrying a product, with verified location data only. */
  findProductAtStores?(
    productId: string,
    excludeStoreId?: string
  ): Promise<ProductAtStore[]>;
  /** Privacy-safe popular search terms at a store (aggregates only). */
  getPopularTerms?(storeId: string): Promise<string[]>;
}
