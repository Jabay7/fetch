# Retailer integrations — verified status

**Last verified: 7 August 2026.** Every status below was checked against the
retailer's own developer portal, API reference, or terms of service. Where a
page was behind a login wall the entry says so rather than guessing.

## The finding that shapes the product

**No US retailer sells aisle, bay, shelf, or planogram data through a public
API — with exactly one exception, Kroger.**

Lowe's, Home Depot, Target, Albertsons and Meijer all ship aisle location in
their *own* consumer apps. None of them publishes it. Lowe's has run in-store
product location since 2013 ([press release](https://corporate.lowes.com/newsroom/press-releases/lowes-introduces-product-locator-mobile-technology-make-shopping-easier-11-27-13))
and exposes no endpoint for it.

So aisle coverage can only grow three ways, and the product is built around all
three: the Kroger API, store-managed imports, and reviewed community
corrections. It cannot be bought off a developer portal.

## Two kinds of coverage, deliberately separate

**Directory coverage** (is this store discoverable?) is independent of
**product coverage** (can we tell you the aisle?). A store is never hidden
because no retailer shares its data — it appears with a "Directory only" chip
and an honest screen offering the retailer's own site. It never shows a
guessed aisle.

## Status matrix

| Retailer | Status | Aisle | Stock | Price | Images | Catalog |
| --- | --- | --- | --- | --- | --- | --- |
| **Kroger** (+ banners) | **LIVE** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Best Buy** | **READY TO IMPLEMENT** | ❌ | ✅ per store | ✅ | ✅ | ✅ |
| **Walgreens** | **APPLICATION REQUIRED** | ❌ | ✅ qty only | ❌ | ❌ | ❌ |
| **Walmart** | **APPLICATION REQUIRED** ⚠️ | ❌ | coarse | ✅ | ✅ | ✅ |
| **CVS** | **PARTNERSHIP REQUIRED** | ❌ | — | — | — | locator only |
| Target | **NO VERIFIED INTEGRATION** | ❌ | ❌ | ❌ | ❌ | ❌ |
| Lowe's | **NO VERIFIED INTEGRATION** | ❌ | ❌ | ❌ | ❌ | ❌ |
| Home Depot | **NO VERIFIED INTEGRATION** | ❌ | ❌ | ❌ | ❌ | ❌ |
| Meijer | **NO VERIFIED INTEGRATION** | ❌ | ❌ | ❌ | ❌ | ❌ |
| Ace Hardware | **NO VERIFIED INTEGRATION** | ❌ | ❌ | ❌ | ❌ | ❌ |
| Albertsons / Safeway | **NO VERIFIED INTEGRATION** | ❌ | ❌ | ❌ | ❌ | ❌ |
| Aldi, Costco, Sam's Club, Menards, Petco, Whole Foods | **DIRECTORY ONLY** | ❌ | ❌ | ❌ | ❌ | ❌ |

Everything not listed is **DIRECTORY ONLY**: discoverable from the open store
directory, with no product data and no invented fields.

---

## LIVE

### Kroger — the only aisle integration that exists

[Products API](https://developer-ce.kroger.com/api-products/api/product-api-public) ·
[Locations API](https://developer-ce.kroger.com/api-products/api/location-api-public)

Free self-service OAuth2 client-credentials registration. `aisleLocations`,
`stockLevel`, `filter.locationId`, images. 10,000 product calls/day; 1,600
location calls/day/endpoint.

Covers the Kroger banner family — Mariano's, Ralphs, Fred Meyer, King Soopers,
Fry's, Smith's, QFC, Harris Teeter, Dillons and others. Because shoppers search
the parent brand, `retailers.parent_company` maps every banner to Kroger so
"kroger" finds them.

Aisle values are copied verbatim from `aisleLocations[0]`; when the field is
absent it stays absent and the UI shows "Aisle info unavailable".

---

## READY TO IMPLEMENT

### Best Buy — self-service, instant key, no aisles

[developer.bestbuy.com/apis](https://developer.bestbuy.com/apis) ·
[terms](https://developer.bestbuy.com/legal) (updated 23 Feb 2021)

The only other genuinely self-service platform of the ten checked. Email-based
API key issued immediately. `api.bestbuy.com/v1/` gives Products, Stores and
Categories, plus true per-SKU per-store availability at
`/v1/products/{sku}/stores.json?postalCode=`, with `salePrice`,
`regularPrice` and image fields.

Two terms that constrain the design, both accommodated by our schema:

- **72-hour hard caching ceiling.** Our `last_verified_at` and freshness job
  already expire rows; the Best Buy adapter must set a 72h TTL, not the
  default 48h.
- **Mandatory logo placement** on any screen where the API has a presence.

Its Stores schema is fully published and has no aisle field. Note the
`location` attribute is a decoy — it is defined as Express Kiosk
identification, not an in-store location.

**Recommendation: this is the next integration to build.** It adds real
per-store stock, price and images across ~1,000 US stores with no approval
gate, and it is the honest way to widen product coverage beyond Kroger.

---

## APPLICATION REQUIRED

### Walgreens — real, but no bridge to a UPC catalog

[developer.walgreens.com](https://developer.walgreens.com/) ·
[API License Agreement, rev. 27 Feb 2015](https://developer.walgreens.com/sites/default/files/Developer-Program-API-License-Agreement.pdf)

Registration is self-service; **production launch is explicitly subject to
Walgreens approval**. Sandbox `services-qa.walgreens.com`, production
`services.walgreens.com`. Auth is an API key + affiliate ID passed in the JSON
body, not headers. No OAuth2.

Usable pieces: **Store Locator** (`POST /api/stores/search/v2`, 500 req/min)
and **Store Inventory** (`POST /api/products/inventory/v4`), which returns
only `{id, s, q, ut}` — product article id, store number, quantity, update
time.

**Two blockers, honestly stated:**

1. **No catalog or search API exists**, and the identifiers returned are
   opaque "Product Article IDs" with no documented mapping to UPC. Our catalog
   is UPC-keyed by design, so without a partner-supplied crosswalk the
   inventory numbers cannot be attached to products.
2. The inventory documentation is internally inconsistent — the prose says it
   checks "the specified items" but the request body has no item parameter.

Terms are the most permissive of the ten: no caching clause, no
competing-app clause. Attribution is required where specified.

**Verdict: apply, but expect stock-only capability.** No aisle, no price, no
images.

### Walmart — approval-gated, and the sharpest legal risk

[walmart.io](https://walmart.io/apirefservices) ·
[terms](https://www.walmart.io/termsandcondition)
(`developer.walmartlabs.com` is dead — NXDOMAIN)

RSA-signed requests plus an Impact Radius publisher ID, 5,000 calls/day. No
aisle field. Store-scoped lookup exists but `storeId` requires "additional
approvals from business team".

⚠️ **Its terms forbid redistributing API product information "to any third
party partner, network or agency" and name Target and Best Buy among
prohibited competitor destinations.** A multi-retailer locator arguably runs
into this. **Do not build this integration without written clarification from
`affilops@wal-mart.com`.**

---

## PARTNERSHIP REQUIRED

### CVS

[developer.cvshealth.com](https://developer.cvshealth.com/apis) is live but
**invite-only** — the help page states verbatim that it is invite only. Auth
is OAuth2 client_credentials over mutual TLS plus an `x-memberToken`. The
45-product catalog is pharmacy/PBM; the only retail-relevant item is a store
locator.

*Caveat:* every spec page redirects to `/403` without a login, so the "no
aisle" conclusion rests on catalog scope rather than a field list.

---

## NO VERIFIED INTEGRATION

| Retailer | What was actually found |
| --- | --- |
| **Target** | `developer.target.com` is a pure login wall — two buttons, no public catalog, no self-service registration. The affiliate program is tracking links only. `redsky.target.com` is internal and undocumented, so it does not count. |
| **Lowe's** | `portal.apim.lowes.com` is live and Lowe's-branded but its public catalog renders "No APIs found"; `/signup` has no registration fields. Lowe's own usage guide shows exactly one product, **IMS-Basic** (installation management), plus one labelled **"Lowes Internal"**. Not a consumer-data program. |
| **Home Depot** | `developer.homedepot.com` and `apis.homedepot.com` both **NXDOMAIN** — the hosts no longer exist. Site terms explicitly prohibit extracting or scraping for resale. |
| **Meijer** | `developer.meijer.com` is NXDOMAIN. Two live Azure portals both state you must already have a Meijer Active Directory account. |
| **Ace Hardware** | No developer portal (NXDOMAIN). The affiliate FAQ offers no data feed. (`acehardware.com/brands/api` is a false positive — "API" is a livestock brand.) |
| **Albertsons / Safeway** | No developer portal. The only announced API is advertising measurement. Terms §18(c) is the most hostile of the ten: it names store locations and product listings as prohibited absent a written agreement, and §18(d) names "apps" among prohibited automated systems. |

**None of these will be scraped.** Third-party "APIs" for closed retailers are
scrapers that violate terms of service and are never used.

---

## Store directory sources

Directory coverage is independent of any retailer relationship.

| Source | License | Notes |
| --- | --- | --- |
| Kroger Locations API | Retailer terms | Official, highest source priority |
| OpenStreetMap | **ODbL** — share-alike, attributed | Current directory backbone |
| Overture Maps Places | **CDLA-Permissive-2.0 / Apache-2.0** — no share-alike | Migration target, see below |
| Store-managed imports | Supplied by the store | Highest trust after retailer APIs |

### Overture Places migration (planned)

Verified against release `2026-07-22.0`, schema `v1.18.0`.

Overture Places is **not ODbL** — it contains no OpenStreetMap data and carries
none of the share-alike obligations. 74.2M places, 11.25 GB of GeoParquet,
discoverable through the [STAC catalog](https://stac.overturemaps.org/catalog.json)
so the release is never hard-coded.

Three things to get right when building the importer:

1. **Do not build against `categories`.** It is deprecated and removed in the
   September 2026 release. Use `taxonomy.hierarchy`, `taxonomy.primary` and
   `basic_category`. Note `taxonomy.alternates` is plural where the deprecated
   `categories.alternate` was singular.
2. **`operating_status` is 92.8% NULL** — NULL does not mean open. Filter as
   `operating_status IS DISTINCT FROM 'permanently_closed'` and use
   `confidence >= 0.6` as the real liveness signal. The documented 0.2 floor is
   *not* actually enforced upstream (3.5% of rows sit below it).
3. **Keep Overture and OSM rows separately attributed.** Joining CDLA data to
   OpenStreetMap can pull ODbL onto a derivative database. Per-row `source`,
   `source_attribution` and licence provenance already exist for this reason.

Expect one-time GERS id churn across the 2026-06 → 2026-07 boundary; the July
release re-matched the whole corpus.

---

## Authorized ingestion methods

Each maps to `provider_integrations.kind`:

| Kind | Path into the schema |
| --- | --- |
| `RETAILER_API` | Edge Function adapter → normalize → upsert, `data_source='RETAILER_API'` |
| `PARTNER_FEED` | Scheduled fetch of a retailer-provided feed → same upsert path |
| `LICENSED_DATASET` | Batch load under licence terms |
| `STORE_MANAGED` | Store staff maintain data via the portal |
| `CSV_IMPORT` | Upload → staging → validation → upsert (`docs/ADMIN.md`) |

Community corrections are **not** an ingestion kind. They land in
`location_corrections` as `PENDING` and only reach `product_locations` when a
reviewer approves them, as `data_source='COMMUNITY_VERIFIED'`.

## Priority order

1. **Best Buy** — self-service, no approval gate, real per-store stock and
   price. The highest-value work available today.
2. **Store-managed imports** — the realistic wedge for independent and
   regional chains; needs no external approval.
3. **Walgreens** — apply, but scope expectations to stock-only and resolve the
   UPC bridge before building.
4. **Community corrections** — the only path to aisle data for the retailers
   that publish none.
5. **Walmart** — blocked pending written clarification of the redistribution
   clause.
