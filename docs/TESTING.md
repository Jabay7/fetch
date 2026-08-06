# Testing plan

## Automated (run on every change)

```bash
npm test             # Jest + jest-expo + Testing Library v14
npm run typecheck    # tsc --noEmit (TS strict)
npm run lint         # eslint via expo lint (React Compiler-era rules)
npx expo export --platform web   # full Metro bundle + static render of every route
```

Current suite: 74 tests across 9 files.

| Area | File | Covers |
| --- | --- | --- |
| Ranking | `src/data/__tests__/ranking.test.ts` | tier ordering, case-insensitivity, typo tolerance, multi-token, plural + synonym expansion |
| Filters | `src/data/__tests__/filters.test.ts` | in-stock filter, department filter, combined, option derivation |
| Mock provider | `src/data/__tests__/mock-provider.test.ts` | every demo scenario, store scoping, prices per store, provenance labels, departments-only store, getDepartments |
| Supabase mappers | `src/data/__tests__/mappers.test.ts` | row→domain mapping, enum degradation, capability defaults |
| Store persistence | `src/lib/__tests__/selected-store.test.tsx` | hydrate, persist across relaunch, clear, corrupt payloads |
| Saved products | `src/lib/__tests__/saved-products.test.ts` | toggle, order, cap, clear, corrupt storage |
| Store history | `src/lib/__tests__/store-history.test.ts` | favorites toggle, recents dedupe/cap, onboarding flag |
| Recents / formatting | `recents.test.ts`, `format.test.ts` | dedupe/cap/clear; labels, price, provenance, relative time |

SQL is validated against the real Postgres grammar (libpg-query) before
commit; first live execution happens on the Supabase project.

## Manual test matrix (device pass before each release)

| Scenario | Steps | Expected |
| --- | --- | --- |
| First launch | Fresh install | Onboarding (3 slides, skippable) → store picker → Home |
| Store persistence | Pick Schaumburg, kill app, relaunch | Straight to Home with Schaumburg selected |
| Product search | Search "toothpaste" at Schaumburg | Colgate Total first: Aisle G18 · Oral Care · In stock · $4.49 |
| Misspellings | "toothpast", "sensodine", "toothpastes", "tp", "bandaids" | Correct products found |
| Duplicates | "toothpaste" | Four distinct toothpastes, ranked, no repeats |
| Different aisles per store | Open Colgate → change store Naperville → Evanston | G18 → 12 → B7, price changes, never mixed |
| No aisle data | "paper towels" at Schaumburg | In stock + "Aisle info unavailable" state |
| Out of stock | "shampoo" at Schaumburg | G12 shown with Out of stock pill |
| Unsupported capabilities | Switch to Lakeview Drug Co | No aisle badges/stock pills/prices; department-only layout with explainer |
| Not carried | Open a saved Fetch-Market-only item at Lakeview | "Not carried at this store" + Change store |
| Filters | Search "tooth", toggle In stock, pick Oral Care | Counts update; clear-filters state when empty |
| Saved flow | Save Colgate → Saved tab → switch store | Live aisle per store; remove works; Home preview updates |
| Favorites/recents | Star stores in picker; switch stores | Favorites pinned; recents in Settings quick-switch |
| API failure | Supabase creds wrong / airplane mid-search | Error state with Retry; no crash |
| Offline | Airplane mode | Banner; recents/saved lists still open; cached results shown |
| Accessibility | VoiceOver/TalkBack pass | Rows read name+aisle+availability; controls labeled; focus order sane |
| Themes | Toggle light/dark | AA contrast both; no unreadable text |
| Screen sizes | Small (SE-class) and large phone | No clipped controls; scroll works |
| Builds | `eas build` Android + iOS | Boots, gate works, search works |
