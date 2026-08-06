/**
 * Trusted result assembly. Search responses are built EXCLUSIVELY from
 * verified database/provider rows — this module has no AI input by design,
 * which is the structural guarantee that Claude can never supply an aisle,
 * price, or inventory status: interpretation only produces search terms
 * (see search-interpretation.ts), and every fact in a TrustedProductResult
 * is copied from a database row.
 *
 * Pure TypeScript; tested under Jest, imported by the Edge Function.
 */

export type TrustedSourceType =
  | 'official_retailer_api'
  | 'authorized_feed'
  | 'store_import'
  | 'verified_database'
  | 'community_verified'
  | 'mock';

export interface TrustedProductResult {
  store: {
    id: string;
    retailerId: string | null;
    name: string;
    address: string;
  };
  product: {
    id: string;
    name: string;
    brand?: string;
    size?: string;
    upc?: string;
    imageUrl?: string;
  };
  location: {
    department?: string;
    aisle?: string;
    bay?: string;
    shelf?: string;
    section?: string;
    displayLocation?: string;
  } | null;
  inventory: {
    status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown';
  };
  price?: {
    regular?: number;
    sale?: number;
    currency: string;
  };
  source: {
    type: TrustedSourceType;
    provider: string;
    verified: boolean;
    updatedAt?: string;
  };
  capabilities: {
    productSearchSupported: boolean;
    aisleSupported: boolean;
    inventorySupported: boolean;
    pricingSupported: boolean;
  };
}

/** Store row shape returned by the get_store / search_stores RPCs. */
export interface DbStoreRow {
  id: string;
  name: string;
  retailer_id: string | null;
  address_line: string;
  city: string;
  state: string;
  zip: string;
  cap_aisle_data: boolean | null;
  cap_inventory: boolean | null;
  cap_pricing: boolean | null;
  cap_product_search: boolean | null;
}

/** Product row shape returned by search_products / lookup_store_product v3. */
export interface DbProductRow {
  product_id: string;
  name: string;
  brand: string | null;
  size_text: string | null;
  image_url: string | null;
  availability: string | null;
  price_cents: number | null;
  sale_price_cents: number | null;
  aisle: string | null;
  bay: string | null;
  shelf: string | null;
  section: string | null;
  department: string | null;
  display_location: string | null;
  data_source: string | null;
  source_provider: string | null;
  verification_status: string | null;
  updated_at: string | null;
  upc?: string | null;
}

const SOURCE_TYPE_MAP: Record<string, TrustedSourceType> = {
  RETAILER_API: 'official_retailer_api',
  AUTHORIZED_FEED: 'authorized_feed',
  STORE_MANAGED: 'store_import',
  COMMUNITY_VERIFIED: 'community_verified',
};

const STATUS_MAP: Record<string, TrustedProductResult['inventory']['status']> = {
  IN_STOCK: 'in_stock',
  LOW_STOCK: 'low_stock',
  OUT_OF_STOCK: 'out_of_stock',
};

export function toTrustedSourceType(
  dataSource: string | null | undefined,
  verificationStatus: string | null | undefined,
  providerKind: 'db' | 'mock' = 'db'
): TrustedSourceType {
  if (providerKind === 'mock') return 'mock';
  if (dataSource && SOURCE_TYPE_MAP[dataSource]) {
    if (dataSource === 'STORE_MANAGED' && verificationStatus === 'VERIFIED') {
      return 'verified_database';
    }
    return SOURCE_TYPE_MAP[dataSource];
  }
  return 'verified_database';
}

export function buildTrustedResult(
  store: DbStoreRow,
  row: DbProductRow,
  options: { provider: string; mock?: boolean } = { provider: 'supabase' }
): TrustedProductResult {
  const hasLocation = Boolean(
    row.aisle || row.bay || row.shelf || row.section || row.department || row.display_location
  );

  const capabilities = {
    productSearchSupported: store.cap_product_search ?? true,
    aisleSupported: store.cap_aisle_data ?? false,
    inventorySupported: store.cap_inventory ?? false,
    pricingSupported: store.cap_pricing ?? false,
  };

  return {
    store: {
      id: store.id,
      retailerId: store.retailer_id,
      name: store.name,
      address: `${store.address_line}, ${store.city}, ${store.state} ${store.zip}`,
    },
    product: {
      id: row.product_id,
      name: row.name,
      brand: row.brand ?? undefined,
      size: row.size_text ?? undefined,
      upc: row.upc ?? undefined,
      imageUrl: row.image_url ?? undefined,
    },
    // Location comes only from the row; absent fields stay absent. The UI
    // renders "Aisle unavailable" for null — nothing here ever guesses.
    location: hasLocation
      ? {
          department: row.department ?? undefined,
          aisle: row.aisle ?? undefined,
          bay: row.bay ?? undefined,
          shelf: row.shelf ?? undefined,
          section: row.section ?? undefined,
          displayLocation: row.display_location ?? undefined,
        }
      : null,
    inventory: {
      status: capabilities.inventorySupported
        ? (STATUS_MAP[row.availability ?? ''] ?? 'unknown')
        : 'unknown',
    },
    price:
      capabilities.pricingSupported && row.price_cents != null
        ? {
            regular: row.price_cents / 100,
            sale: row.sale_price_cents != null ? row.sale_price_cents / 100 : undefined,
            currency: 'USD',
          }
        : undefined,
    source: {
      type: options.mock
        ? 'mock'
        : toTrustedSourceType(row.data_source, row.verification_status),
      provider: options.provider,
      verified:
        row.verification_status === 'VERIFIED' ||
        row.verification_status === 'COMMUNITY_VERIFIED',
      updatedAt: row.updated_at ?? undefined,
    },
    capabilities,
  };
}

/** Tier label for telemetry, from the ranking score search_products returns. */
export function tierFromScore(score: number): string {
  if (score >= 500) return 'EXACT';
  if (score >= 400) return 'PREFIX';
  if (score >= 370) return 'ALIAS';
  if (score >= 340) return 'PREFIX';
  if (score >= 330) return 'ALIAS';
  if (score >= 250) return 'TOKENS';
  if (score >= 220) return 'FTS';
  return 'FUZZY';
}
