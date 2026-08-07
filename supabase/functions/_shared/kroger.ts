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

const KROGER_API = 'https://api.kroger.com/v1';

/** Kroger banner chains → our retailer slugs (see the seeded matrix). */
const CHAIN_TO_SLUG: Record<string, string> = {
  MARIANOS: 'marianos',
  "MARIANO'S": 'marianos',
};

export const KROGER_RETAILER_SLUGS = ['kroger', 'marianos'];

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
    name: location.name,
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

function frontImageUrl(product: KrogerProduct): string | undefined {
  const front =
    product.images?.find((img) => img.perspective === 'front') ?? product.images?.[0];
  const medium =
    front?.sizes?.find((s) => s.size === 'medium') ?? front?.sizes?.[0];
  return medium?.url;
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
      image_url: frontImageUrl(product),
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
}

interface TokenState {
  accessToken: string;
  expiresAt: number;
}

export class KrogerClient {
  private token: TokenState | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(
    private readonly credentials: KrogerCredentials,
    options: KrogerClientOptions = {}
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => Date.now());
  }

  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now() + 60_000) {
      return this.token.accessToken;
    }
    const basic = btoa(`${this.credentials.clientId}:${this.credentials.clientSecret}`);
    const response = await this.fetchImpl(`${KROGER_API}/connect/oauth2/token`, {
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
    const response = await this.fetchImpl(`${KROGER_API}${path}`, {
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
