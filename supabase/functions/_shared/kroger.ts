/**
 * Kroger Products/Locations API adapter — the first real retailer
 * integration. Kroger is the only major US retailer whose official public
 * API exposes per-store aisle locations (docs/RETAILER-INTEGRATIONS.md);
 * registration is free and self-service at developer.kroger.com.
 *
 * Pure TypeScript with an injectable fetch, so the mapping and client logic
 * are Jest-tested; the Edge Functions pass the real fetch. Every mapped
 * value flows into the same NormalizedImportRow → apply_catalog_import
 * path used by CSV imports, so Kroger data lands in the database with
 * source RETAILER_API and the app renders it through the existing
 * trusted-result pipeline — no separate code path invents anything.
 */

import type { NormalizedImportRow } from './catalog-import-core.ts';

const DEFAULT_KROGER_API = 'https://api.kroger.com/v1';

/**
 * Kroger banner chains → our retailer slugs.
 *
 * Kroger trades under many regional banners and the Locations API returns the
 * banner in `chain` as a terse uppercase code. Every one of these is covered by
 * the same Products API credentials, so each maps to a retailer that inherits
 * full aisle/price/stock capability. Codes confirmed against live API
 * responses; unknown codes fall back to the parent Kroger retailer rather than
 * being dropped.
 */
const CHAIN_TO_SLUG: Record<string, string> = {
  KROGER: 'kroger',
  MARIANOS: 'marianos',
  "MARIANO'S": 'marianos',
  RALPHS: 'ralphs',
  KINGSOOPERS: 'king-soopers',
  FRED: 'fred-meyer',
  FREDMEYER: 'fred-meyer',
  HART: 'harris-teeter',
  HARRISTEETER: 'harris-teeter',
  QFC: 'qfc',
  SMITHS: 'smiths',
  FOOD4LESS: 'food-4-less',
  FOODSCO: 'food-4-less',
  DILLONS: 'dillons',
  JAYC: 'jay-c',
  CITYMARKET: 'city-market',
  RULER: 'ruler-foods',
  PAYLESS: 'payless-super',
  FRYS: 'frys-food',
  PICKNSAVE: 'pick-n-save',
  METROMARKET: 'metro-market',
  BAKERS: 'baker-s',
  GERBES: 'gerbes',
  OWENS: 'owens-market',
};

/** Retailer slugs the Kroger Products API can answer for. */
export const KROGER_RETAILER_SLUGS = Array.from(new Set(Object.values(CHAIN_TO_SLUG)));

export function chainToRetailerSlug(chain: string | undefined): string {
  if (!chain) return 'kroger';
  return CHAIN_TO_SLUG[chain.toUpperCase().trim()] ?? 'kroger';
}

// ---------------------------------------------------------------------------
// API response shapes (documented public API; only fields we read)
// ---------------------------------------------------------------------------

export interface KrogerLocation {
  locationId: string;
  chain?: string;
  name?: string;
  phone?: string;
  address?: {
    addressLine1?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  geolocation?: { latitude?: number; longitude?: number };
}

export interface KrogerAisleLocation {
  description?: string;
  number?: string;
  side?: string;
  shelfNumber?: string;
  bayNumber?: string;
}

export interface KrogerProduct {
  productId?: string;
  upc?: string;
  description?: string;
  brand?: string;
  categories?: string[];
  items?: {
    size?: string;
    price?: { regular?: number; promo?: number };
    inventory?: { stockLevel?: string };
  }[];
  aisleLocations?: KrogerAisleLocation[];
  images?: { perspective?: string; sizes?: { size?: string; url?: string }[] }[];
}

// ---------------------------------------------------------------------------
// Mapping (pure)
// ---------------------------------------------------------------------------

export interface MappedStore {
  retailer_slug: string;
  provider_store_id: string;
  store_number: string;
  name: string;
  address_line: string;
  city: string;
  state: string;
  zip: string;
  phone?: string;
  latitude?: number;
  longitude?: number;
}

/** Kroger names arrive as "Marianos - Marianos Des Plaines"; keep the tail. */
export function cleanStoreName(name: string): string {
  const parts = name.split(' - ');
  return (parts.length > 1 ? parts[parts.length - 1] : name).trim();
}

export function mapKrogerLocation(location: KrogerLocation): MappedStore | null {
  if (!location.locationId || !location.name) return null;
  const address = location.address ?? {};
  if (!address.addressLine1 || !address.city || !address.state || !address.zipCode) {
    return null;
  }
  return {
    retailer_slug: chainToRetailerSlug(location.chain),
    provider_store_id: location.locationId,
    store_number: location.locationId,
    name: cleanStoreName(location.name),
    address_line: address.addressLine1,
    city: address.city,
    state: address.state,
    zip: address.zipCode,
    phone: location.phone,
    latitude: location.geolocation?.latitude,
    longitude: location.geolocation?.longitude,
  };
}

const STOCK_MAP: Record<string, NonNullable<NormalizedImportRow['inventory_status']>> = {
  HIGH: 'IN_STOCK',
  LOW: 'LOW_STOCK',
  TEMPORARILY_OUT_OF_STOCK: 'OUT_OF_STOCK',
};

/**
 * Kroger publishes several sizes per image; capture the ones we can use so
 * a 48px row downloads a thumbnail rather than a full-size product shot.
 */
function frontImages(product: KrogerProduct): {
  image_url?: string;
  thumbnail_url?: string;
  medium_image_url?: string;
  large_image_url?: string;
} {
  const front =
    product.images?.find((img) => img.perspective === 'front') ?? product.images?.[0];
  const sizes = front?.sizes ?? [];
  const bySize = (name: string) => sizes.find((s) => s.size === name)?.url;
  const thumbnail = bySize('thumbnail') ?? bySize('small');
  const medium = bySize('medium');
  const large = bySize('large') ?? bySize('xlarge');
  return {
    image_url: medium ?? large ?? thumbnail ?? sizes[0]?.url,
    thumbnail_url: thumbnail,
    medium_image_url: medium,
    large_image_url: large,
  };
}

/**
 * Kroger product → normalized import row for one store. Location fields are
 * copied verbatim from aisleLocations[0]; absent aisle data stays absent
 * ("Aisle unavailable" in the app) — never inferred.
 */
export function mapKrogerProduct(
  product: KrogerProduct,
  store: { retailer_slug: string; provider_store_id: string }
): NormalizedImportRow | null {
  const name = product.description?.trim();
  if (!name || !product.productId) return null;

  const item = product.items?.[0];
  const aisle = product.aisleLocations?.[0];
  const stockLevel = item?.inventory?.stockLevel?.toUpperCase();

  const regular = item?.price?.regular;
  const promo = item?.price?.promo;

  const hasAisleData = Boolean(
    aisle && (aisle.number || aisle.description || aisle.bayNumber || aisle.shelfNumber)
  );

  return {
    retailer_slug: store.retailer_slug,
    provider_store_id: store.provider_store_id,
    product: {
      name,
      brand: product.brand?.trim() || undefined,
      category: product.categories?.[0],
      size: item?.size,
      upc: product.upc,
      ...frontImages(product),
      image_source: 'kroger-api',
      image_source_type: 'RETAILER_API',
    },
    provider_product_id: product.productId,
    retailer_sku: product.upc,
    location: hasAisleData
      ? {
          aisle: aisle?.number ?? undefined,
          bay: aisle?.bayNumber ?? undefined,
          shelf: aisle?.shelfNumber ?? undefined,
          display_location: aisle?.description ?? undefined,
          department: product.categories?.[0],
          section: product.categories?.[0],
        }
      : undefined,
    inventory_status: stockLevel ? (STOCK_MAP[stockLevel] ?? 'UNKNOWN') : undefined,
    price:
      regular != null && regular > 0
        ? {
            regular_cents: Math.round(regular * 100),
            sale_cents: promo != null && promo > 0 ? Math.round(promo * 100) : undefined,
            currency: 'USD',
          }
        : undefined,
    source: 'RETAILER_API',
    source_provider: 'kroger-api',
  };
}

// ---------------------------------------------------------------------------
// API client (thin; fetch injectable for tests)
// ---------------------------------------------------------------------------

export interface KrogerCredentials {
  clientId: string;
  clientSecret: string;
}

export interface KrogerClientOptions {
  fetchImpl?: typeof fetch;
  /** Injected for tests; defaults to Date.now. */
  now?: () => number;
  /** Override for Kroger's certification environment (api-ce.kroger.com). */
  baseUrl?: string;
}

interface TokenState {
  accessToken: string;
  expiresAt: number;
}

export class KrogerClient {
  private token: TokenState | null = null;
  private readonly credentials: KrogerCredentials;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly baseUrl: string;

  // Written as an explicit field assignment rather than a parameter property:
  // Node's type-stripping loader runs this file directly for the import
  // scripts, and it rejects parameter properties.
  constructor(credentials: KrogerCredentials, options: KrogerClientOptions = {}) {
    this.credentials = credentials;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => Date.now());
    this.baseUrl = options.baseUrl ?? DEFAULT_KROGER_API;
  }

  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now() + 60_000) {
      return this.token.accessToken;
    }
    const basic = btoa(`${this.credentials.clientId}:${this.credentials.clientSecret}`);
    const response = await this.fetchImpl(`${this.baseUrl}/connect/oauth2/token`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${basic}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials&scope=product.compact',
    });
    if (!response.ok) {
      throw new Error(`kroger token request failed: ${response.status}`);
    }
    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.token = {
      accessToken: body.access_token,
      expiresAt: this.now() + body.expires_in * 1000,
    };
    return this.token.accessToken;
  }

  private async get<T>(path: string): Promise<T> {
    const token = await this.getToken();
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`kroger ${path.split('?')[0]} failed: ${response.status}`);
    }
    return (await response.json()) as T;
  }

  /** Stores near a ZIP code. */
  async locationsByZip(zip: string, limit = 10): Promise<KrogerLocation[]> {
    const body = await this.get<{ data?: KrogerLocation[] }>(
      `/locations?filter.zipCode.near=${encodeURIComponent(zip)}&filter.limit=${limit}`
    );
    return body.data ?? [];
  }

  /**
   * Stores near a coordinate. Used for systematic nationwide enumeration,
   * where a lat/long grid gives even coverage that a ZIP list cannot —
   * ZIP density tracks population, so a ZIP-driven sweep over-queries cities
   * and misses rural stores entirely.
   */
  async locationsNear(
    latitude: number,
    longitude: number,
    radiusMiles = 100,
    limit = 200
  ): Promise<KrogerLocation[]> {
    const params = new URLSearchParams({
      'filter.latLong.near': `${latitude},${longitude}`,
      'filter.radiusInMiles': String(radiusMiles),
      'filter.limit': String(limit),
    });
    const body = await this.get<{ data?: KrogerLocation[] }>(`/locations?${params}`);
    return body.data ?? [];
  }

  /** Term search at one store; includes aisleLocations, stock, price. */
  async searchProducts(
    locationId: string,
    term: string,
    limit = 20
  ): Promise<KrogerProduct[]> {
    const params = new URLSearchParams({
      'filter.term': term,
      'filter.locationId': locationId,
      'filter.limit': String(Math.min(Math.max(limit, 1), 50)),
    });
    const body = await this.get<{ data?: KrogerProduct[] }>(`/products?${params}`);
    return body.data ?? [];
  }
}

/** True when a store-picker query is a US ZIP we can send to Kroger. */
export function isZipQuery(term: string): boolean {
  return /^\d{5}$/.test(term.trim());
}
