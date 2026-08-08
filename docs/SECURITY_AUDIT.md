# Security audit — FetchNFind

**Audit date: 7 August 2026.** Performed against the live production project,
not a local copy. Every finding below was verified by executing the attack path
against production with an anonymous key, then re-verified after the fix.

## Summary

| Severity | Finding | Status |
| --- | --- | --- |
| **High** | Internal ingestion and operations functions were callable by anonymous API clients, including an unbounded geospatial self-join | **Fixed** — migration 0012 |
| **Medium** | Demo catalog with illustrative aisle data was discoverable in the production directory | **Fixed** — migration 0009 |
| **Medium** | Directory imports attached unrelated businesses to real retailer brands | **Fixed** — migration 0009 |
| Low | 23 npm advisories, all in build-time Expo tooling | Accepted, tracked |
| Low | No per-IP rate limiting on public RPCs | Open, mitigated |

No secret was found exposed. No fabricated data path was found reaching users.

---

## 1. Secret handling

**Result: clean.**

| Check | Result |
| --- | --- |
| Secrets in tracked files | None. Only `.env.example` is tracked; `.env` is gitignored |
| Secrets in git history (all branches, all commits) | None. Pattern scan for `sk-ant-*`, `sbp_*`, service-role JWTs returned only the *variable name* `SERVICE_ROLE`, never a value |
| Server-only names referenced from `src/` | Zero hits for `ANTHROPIC_API_KEY`, `SERVICE_ROLE`, `KROGER_CLIENT_SECRET`, `SUPABASE_ACCESS_TOKEN`, `REFRESH_JOB_KEY` |
| Client-reachable env vars | Exactly two: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` |

The architecture makes this structural rather than lucky: retailer and model
credentials exist only as Supabase Function secrets, read via `Deno.env` inside
Edge Functions. There is no code path by which they could be bundled — the app
never imports them, and the bundler only inlines `EXPO_PUBLIC_*`.

**Rotation flag.** A Supabase management token (`sbp_…`) was pasted into a
working session transcript during this engagement. It was not committed and
does not appear in the repository or its history, but a transcript is not a
secret store. **Rotate it at
supabase.com/dashboard/account/tokens.** Per policy this is flagged for
rotation rather than silently deleted.

---

## 2. Row-level security

**Result: clean.**

- **Every** table in `public` has RLS enabled — zero exceptions.
- 15 operational tables have RLS enabled with **no policies at all**, which in
  Postgres is deny-everything for non-service roles. These are the right
  tables to lock down: `ai_interpretations`, `import_audit`, `import_jobs`,
  `inventory_snapshots`, `location_reports`, `location_verifications`,
  `provider_*` (6 tables), `search_terms`, `store_identities`,
  `store_support_requests`.
- The only write policies that exist are the four owner-scoped user tables
  (`favorite_stores`, `recent_searches`, `saved_products`,
  `user_store_preferences`), each qualified `auth.uid() = user_id`. An
  anonymous client cannot write anything, anywhere.
- Catalog tables are SELECT-only to `anon`.

Verified live: an anonymous key reading `import_jobs` and `providers` returns
zero rows.

---

## 3. Function exposure — the one real finding

**Severity: High. Fixed in migration 0012, verified in production.**

Postgres grants `EXECUTE` to `PUBLIC` on every newly created function. The
discovery RPCs are deliberately public; the ingestion helpers added across
migrations 0008–0011 silently inherited that default and became callable with
nothing but the anon key.

The material risk was **availability**, not disclosure:

```
POST /rest/v1/rpc/find_duplicate_stores  {"p_radius_m": 100000, "p_limit": 2000}
```

`find_duplicate_stores` is a geospatial self-join across the entire store
table, and both bounds are caller-supplied. With ~21,000 stores an anonymous
caller could force a near-cross-join at will.

Also exposed: `merge_duplicate_stores` (mutates store lifecycle),
`resolve_store_identity`, `grade_directory_store`.

**Fix.** Migration 0012 revokes `PUBLIC`/`anon`/`authenticated` execute on all
ingestion and operations functions and grants them to `service_role` only.

**Regression that this fix caused, and its own fix.** Revoking
`store_name_matches_brand` broke `search_stores`, because that RPC is
`language sql stable` — not `security definer` — so it executes as the caller
and the caller needs execute on every nested function. Production store search
returned `permission denied` until migration 0013 re-granted the two *pure*
predicates (`store_name_matches_brand`, `source_priority`). Both read no
tables and take no caller-controlled bounds, so they carry no DoS or
disclosure risk. The operational sweeps remain service-role only.

**Regression guard.** `npm run db:check` now pins the public API surface: it
enumerates every function anonymous clients can execute and fails if anything
appears that is not on an explicit allowlist. Exposing a new RPC is now a
deliberate edit to that list, not an accident of Postgres defaults.

Verified in production after the fix:

```
find_duplicate_stores    401  permission denied
merge_duplicate_stores   401  permission denied
resolve_store_identity   401  permission denied
import_directory_stores  401  permission denied
grade_directory_store    401  permission denied
search_stores            200  14 rows
search_stores_near       200   5 rows
search_products          200   5 rows
```

---

## 4. SQL injection and `SECURITY DEFINER`

**Result: clean.**

- Every `SECURITY DEFINER` function pins `search_path`. Zero exceptions — this
  closes the standard privilege-escalation path where a caller shadows a
  function or operator with one in a schema they control.
- No function builds SQL by string concatenation of user input. The dynamic
  SQL that exists (migration 0012's revoke loop) interpolates only identifiers
  read from `pg_proc` via `format('%I', …)`, never caller input.
- All client access goes through parameterised RPCs; PostgREST binds
  parameters rather than interpolating them.
- Search terms reach SQL as bound parameters and are additionally length-capped
  and normalised in the Edge Function before use.

---

## 5. Edge Function authorization

| Function | Exposure | Control |
| --- | --- | --- |
| `product-search-assistant` | Public | Supabase gateway verifies the anon JWT; UUID-shape validation on `store_id`; term length-capped at `MAX_TERM_LENGTH`; result limit clamped 1–50 |
| `store-search` | Public | Same gateway check; bounded result sets |
| `catalog-import` | Service role | Not reachable with an anon key |
| `refresh-popular-products` | Cron | Requires anon JWT **plus** a shared `x-refresh-key` secret. The gateway verifies the JWT before the handler runs, so the JWT alone is not the control — the shared key is |

Input validation is enforced before any database work: a malformed `store_id`
is rejected with 400 without touching the catalog.

---

## 6. Prompt injection and data fabrication

This is the threat that matters most for this product, and the defences are
**structural rather than prompt-based** — a jailbroken model still cannot
fabricate a fact.

1. **The model cannot emit facts.** `validateInterpretation()` enforces a
   closed output shape carrying only search *terms* and intent. There is no
   field in which an aisle, price, stock level or store could travel, so no
   model output can become a displayed fact.
2. **Responses are built only from database rows.** `buildTrustedResult()`
   assembles every user-visible field from verified rows; `location` is `null`
   when no location field exists rather than being inferred.
3. **Untrusted input is delimited.** The shopper's query is wrapped in
   `<shopper_query>` tags with tag-breaking sequences stripped.
4. **The model is skipped when it cannot help.** `shouldUseAi()` returns false
   for identifier-shaped queries and whenever deterministic search already
   found results — so the AI never touches the common path at all.

Verified live: `"stuff for heartburn"` returns 13 real products with real
aisle numbers sourced from the Kroger API, and queries with no match return an
explicit empty state rather than a plausible guess.

---

## 7. SSRF and outbound requests

**Result: clean.** Outbound hosts are hardcoded constants — Kroger's API base,
Anthropic's API, and the Overpass endpoint. No user-supplied value is ever
interpolated into a request URL, so there is no path by which a shopper's input
could redirect a server-side fetch.

---

## 8. Dependencies

23 advisories: 8 moderate, 15 high. **All sit in build-time Expo tooling** —
`@expo/config-plugins`, `@expo/prebuild-config`, `expo-splash-screen`
(prebuild path). None is reachable from the shipped app bundle or from any
Edge Function, which run on Deno with their own dependency graph.

`npm audit fix --force` would downgrade or break the Expo SDK 57 toolchain, so
these are **accepted and tracked** rather than force-fixed. They are re-checked
whenever the SDK is upgraded.

---

## 9. Privacy

- Search telemetry stores normalised terms with no user identifier.
- `get_popular_terms` enforces a minimum of 3 distinct searches before a term
  is reportable, so no individual's query can be read out of the aggregate.
- The app stores no personal data; user tables exist for a future accounts
  feature and are already owner-scoped.

---

## Open items

1. **Per-IP rate limiting on public RPCs.** Currently mitigated by the hard
   `LIMIT` clauses inside every public function (60 stores, 50 products) and by
   the removal of the unbounded self-join. A shopper cannot request an
   expensive query shape, but they can request a cheap one repeatedly.
   Supabase's gateway limits apply; application-level per-IP limiting is not
   yet implemented.
2. **Crash reporting with PII scrubbing** — not yet wired up.
3. **Rotate the management token** noted in §1.
