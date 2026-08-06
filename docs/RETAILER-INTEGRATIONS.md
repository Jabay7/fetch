# Retailer integration strategy

## Research conclusion (verified Aug 2026)

**Kroger is the only major US retailer with an official public API exposing
store-specific aisle locations and stock levels** — [Products API](https://developer-ce.kroger.com/api-products/api/product-api-public)
(`aisleLocations`, `stockLevel`, `filter.locationId`, 10,000 calls/day) and
[Locations API](https://developer-ce.kroger.com/api-products/api/location-api-public)
(store search by ZIP/lat-long, 1,600 calls/day/endpoint), free self-service
OAuth2 client-credentials registration.

Checked and unavailable: Target (partner-only; internal "redsky" API is
unauthorized), Walmart (affiliate catalog APIs, no aisle data), Home Depot
(no public program), Albertsons/Jewel-Osco (ad-measurement API only),
Best Buy (restricted keys, no aisles), Walgreens (official program with a
Store Inventory API — availability, no aisles), Instacart (shopping-list
handoffs, not a data feed). Third-party "APIs" for the closed retailers are
scrapers that violate terms of service — **never used**.

## Authorized ingestion methods

Each maps to `provider_integrations.kind`:

| Kind | Path into the schema |
| --- | --- |
| `RETAILER_API` | Adapter (Edge Function) → normalize → upsert products/store_products/product_locations, `data_source='RETAILER_API'` |
| `PARTNER_FEED` | Scheduled fetch of a retailer-provided feed → same upsert path |
| `LICENSED_DATASET` | Batch load under license terms |
| `STORE_MANAGED` | Store staff maintain data via the portal; `data_source='STORE_MANAGED'` |
| `CSV_IMPORT` | Spreadsheet upload → staging table → validation → upsert (see below) |

Community corrections are **not** an ingestion kind: they land in
`location_corrections` as `PENDING` and only reach `product_locations` when a
reviewer approves them (`data_source='COMMUNITY_VERIFIED'`).

## Kroger adapter design (first real integration)

1. Register (free) at developer.kroger.com; store `client_id`/`client_secret`
   with `supabase secrets set` — never in the app or repo.
2. Edge Function `kroger-proxy`: caches the client-credentials token
   (~30 min TTL), exposes `/stores?zip=` and `/search?locationId=&term=`,
   rate-limits per client, validates inputs with zod.
3. `krogerProvider` in the app implements `StoreDataProvider` against that
   function. Mapping: `stockLevel` HIGH→IN_STOCK, LOW→LOW_STOCK,
   TEMPORARILY_OUT_OF_STOCK→OUT_OF_STOCK, omitted→UNKNOWN;
   `aisleLocations[0]` → location; images[0] → `imageUrl`.
   Capabilities: aisle ✓ inventory ✓ pricing ✓ images ✓.
4. Kroger banners (Mariano's, Food 4 Less…) appear as `retailers` rows with
   per-store `store_capabilities`.

## CSV / spreadsheet import strategy

For store-managed chains: template columns `upc, name, brand, size,
department, section, aisle, bay, shelf, availability, price`. Pipeline:
upload → staging table → validation pass (UPC format, aisle exists or is
created, enum values) → row-level error report → upsert keyed on
(store, UPC) → `provider_sync_logs` entry with counts. Idempotent: re-running
an import updates rather than duplicates.

## Retailer administration portal (planned, not yet built)

Web app (Next.js + Supabase Auth) for retailer/store staff:

- Manage stores, capability flags, product imports, aisle assignments,
  inventory and price updates, store map uploads
- Review queue for `location_corrections` (approve → verified location)
- Sync dashboards over `provider_sync_logs`; anonymous search-trend reports
- **RBAC**: `retailer_admin` (all stores of retailer), `store_manager`
  (one store), `staff` (location edits only) via Supabase Auth + RLS on a
  `portal_members(user_id, retailer_id, store_id, role)` table
- **Audit**: every mutation writes an audit row (actor, before/after,
  timestamp); location changes additionally snapshot into
  `inventory_snapshots`/history tables

## Remaining partnerships / data access to pursue

1. **Kroger** — self-service; only engineering work remains (adapter above).
2. **Walgreens** — apply for API keys (Store Inventory + Locator);
   availability-only capability profile.
3. **Independent/regional chains** — the store-managed portal + CSV import
   is the product's realistic wedge; no external approval needed.
4. **Target / Walmart / Home Depot / Albertsons** — require partnership
   agreements; no public path today. Track via `store_support_requests`
   volume to prioritize outreach.
5. **Licensed datasets** (Datasembly-class planogram/availability feeds) —
   enterprise pricing; revisit at scale.
