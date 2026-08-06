# Fetch — in-store product locator

**Live web demo:** https://jabay7.github.io/fetch/ · Repo: https://github.com/Jabay7/fetch

Pick your store once, search any product, and get the exact **aisle, section,
availability, and price** for that store. Built with Expo + TypeScript + Expo
Router on a retailer-independent data layer, backed by Supabase Postgres, and
runs out of the box on a bundled demo catalog when no backend is configured.

**App shell:** Home · Search · Saved · Settings tabs, one-time onboarding,
store picker with favorites and recents, product details with save/share/report.

## Quick start

```bash
npm install
npm start          # then press a (Android), w (web), or scan the QR in Expo Go
```

No configuration needed — without Supabase env vars the app uses the built-in
demo catalog (two retailers, four Chicagoland stores). All flows work offline.

### Demo script

| Try this | You should see |
| --- | --- |
| First launch | 3-slide onboarding → store picker → Home |
| Choose **Schaumburg Main Store**, search `toothpaste` | **Colgate Total — Aisle G18 — Oral Care — In stock — $4.49** (plus Crest, Sensodyne, Tom's) |
| Misspell it: `toothpast`, `sensodine`, `toothpastes`, `tp`, `bandaids` | Same/synonym results — fuzzy, plural, and synonym matching |
| Filter chips: **In stock** / a department | Counts update live; friendly clear-filters state |
| Search `shampoo` | Pantene at **G12** but **Out of stock** |
| Search `paper towels` | Bounty **in stock** with **Aisle info unavailable** |
| Open Colgate → store badge → **Naperville West** | Same product now **Aisle 12**, Low stock, $4.39 — never another store's aisle |
| Switch to **Lakeview Drug Co — Clark St** | Departments-only store: no aisle badges, stock pills, or prices; explainer shown |
| Colgate at **Evanston Central** | Provenance line: **Community-verified** |
| Save Colgate → Saved tab → switch stores | Saved list re-resolves live per store ("Not carried" at Lakeview if applicable) |
| Star stores in the picker | Favorites pinned; quick-switch from Settings |

## Why there's no live retailer API in v1

Research finding (verified Aug 2026): **Kroger is the only major US retailer
with an official public API exposing store-specific aisle locations and stock
levels** ([Products API](https://developer-ce.kroger.com/api-products/api/product-api-public),
[Locations API](https://developer-ce.kroger.com/api-products/api/location-api-public);
free OAuth2 client-credentials, 10k calls/day). Target, Walmart, Home Depot,
and Albertsons/Jewel-Osco expose no public aisle data, and the third-party
"APIs" for them are scrapers that violate retailer terms — deliberately not
used. Full analysis and the integration roadmap:
[docs/RETAILER-INTEGRATIONS.md](docs/RETAILER-INTEGRATIONS.md).

So the app is built on a **retailer-independent provider interface** with a
store-managed catalog as the first real data path:

```
UI screens ──► StoreDataProvider (src/data/types.ts)
                 ├── mockProvider      (bundled demo catalog; default)
                 ├── supabaseProvider  (Postgres + SQL ranking; set env vars)
                 └── krogerProvider    (planned adapter — docs/RETAILER-INTEGRATIONS.md)
```

Two principles run through every layer:

- **Capability flags, not assumptions.** Each store declares what its
  integration provides (aisles, inventory, pricing, images, map, realtime);
  the UI renders only that. A departments-only store shows departments only.
- **Never invent data.** Missing aisle, unknown stock, absent price, and
  "not carried here" are all explicit, labeled states — with provenance
  (retailer / store-managed / community-verified) and update time on details.

Ranking tiers are identical in TypeScript (`src/data/ranking.ts`) and SQL
(`search_products` RPC): exact name > prefix > word prefix > substring >
all-tokens > full-text > trigram fuzzy, with plural and synonym expansion.
Store scoping is structural: locations hang off `store_products`, so a query
can never return another store's aisle.

## Project layout

```
src/app/            Expo Router: (tabs)/home|search|saved|settings, onboarding,
                    store-picker (modal), product/[id]
src/components/     Design system: search bar, product card, aisle badge, pills,
                    filter chips, store rows, toast, empty/error/loading states
src/data/           Provider interface, ranking + synonyms, filters, mock catalog,
                    Supabase provider + row mappers
src/lib/            Selected store, saved products, favorite/recent stores,
                    recents, onboarding flag, query client, formatting
supabase/           Migrations 0001 (core) + 0002 (retailers, capabilities,
                    prices, ops + user tables) and the demo seed
docs/               API spec · retailer integrations · testing plan · security review
```

## Connecting Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. SQL Editor → run, in order:
   `supabase/migrations/20260806000001_init.sql`,
   `supabase/migrations/20260806000002_retailers.sql`,
   `supabase/seed.sql`. (Or `supabase link` + `supabase db push` with the CLI.)
3. `cp .env.example .env` and fill in from Project Settings → API:
   `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   (the **anon/publishable** key only — never service_role).
4. Restart with a clear cache: `npx expo start -c`.

Security model: anon key + SELECT-only RLS on catalog tables; all writes via
service role; ops tables (sync logs, corrections, store requests) are
service-role only; future-account user tables are owner-scoped. Details:
[docs/SECURITY.md](docs/SECURITY.md).

## Testing & checks

```bash
npm test             # 74 tests: ranking/synonyms, filters, providers, persistence
npm run typecheck    # tsc --noEmit (typed routes generate on first `npm start`)
npm run lint         # eslint via expo lint
npx expo export --platform web   # bundles + statically renders every route
```

Manual device matrix: [docs/TESTING.md](docs/TESTING.md).

## Deployment checklist (EAS)

1. Replace placeholder branding: icon/splash in `assets/images/`, bundle ids
   (`com.jabay7.fetch`) in `app.json`.
2. `npm i -g eas-cli && eas login && eas build:configure`.
3. Add the two `EXPO_PUBLIC_SUPABASE_*` values as EAS environment variables.
4. Android: `eas build --platform android --profile preview` (sideload .apk)
   → `eas build --platform android` (.aab) → `eas submit --platform android`
   (one-time $25 account).
5. iOS: `eas build --platform ios` (cloud-built; Apple Developer $99/yr) →
   `eas submit --platform ios` → TestFlight.
6. Store listings: screenshots, description, privacy policy (app stores no
   personal data), support contact.
7. Pre-launch gaps to close: per-IP rate limiting on RPCs, crash reporting
   with PII scrubbing (see docs/SECURITY.md "Known gaps").

## Roadmap

Kroger adapter (only engineering left — registration is self-service) ·
retailer admin portal with RBAC + audit + correction review
([plan](docs/RETAILER-INTEGRATIONS.md)) · CSV import pipeline · barcode
scanning (`expo-camera`) · nearby stores (`expo-location`, opt-in) ·
Walgreens availability adapter · store maps.
