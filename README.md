# Fetch — in-store product locator

Pick your store once, search any product, and get the exact **aisle, section, and
availability** for that store. Built with Expo + TypeScript + Expo Router, backed
by Supabase Postgres, and runs out of the box on a bundled demo catalog when no
backend is configured.

## Quick start

```bash
npm install
npm start          # then press a (Android), w (web), or scan the QR in Expo Go
```

No configuration needed — without Supabase env vars the app uses the built-in
demo catalog (three Chicagoland stores). All flows work offline.

### Demo script

| Try this | You should see |
| --- | --- |
| Choose **Schaumburg Main Store**, search `toothpaste` | **Colgate Total Toothpaste — Aisle G18 — Oral Care — In stock** (plus Crest, Sensodyne, Tom's) |
| Misspell it: `toothpast` or `sensodine` | Same results — fuzzy matching handles typos |
| Search `shampoo` | Pantene with location **G12** but **Out of stock** |
| Search `paper towels` | Bounty **in stock** with **Aisle info unavailable** |
| Search `charcoal` | No matches (only Naperville carries it — switch stores to see it) |
| Search `quinoa flakes` | Friendly "no matches" state |
| Open Colgate, tap the store badge, switch to **Naperville West Store** | Same product now shows **Aisle 12** and Low stock — never another store's aisle |

## Why there's no live retailer API in v1

Research finding (Aug 2026): **Kroger is the only major US retailer with an
official public API exposing store-specific aisle locations and stock levels**
([Products API](https://developer-ce.kroger.com/api-products/api/product-api-public),
[Locations API](https://developer-ce.kroger.com/api-products/api/location-api-public);
free OAuth2 client-credentials, 10k calls/day). Target, Walmart, Home Depot,
Albertsons/Jewel-Osco expose no public aisle data, and the third-party "APIs"
for them are scrapers that violate retailer terms — deliberately not used.

So the app is built on a **store-managed catalog** (the honest model for a real
deployment) behind a single provider interface:

```
UI screens ──► StoreDataProvider (src/data/types.ts)
                 ├── mockProvider      (bundled demo catalog; default)
                 ├── supabaseProvider  (Postgres + SQL ranking; set env vars)
                 └── krogerProvider    (future adapter — see below)
```

Ranking tiers are identical in TypeScript (`src/data/ranking.ts`) and SQL
(`search_products` RPC): exact name > name prefix > word prefix > substring >
all-tokens > full-text > trigram fuzzy. Store scoping is structural: locations
hang off `store_products`, so a query can never return another store's aisle.

## Project layout

```
src/app/            Expo Router screens (welcome, store-picker, search, product/[id])
src/components/     Design system: search bar, product card, aisle badge, pills, states
src/data/           Provider interface, ranking, mock catalog, Supabase provider
src/lib/            Selected-store persistence, recents, debounce, query client, formatting
supabase/           SQL migration (schema, RLS, search RPCs) and demo seed
```

## Connecting Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. SQL Editor → run `supabase/migrations/20260806000001_init.sql`, then
   `supabase/seed.sql`. (Or `supabase link` + `supabase db push` with the CLI.)
3. `cp .env.example .env` and fill in from Project Settings → API:
   - `EXPO_PUBLIC_SUPABASE_URL` — the project URL
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` — the **anon/publishable** key only
4. Restart with a clear cache: `npx expo start -c`.

Security model: the anon key is designed to ship in clients; row-level security
grants **SELECT only** on catalog tables, writes require the service role (never
in the app), search runs through `STABLE` RPCs with escaped user input, and the
app holds no accounts or personal data. Recent searches stay on-device.

## Adding the Kroger adapter later

Keep secrets server-side: put the Kroger OAuth client credentials in a Supabase
**Edge Function** (`supabase secrets set`), have it exchange/cache the
client-credentials token and proxy `/v1/locations` + `/v1/products`, then map
responses into `ProductHit` (`stockLevel` HIGH/LOW/TEMPORARILY_OUT_OF_STOCK →
availability; omitted → `UNKNOWN`; `aisleLocations[0]` → location) in a new
`krogerProvider`. The UI needs no changes.

## Testing & checks

```bash
npm test             # 45 unit/integration tests (ranking, providers, persistence, mappers)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint via expo lint
```

## Accessibility

Every interactive element has a role + label (result rows read
"name, aisle, section, availability"), status pills never rely on color alone,
touch targets are ≥44pt, text/background pairs meet WCAG AA in light and dark
mode, and result updates announce via live regions.

## Deployment (EAS)

```bash
npm install -g eas-cli
eas login
eas build:configure                      # creates eas.json, links the project
eas build --platform android --profile preview    # installable .apk for testing
eas build --platform android             # Play Store .aab
eas build --platform ios                 # App Store build (Apple Developer account; cloud-built, no Mac needed)
eas submit --platform android|ios        # store submission
```

Set the Supabase env vars for builds with `eas env:create` (or in eas.json
build profiles) so production builds bundle them. Bundle ids are
`com.jabay7.fetch` (change in `app.json` before first store submission, along
with the placeholder icon/splash).

## Post-MVP roadmap

Kroger adapter (above) · barcode scanning (`expo-camera`) · store maps ·
"nearby stores" via `expo-location` · shopping lists · staff admin portal for
maintaining planogram data · analytics.
