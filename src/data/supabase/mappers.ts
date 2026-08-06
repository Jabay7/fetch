/**
 * Row → domain mapping for the Supabase RPCs. Kept pure so it is unit
 * tested without a client; unknown availability strings degrade to
 * 'UNKNOWN' rather than crashing the UI.
 */

import type {
  Availability,
  ProductDetails,
  ProductHit,
  ProductLocation,
  Store,
} from '../types';

export interface ProductSearchRow {
  product_id: string;
  name: string;
  brand: string | null;
  size_text: string | null;
  image_url: string | null;
  availability: string | null;
  aisle: string | null;
  bay: string | null;
  shelf: string | null;
  section: string | null;
  department: string | null;
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
  address_line: string;
  city: string;
  state: string;
  zip: string;
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

export function rowToStore(row: StoreDbRow): Store {
  return {
    id: row.id,
    name: row.name,
    chain: row.chain ?? undefined,
    addressLine: row.address_line,
    city: row.city,
    state: row.state,
    zip: row.zip,
  };
}
