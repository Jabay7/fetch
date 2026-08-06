# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Project conventions (Fetch)

- All product/store data flows through the `StoreDataProvider` interface in
  `src/data/types.ts`. Screens must never import a concrete provider — use
  `dataProvider` from `src/data`. Providers must be store-scoped: never return
  location/availability from a store other than the one queried.
- Search ranking lives in `src/data/ranking.ts` (TypeScript) and in the
  `search_products` SQL RPC (`supabase/migrations/`). If you change the tiers,
  change both and update the tests.
- The mock catalog (`src/data/mock/data.ts`) and `supabase/seed.sql` mirror
  each other; keep them in sync (products are matched by UPC in the seed).
- Checks before finishing: `npm test`, `npm run typecheck`, `npm run lint`.
- Testing Library v14: `renderHook`/`render`/`unmount` are async — await them.
- Secrets: only `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  may reach the client. Any retailer API credentials belong in a Supabase Edge
  Function, never in this repo or the app bundle.
