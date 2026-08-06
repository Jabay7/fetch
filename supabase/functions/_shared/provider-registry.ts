/**
 * Retailer-provider architecture: one typed interface every data source
 * implements (retailer APIs, authorized feeds, imported catalogs, mock),
 * plus a registry with routing, capability detection, health checks, and a
 * resilience wrapper (timeout, bounded retry, rate-limit awareness).
 *
 * Pure TypeScript — no Deno/Node APIs — so Edge Functions import it directly
 * and Jest tests it. Failures are VALUES (ProviderResult), never exceptions
 * escaping into callers: a provider failure can degrade a response but can
 * never crash the application.
 */

// ---------------------------------------------------------------------------
// Results and errors
// ---------------------------------------------------------------------------

export type ProviderErrorCode =
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'NOT_CONFIGURED'
  | 'INVALID_RESPONSE'
  | 'UPSTREAM_ERROR'
  | 'NOT_SUPPORTED';

export interface ProviderError {
  code: ProviderErrorCode;
  message: string;
  retryable: boolean;
}

export type ProviderResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ProviderError };

export const providerError = (
  code: ProviderErrorCode,
  message: string,
  retryable = false
): ProviderResult<never> => ({ ok: false, error: { code, message, retryable } });

// ---------------------------------------------------------------------------
// Domain shapes exchanged with providers (identifiers are provider-scoped)
// ---------------------------------------------------------------------------

export interface ProviderStore {
  providerStoreId: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
}

export interface ProviderProduct {
  providerProductId: string;
  name: string;
  brand?: string;
  size?: string;
  upc?: string;
  imageUrl?: string;
}

/** Location facts must come from the provider verbatim — never inferred. */
export interface ProviderLocation {
  department?: string;
  aisle?: string;
  bay?: string;
  shelf?: string;
  section?: string;
  displayLocation?: string;
}

export type ProviderInventoryStatus =
  | 'IN_STOCK'
  | 'LOW_STOCK'
  | 'OUT_OF_STOCK'
  | 'UNKNOWN';

export interface StoreCapabilityFlags {
  productSearch: boolean;
  aisleLocations: boolean;
  departments: boolean;
  inventory: boolean;
  pricing: boolean;
  storeMap: boolean;
}

export interface ProviderHealth {
  healthy: boolean;
  detail: string;
  checkedAt?: string;
}

export interface StoreSearchInput {
  text?: string;
  postalCode?: string;
  limit?: number;
}

export interface ProductSearchInput {
  providerStoreId: string;
  term: string;
  limit?: number;
}

export interface RetailerProvider {
  /** Registry slug, e.g. 'kroger-api'. */
  id: string;
  /** Retailer this provider serves; null for generic providers. */
  retailerId: string | null;

  searchStores(input: StoreSearchInput): Promise<ProviderResult<ProviderStore[]>>;
  getStore(providerStoreId: string): Promise<ProviderResult<ProviderStore | null>>;
  searchProducts(input: ProductSearchInput): Promise<ProviderResult<ProviderProduct[]>>;
  getProduct(
    providerStoreId: string,
    providerProductId: string
  ): Promise<ProviderResult<ProviderProduct | null>>;
  getProductLocation(
    providerStoreId: string,
    providerProductId: string
  ): Promise<ProviderResult<ProviderLocation | null>>;
  getInventory(
    providerStoreId: string,
    providerProductId: string
  ): Promise<ProviderResult<{ status: ProviderInventoryStatus; quantity?: number }>>;
  getCapabilities(providerStoreId: string): Promise<ProviderResult<StoreCapabilityFlags>>;
  healthCheck(): Promise<ProviderHealth>;
}

// ---------------------------------------------------------------------------
// Resilience wrapper
// ---------------------------------------------------------------------------

export interface ResilienceOptions {
  timeoutMs?: number;
  /** Total attempts = 1 + retries (retryable errors only). */
  retries?: number;
  /** Injected for tests; defaults to real timers. */
  sleep?: (ms: number) => Promise<void>;
  log?: (event: Record<string, unknown>) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run a provider call with a timeout and bounded retry. Exceptions thrown by
 * the underlying call become structured UPSTREAM_ERROR results; timeouts
 * become TIMEOUT; only errors marked retryable are retried.
 */
export async function callWithResilience<T>(
  label: string,
  fn: () => Promise<ProviderResult<T>>,
  options: ResilienceOptions = {}
): Promise<ProviderResult<T>> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const retries = options.retries ?? 1;
  const sleep = options.sleep ?? defaultSleep;
  const log = options.log ?? (() => {});

  let lastError: ProviderError = {
    code: 'UPSTREAM_ERROR',
    message: 'no attempts made',
    retryable: false,
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    const started = Date.now();
    try {
      const result = await withTimeout(fn(), timeoutMs);
      log({ label, attempt, ms: Date.now() - started, ok: result.ok });
      if (result.ok) return result;
      lastError = result.error;
      if (!result.error.retryable || attempt === retries) return result;
    } catch (error) {
      const isTimeout = error instanceof TimeoutError;
      lastError = {
        code: isTimeout ? 'TIMEOUT' : 'UPSTREAM_ERROR',
        message: error instanceof Error ? error.message : String(error),
        retryable: true,
      };
      log({ label, attempt, ms: Date.now() - started, ok: false, error: lastError.code });
      if (attempt === retries) return { ok: false, error: lastError };
    }
    await sleep(Math.min(2000, 250 * 2 ** attempt));
  }
  return { ok: false, error: lastError };
}

class TimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(`timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Response validation (providers lie; check before trusting)
// ---------------------------------------------------------------------------

export function validateProviderLocation(value: unknown): ProviderLocation | null {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const out: ProviderLocation = {};
  for (const key of ['department', 'aisle', 'bay', 'shelf', 'section', 'displayLocation'] as const) {
    const field = v[key];
    if (field !== undefined) {
      if (typeof field !== 'string' || field.length > 120) return null;
      if (field.trim() !== '') out[key] = field.trim();
    }
  }
  return out;
}

const INVENTORY_STATUSES: readonly ProviderInventoryStatus[] = [
  'IN_STOCK',
  'LOW_STOCK',
  'OUT_OF_STOCK',
  'UNKNOWN',
];

export function validateInventoryStatus(value: unknown): ProviderInventoryStatus {
  return INVENTORY_STATUSES.includes(value as ProviderInventoryStatus)
    ? (value as ProviderInventoryStatus)
    : 'UNKNOWN';
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class ProviderRegistry {
  private providers = new Map<string, RetailerProvider>();

  register(provider: RetailerProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`provider ${provider.id} already registered`);
    }
    this.providers.set(provider.id, provider);
  }

  get(id: string): RetailerProvider | undefined {
    return this.providers.get(id);
  }

  /** All providers able to serve a retailer (specific first, generic after). */
  forRetailer(retailerId: string): RetailerProvider[] {
    const all = [...this.providers.values()];
    return [
      ...all.filter((p) => p.retailerId === retailerId),
      ...all.filter((p) => p.retailerId === null),
    ];
  }

  list(): RetailerProvider[] {
    return [...this.providers.values()];
  }

  /** Health-check every provider; failures are reported, never thrown. */
  async healthReport(): Promise<Record<string, ProviderHealth>> {
    const report: Record<string, ProviderHealth> = {};
    for (const provider of this.providers.values()) {
      try {
        report[provider.id] = await provider.healthCheck();
      } catch (error) {
        report[provider.id] = {
          healthy: false,
          detail: error instanceof Error ? error.message : String(error),
        };
      }
    }
    return report;
  }
}

// ---------------------------------------------------------------------------
// TTL cache for provider responses (capabilities, store lookups)
// ---------------------------------------------------------------------------

export class TtlCache<T> {
  private entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(
    private ttlMs: number,
    private now: () => number = () => Date.now()
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  clear(): void {
    this.entries.clear();
  }
}

// ---------------------------------------------------------------------------
// Disabled-provider stub: honest placeholder for integrations that exist in
// the registry but have no credentials/agreement yet (e.g. Kroger before
// registration). Every data call reports NOT_CONFIGURED.
// ---------------------------------------------------------------------------

export function disabledProvider(
  id: string,
  retailerId: string | null,
  reason: string
): RetailerProvider {
  const notConfigured = async () => providerError('NOT_CONFIGURED', reason);
  return {
    id,
    retailerId,
    searchStores: notConfigured,
    getStore: notConfigured,
    searchProducts: notConfigured,
    getProduct: notConfigured,
    getProductLocation: notConfigured,
    getInventory: notConfigured,
    getCapabilities: notConfigured,
    healthCheck: async () => ({ healthy: false, detail: reason }),
  };
}
