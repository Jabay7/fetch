# Fetch API specification

Two layers: the in-app **provider interface** (what screens call) and the
**Supabase RPCs** (what the Supabase provider calls). Retailer adapters
implement the provider interface; they never get their own UI code paths.

## Provider interface (`src/data/types.ts`)

```ts
interface StoreDataProvider {
  kind: 'mock' | 'supabase' | 'kroger';
  searchStores(text?: string): Promise<Store[]>;
  getStore(storeId: string): Promise<Store | null>;
  searchProducts(storeId: string, term: string): Promise<ProductHit[]>;
  getProduct(storeId: string, productId: string): Promise<ProductDetails | null>;
  getDepartments(storeId: string): Promise<string[]>;
}
```

Contracts every implementation must honor:

- **Store scoping** — results for `storeId` never contain another store's
  location, availability, or price.
- **No invented data** — absent aisle → `location` undefined or partial;
  absent stock signal → `availability: 'UNKNOWN'`; absent price → no
  `priceCents`. The UI renders honest states for each.
- **Capability flags** — `Store.capabilities` declares what the integration
  provides; the UI renders only flagged features.
- **Provenance** — `location.dataSource` is one of `RETAILER_API`,
  `STORE_MANAGED`, `COMMUNITY_VERIFIED`, `UNKNOWN`. Community data is only
  ever `COMMUNITY_VERIFIED` (post-review); raw submissions never surface.
- Planned extensions (add to the interface, never ad hoc): `getRetailers()`,
  `getStoreMap(storeId)`, `getInventoryStatus(storeId, productId)`.

## Supabase RPCs (defined in `supabase/migrations/`)

All are `STABLE`, respect read-only RLS, validate/escape input, and are
granted to `anon` + `authenticated`. The app calls them via `supabase.rpc()`.

| RPC | Args | Returns |
| --- | --- | --- |
| `search_stores(p_term text default '')` | free text: name, city, address, ZIP, state, retailer | store rows + retailer + `cap_*` capability columns |
| `get_store(p_store_id uuid)` | store id | one store row (same shape) |
| `search_products(p_store_id uuid, p_term text, p_limit int default 25)` | store id + term (≥2 chars; wildcards escaped; limit clamped 1–50) | ranked product rows: identity, availability, `price_cents`, aisle/bay/shelf/section/department, `data_source`, `updated_at` |
| `get_product_at_store(p_store_id uuid, p_product_id uuid)` | ids | one row (search columns + `description`, `upc`); empty set = not carried |
| `get_departments(p_store_id uuid)` | store id | distinct section names |

Ranking tiers in `search_products` (identical to `src/data/ranking.ts` —
change both together): exact name 500 → name prefix 400 → word prefix 340 →
substring 280 → all tokens 250 → full-text 220 → trigram fuzzy 100+.
Synonyms/plurals expand client-side (`expandSearchTerms`); the provider
retries candidates in order until one returns rows.

Errors: providers log the technical detail with `console.warn` and throw a
user-safe message; TanStack Query retries once, then screens show an error
state with Retry.
