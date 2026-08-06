# Retailer & store administration

The admin surface is API-first: authenticated Edge Functions plus the
service-role SQL layer, with a CLI wrapper for operators. A visual portal is
planned (see docs/RETAILER-INTEGRATIONS.md) but is not required for any
administration task below.

## Access control

| Actor | How they authenticate | What they may do |
| --- | --- | --- |
| Platform operator | Supabase service-role key (server/CLI only) | Everything |
| `platform_admin` | Supabase Auth JWT + `portal_members` row | Imports, corrections review, provider ops |
| `retailer_admin` | JWT + `portal_members` row scoped to a retailer | Imports for that retailer's stores |
| `store_manager` | JWT + `portal_members` row scoped to a store | Imports for that store |
| Anonymous app users | anon key | Read-only catalog (RLS-enforced); **no** admin surface |

Membership rows are created by the operator:

```sql
insert into portal_members (user_id, role, retailer_id)
values ('<auth.users id>', 'retailer_admin', '<retailer id>');
```

The `catalog-import` Edge Function rejects requests that are not the service
role or a member with an admin-capable role (401/403).

## Admin capabilities

| Task | How |
| --- | --- |
| Add a retailer / stores | SQL inserts (service role) or a store-list JSON import |
| Import product catalogs + locations | `catalog-import` Edge Function (CSV/JSON, template: docs/import-template.csv) |
| Preview an import | Same call with `"dry_run": true` — full per-row validation report, zero writes |
| Correct invalid rows | Fix the reported rows (`parse_errors` + `apply.errors` carry row numbers and reasons) and re-run; imports are idempotent |
| View sync/import status | `select * from import_jobs order by created_at desc` (totals + row_errors per job) |
| Retry a failed import | Re-POST the same file — insert-or-update semantics make repeats safe |
| Roll back an import | `select revert_import('<job id>')` — restores before-images from import_audit |
| Review location corrections | `location_reports` (PENDING → approve by writing product_locations as COMMUNITY_VERIFIED + a location_verifications row) |
| Disable stale products | `update store_products set active = false where last_seen_at < now() - interval '90 days'` |
| Review provider errors | `provider_errors`, `provider_sync_jobs`, `provider_sync_logs` |
| Catalog statistics | counts over products / store_products / product_locations (see below) |

Catalog statistics query:

```sql
select
  (select count(*) from retailers)                          as retailers,
  (select count(*) from stores where active)                as stores,
  (select count(*) from products)                           as products,
  (select count(*) from product_variants)                   as variants,
  (select count(*) from store_products where active)        as store_products,
  (select count(*) from product_locations pl
    where pl.verification_status not in ('EXPIRED','DISPUTED')) as locations;
```

## Importing a catalog from the command line

```bash
# Preview (validation only, no writes)
node scripts/import-catalog.mjs --file my-store.csv --dry-run

# Apply
node scripts/import-catalog.mjs --file my-store.csv
```

The script needs two environment variables (server-side only — never commit,
never EXPO_PUBLIC_):

- `SUPABASE_URL` — the project URL
- `SUPABASE_SERVICE_ROLE_KEY` — service-role key (or a portal member's JWT
  via `SUPABASE_ACCESS_TOKEN`)

Response fields: `parse` (total/valid/invalid/duplicates/no-location),
`parse_errors` (row-numbered), `apply` (rows inserted/updated/skipped,
unknown stores, per-row errors), `job_id` (for status queries and
`revert_import`).

## Security invariants

- The service-role key and `ANTHROPIC_API_KEY` live only in Supabase secrets
  and operator environments; nothing privileged ships in the app bundle.
- Every import is attributed (`import_jobs.created_by`) and every row change
  audited (`import_audit`) with before/after images.
- Community reports can never write directly to `product_locations`; they
  require a review step that records who verified and how
  (`location_verifications.method`).
