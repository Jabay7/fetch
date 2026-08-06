# Provider selection & baseline (Phase 1 record)

## Verified baseline (2026-08-06)

- `main` @ `ce6363b` == deployed source; `gh-pages` @ `531132a` (live at
  https://jabay7.github.io/fetch/).
- 74 tests / 9 suites passing; `tsc --noEmit` clean; `expo lint` clean;
  `npx expo export --platform web` succeeds.
- Implementation branch: `production-data-layer`.

## How the app picks a data provider today

Selection happens **once, at module load**, in `src/data/index.ts`:

```ts
export const dataProvider: StoreDataProvider = isSupabaseConfigured()
  ? supabaseProvider
  : mockProvider;
```

`isSupabaseConfigured()` (`src/data/supabase/client.ts`) is simply:

```ts
Boolean(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY)
```

Facts that follow from this design:

1. **Build-time decision.** Expo inlines `EXPO_PUBLIC_*` values during
   `expo start` / `expo export`. The deployed GitHub Pages bundle therefore
   selects its provider at export time; changing providers requires a
   re-export, not a runtime toggle.
2. **Mock fallback is automatic.** With either env var missing the app runs
   entirely on the bundled demo catalog (`src/data/mock/`). Jest sets no env
   vars, so all tests exercise the mock provider deterministically.
3. **The Supabase client is lazy.** `getSupabaseClient()` constructs the
   client on first use and throws if called unconfigured — screens never
   reach it because they import only `dataProvider`.
4. **Screens are provider-agnostic.** Nothing outside `src/data/` imports a
   concrete provider (enforced by convention in AGENTS.md); all screens call
   `dataProvider` methods and render capability-gated UI from
   `storeCapabilities(store)`.

## Switching the live site to Supabase (when credentials exist)

1. Create a Supabase project; run migrations + seed (see `supabase/`).
2. Provide `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   at export time (`.env` locally, CI secret for deploys).
3. `npx expo export --platform web` and redeploy `gh-pages`.
4. The mock provider remains in the bundle as dead code for the app but stays
   the test/dev fallback — do not remove it.
