# Security & privacy review

Status: reviewed 2026-08-06 for v2. ✅ implemented · 🔜 applies when the
feature ships.

## Data & privacy

- ✅ **No accounts, no personal data.** Selected store, recents, saved
  products, favorites, and the onboarding flag live in AsyncStorage on
  device only. Nothing identifies the user; nothing is sensitive enough to
  require SecureStore (no tokens/credentials are stored client-side).
- ✅ **No location collection.** Store selection is search-based. If
  "nearby stores" ships, use foreground-only permission with a clear
  pre-prompt explanation and a ZIP fallback; never store coordinates.
- ✅ **No analytics.** If added, use aggregate, anonymous counters
  (e.g., term → result-count) with no device identifiers; document in the
  privacy policy. `recent_searches` server-side sync exists only behind
  future authenticated opt-in.
- ✅ **User-facing transparency**: Settings states the on-device policy;
  product details label data provenance and update time.

## Client

- ✅ Only publishable values ship in the bundle: `EXPO_PUBLIC_SUPABASE_URL`
  and the anon key (designed to be public; scoped by RLS). `.env` is
  gitignored; `.env.example` documents the rule; the Kroger client secret is
  explicitly designated for Edge Function secrets.
- ✅ Errors shown to users are generic; technical detail goes to
  `console.warn` without personal data.
- ✅ Deep-link params (`/product/[id]`) are treated as untrusted: invalid ids
  resolve to the "not carried" state, non-UUID ids fail closed in SQL.

## Database (Supabase)

- ✅ RLS on every table. Catalog tables: SELECT-only for `anon`/
  `authenticated`. Ops tables (integrations, sync logs, corrections,
  support requests, inventory history): RLS enabled with **no** client
  policies — service-role only. User tables: `auth.uid() = user_id` policies.
- ✅ All writes require the service role (dashboard/portal); the app cannot
  mutate catalog data.
- ✅ RPCs are `STABLE`, parameterized, escape LIKE wildcards, clamp limits,
  and enforce a minimum term length. No dynamic SQL.
- ✅ Community submissions are structurally quarantined
  (`location_corrections.status`) until reviewed; only then do they surface,
  labeled `COMMUNITY_VERIFIED`.
- ✅ Transport is HTTPS end-to-end (Supabase + Expo defaults).

## Rate limiting & abuse

- ✅ Client debounces (300 ms), caches (TanStack Query), and caps result
  sizes; RPC limit clamped server-side.
- 🔜 Per-IP rate limiting for public RPCs (Supabase API settings /
  edge middleware) before store launch.

## Retailer tools (when the portal ships)

- 🔜 Supabase Auth with role-based access (`retailer_admin`,
  `store_manager`, `staff`) enforced by RLS on portal tables.
- 🔜 Audit log rows (actor, change, timestamp) for every product-location
  mutation and correction review; `provider_sync_logs` already models sync
  outcomes.
- 🔜 Account deletion and data export flows the moment accounts exist.

## Known gaps (tracked, not hidden)

- Support/report flows use `mailto:` (owner address) rather than an
  authenticated endpoint — acceptable pre-launch; replace with a
  rate-limited Edge Function + `store_support_requests` insert later.
- No crash reporting; add a privacy-respecting reporter (e.g., Sentry with
  PII scrubbing) before public release.
