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
  Store,
  StoreCapabilities,
} from '../types';

export interface ProductSearchRow {
  product_id: string;
  name: string;
  brand: string | null;
  size_text: string | null;
  image_url: string | null;
  availability: string | null;
  price_cents: number | null;
  aisle: string | null;
  bay: string | null;
  shelf: string | null;
  section: string | null;
  department: string | null;
  data_source: string | null;
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
  address_line: string;
  city: string;
  state: string;
  zip: string;
  cap_aisle_data: boolean | null;
  cap_inventory: boolean | null;
  cap_pricing: boolean | null;
  cap_product_images: boolean | null;
  cap_store_map: boolean | null;
  cap_realtime: boolean | null;
  cap_last_synced_at: string | null;
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

function toLocation(row: ProductSearchRow): ProductLocation | undefined {
  if (!row.aisle && !row.bay && !row.shelf && !row.section && !row.department) {
    return undefined;
  }
  return {
    aisle: row.aisle ?? undefined,
    bay: row.bay ?? undefined,
    shelf: row.shelf ?? undefined,
    section: row.section ?? undefined,
    department: row.department ?? undefined,
    dataSource: toDataSource(row.data_source),
  };
}

export function rowToProductHit(row: ProductSearchRow): ProductHit {
  return {
    id: row.product_id,
    name: row.name,
    brand: row.brand ?? undefined,
    sizeText: row.size_text ?? undefined,
    imageUrl: row.image_url ?? undefined,
    availability: toAvailability(row.availability),
    priceCents: row.price_cents ?? undefined,
    location: toLocation(row),
    updatedAt: row.updated_at ?? undefined,
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
    lastSyncedAt: row.cap_last_synced_at ?? undefined,
  };
}

export function rowToStore(row: StoreDbRow): Store {
  return {
    id: row.id,
    name: row.name,
    chain: row.chain ?? undefined,
    retailerId: row.retailer_id ?? undefined,
    retailerName: row.retailer_name ?? undefined,
    capabilities: rowToCapabilities(row),
    addressLine: row.address_line,
    city: row.city,
    state: row.state,
    zip: row.zip,
  };
}
