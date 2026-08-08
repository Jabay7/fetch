/**
 * Row → domain mapping for the Supabase RPCs. Kept pure so it is unit
 * tested without a client; unknown enum strings degrade to 'UNKNOWN'
 * rather than crashing the UI.
 */

import type {
  Availability,
  DataSource,
  ProductDetails,
  ProductHit,
  ProductLocation,
  RetailerIntegrationStatus,
  Store,
  StoreCapabilities,
  StoreSupportTier,
  VerificationStatus,
} from '../types';

export interface ProductSearchRow {
  product_id: string;
  name: string;
  brand: string | null;
  size_text: string | null;
  image_url: string | null;
  thumbnail_url?: string | null;
  medium_image_url?: string | null;
  large_image_url?: string | null;
  availability: string | null;
  price_cents: number | null;
  sale_price_cents?: number | null;
  aisle: string | null;
  bay: string | null;
  shelf: string | null;
  section: string | null;
  department: string | null;
  display_location?: string | null;
  data_source: string | null;
  verification_status?: string | null;
  updated_at: string | null;
}

export interface ProductDetailsRow extends ProductSearchRow {
  description: string | null;
  upc: string | null;
}

export interface StoreDbRow {
  id: string;
  name: string;
  chain: string | null;
  retailer_id: string | null;
  retailer_name: string | null;
  retailer_slug?: string | null;
  retailer_integration_status?: string | null;
  retailer_website_url?: string | null;
  address_line: string;
  city: string;
  state: string;
  zip: string;
  source?: string | null;
  distance_miles?: number | null;
  support_tier?: string | null;
  product_count?: number | null;
  aisle_location_count?: number | null;
  community_location_count?: number | null;
  cap_aisle_data: boolean | null;
  cap_inventory: boolean | null;
  cap_pricing: boolean | null;
  cap_product_images: boolean | null;
  cap_store_map: boolean | null;
  cap_realtime: boolean | null;
  cap_product_search?: boolean | null;
  cap_department_data?: boolean | null;
  cap_last_synced_at: string | null;
  cap_last_verified_at?: string | null;
}

const AVAILABILITY_VALUES: readonly Availability[] = [
  'IN_STOCK',
  'LOW_STOCK',
  'OUT_OF_STOCK',
  'UNKNOWN',
];

export function toAvailability(raw: string | null | undefined): Availability {
  return AVAILABILITY_VALUES.includes(raw as Availability)
    ? (raw as Availability)
    : 'UNKNOWN';
}

const DATA_SOURCE_VALUES: readonly DataSource[] = [
  'RETAILER_API',
  'AUTHORIZED_FEED',
  'STORE_MANAGED',
  'COMMUNITY_VERIFIED',
  'UNKNOWN',
];

export function toDataSource(raw: string | null | undefined): DataSource | undefined {
  if (raw == null) return undefined;
  return DATA_SOURCE_VALUES.includes(raw as DataSource)
    ? (raw as DataSource)
    : 'UNKNOWN';
}

const VERIFICATION_VALUES: readonly VerificationStatus[] = [
  'UNVERIFIED',
  'VERIFIED',
  'COMMUNITY_VERIFIED',
];

export function toVerificationStatus(
  raw: string | null | undefined
): VerificationStatus | undefined {
  return VERIFICATION_VALUES.includes(raw as VerificationStatus)
    ? (raw as VerificationStatus)
    : undefined;
}

const INTEGRATION_STATUSES: readonly RetailerIntegrationStatus[] = [
  'live',
  'development',
  'partnership_required',
  'import_supported',
  'directory_only',
  'unsupported',
  'temporarily_unavailable',
];

export function toIntegrationStatus(
  raw: string | null | undefined
): RetailerIntegrationStatus | undefined {
  return INTEGRATION_STATUSES.includes(raw as RetailerIntegrationStatus)
    ? (raw as RetailerIntegrationStatus)
    : undefined;
}

function toLocation(row: ProductSearchRow): ProductLocation | undefined {
  if (
    !row.aisle &&
    !row.bay &&
    !row.shelf &&
    !row.section &&
    !row.department &&
    !row.display_location
  ) {
    return undefined;
  }
  return {
    aisle: row.aisle ?? undefined,
    bay: row.bay ?? undefined,
    shelf: row.shelf ?? undefined,
    section: row.section ?? undefined,
    department: row.department ?? undefined,
    displayLocation: row.display_location ?? undefined,
    dataSource: toDataSource(row.data_source),
    verificationStatus: toVerificationStatus(row.verification_status),
  };
}

export function rowToProductHit(row: ProductSearchRow): ProductHit {
  return {
    id: row.product_id,
    name: row.name,
    brand: row.brand ?? undefined,
    sizeText: row.size_text ?? undefined,
    imageUrl: row.image_url ?? undefined,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    mediumImageUrl: row.medium_image_url ?? undefined,
    largeImageUrl: row.large_image_url ?? undefined,
    availability: toAvailability(row.availability),
    priceCents: row.price_cents ?? undefined,
    salePriceCents: row.sale_price_cents ?? undefined,
    location: toLocation(row),
    updatedAt: row.updated_at ?? undefined,
  };
}

/**
 * TrustedProductResult (product-search-assistant Edge Function response) →
 * ProductHit. Facts map 1:1 from the function's database-built fields; the
 * source label maps back onto DataSource + VerificationStatus.
 */
export interface TrustedResultDto {
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
  inventory: { status: string };
  price?: { regular?: number; sale?: number; currency: string };
  source: { type: string; verified: boolean; updatedAt?: string };
}

const TRUSTED_SOURCE_TO_DATA_SOURCE: Record<string, DataSource> = {
  official_retailer_api: 'RETAILER_API',
  authorized_feed: 'AUTHORIZED_FEED',
  store_import: 'STORE_MANAGED',
  verified_database: 'STORE_MANAGED',
  community_verified: 'COMMUNITY_VERIFIED',
  mock: 'UNKNOWN',
};

const TRUSTED_STATUS_TO_AVAILABILITY: Record<string, Availability> = {
  in_stock: 'IN_STOCK',
  low_stock: 'LOW_STOCK',
  out_of_stock: 'OUT_OF_STOCK',
  unknown: 'UNKNOWN',
};

export function trustedResultToHit(dto: TrustedResultDto): ProductHit {
  const dataSource = TRUSTED_SOURCE_TO_DATA_SOURCE[dto.source.type] ?? 'UNKNOWN';
  const verificationStatus: VerificationStatus | undefined =
    dto.source.type === 'community_verified'
      ? 'COMMUNITY_VERIFIED'
      : dto.source.verified
        ? 'VERIFIED'
        : undefined;
  return {
    id: dto.product.id,
    name: dto.product.name,
    brand: dto.product.brand,
    sizeText: dto.product.size,
    imageUrl: dto.product.imageUrl,
    availability: TRUSTED_STATUS_TO_AVAILABILITY[dto.inventory.status] ?? 'UNKNOWN',
    priceCents:
      dto.price?.regular != null ? Math.round(dto.price.regular * 100) : undefined,
    salePriceCents:
      dto.price?.sale != null ? Math.round(dto.price.sale * 100) : undefined,
    location: dto.location
      ? {
          aisle: dto.location.aisle,
          bay: dto.location.bay,
          shelf: dto.location.shelf,
          section: dto.location.section,
          department: dto.location.department,
          displayLocation: dto.location.displayLocation,
          dataSource,
          verificationStatus,
        }
      : undefined,
    updatedAt: dto.source.updatedAt,
  };
}

export function rowToProductDetails(row: ProductDetailsRow): ProductDetails {
  return {
    ...rowToProductHit(row),
    description: row.description ?? undefined,
    upc: row.upc ?? undefined,
  };
}

export function rowToCapabilities(row: StoreDbRow): StoreCapabilities {
  return {
    aisleData: row.cap_aisle_data ?? false,
    inventory: row.cap_inventory ?? false,
    pricing: row.cap_pricing ?? false,
    productImages: row.cap_product_images ?? false,
    storeMap: row.cap_store_map ?? false,
    realtime: row.cap_realtime ?? false,
    productSearch: row.cap_product_search ?? true,
    departmentData: row.cap_department_data ?? true,
    lastSyncedAt: row.cap_last_synced_at ?? undefined,
    lastVerifiedAt: row.cap_last_verified_at ?? undefined,
  };
}

const DIRECTORY_SOURCES = ['SEED', 'RETAILER_API', 'OSM', 'STORE_MANAGED', 'COMMUNITY'] as const;

export function rowToStore(row: StoreDbRow): Store {
  return {
    id: row.id,
    name: row.name,
    chain: row.chain ?? undefined,
    retailerId: row.retailer_id ?? undefined,
    retailerName: row.retailer_name ?? undefined,
    retailerSlug: row.retailer_slug ?? undefined,
    retailerIntegrationStatus: toIntegrationStatus(row.retailer_integration_status),
    retailerWebsiteUrl: row.retailer_website_url ?? undefined,
    capabilities: rowToCapabilities(row),
    addressLine: row.address_line,
    city: row.city,
    state: row.state,
    zip: row.zip,
    directorySource: DIRECTORY_SOURCES.includes(
      row.source as (typeof DIRECTORY_SOURCES)[number]
    )
      ? (row.source as Store['directorySource'])
      : undefined,
    distanceMiles: row.distance_miles ?? undefined,
    coverage: row.support_tier
      ? {
          tier: row.support_tier as StoreSupportTier,
          productCount: row.product_count ?? 0,
          aisleLocationCount: row.aisle_location_count ?? 0,
          communityLocationCount: row.community_location_count ?? 0,
        }
      : undefined,
  };
}
