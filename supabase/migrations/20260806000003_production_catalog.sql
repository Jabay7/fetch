-- Fetch migration 0003: production catalog model.
--
-- Extends the v2 multi-retailer schema into a production ingestion/search
-- system: retailer integration matrix, store provider identities, product
-- taxonomy/variants/aliases, historical prices and inventory, a provider
-- registry with sync jobs + rate limits, search telemetry + AI-interpretation
-- cache, community reports/verifications, an auditable import pipeline, and
-- portal roles. Apply after 0002, before 0004 (RPC v3) and seed.
--
-- Naming note: this schema keeps 0001's column names where they already carry
-- the spec's meaning (address_line = address, zip = postal_code,
-- size_text = size, name = canonical_name). RPCs are the public contract.

-- Self-contained updated_at trigger (no extension dependency, so the schema
-- replays identically on hosted Supabase and in local validation).
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Retailers: integration status + branding
-- ---------------------------------------------------------------------------
alter table retailers
  add column logo_url text,
  add column website_url text,
  add column integration_status text not null default 'unsupported'
    check (integration_status in (
      'live', 'development', 'partnership_required', 'import_supported',
      'directory_only', 'unsupported', 'temporarily_unavailable'
    )),
  add column updated_at timestamptz not null default now();

create trigger retailers_updated_at
  before update on retailers
  for each row execute function set_updated_at ();

-- Researched capability matrix, one row per retailer (Phase 7). Only facts
-- from official sources belong here; last_reviewed_at records staleness.
create table retailer_capabilities (
  retailer_id uuid primary key references retailers (id) on delete cascade,
  store_directory boolean not null default false,
  product_catalog boolean not null default false,
  store_specific_products boolean not null default false,
  inventory boolean not null default false,
  pricing boolean not null default false,
  aisle_locations boolean not null default false,
  store_map boolean not null default false,
  official_public_api boolean not null default false,
  partner_api boolean not null default false,
  commercial_approval_required boolean not null default false,
  api_name text,
  api_url text,
  official_source_url text,
  notes text,
  last_reviewed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- 2) Stores: provider identity, geo, lifecycle
-- ---------------------------------------------------------------------------
alter table stores
  add column provider_store_id text,
  add column store_number text,
  add column latitude double precision check (latitude between -90 and 90),
  add column longitude double precision check (longitude between -180 and 180),
  add column phone text,
  add column timezone text,
  add column active boolean not null default true,
  add column updated_at timestamptz not null default now();

create trigger stores_updated_at
  before update on stores
  for each row execute function set_updated_at ();

create unique index stores_retailer_provider_store_idx
  on stores (retailer_id, provider_store_id) where provider_store_id is not null;
create unique index stores_retailer_store_number_idx
  on stores (retailer_id, store_number) where store_number is not null;

-- ---------------------------------------------------------------------------
-- 3) Store capabilities: search/department flags + verification stamp
-- ---------------------------------------------------------------------------
alter table store_capabilities
  add column product_search boolean not null default true,
  add column department_data boolean not null default true,
  add column last_verified_at timestamptz;

-- ---------------------------------------------------------------------------
-- 4) Product taxonomy and identifiers
-- ---------------------------------------------------------------------------
create table product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  parent_id uuid references product_categories (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table products
  add column category_id uuid references product_categories (id) on delete set null,
  add column gtin text,
  add column ean text,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

create trigger products_updated_at
  before update on products
  for each row execute function set_updated_at ();

create unique index products_gtin_idx on products (gtin) where gtin is not null;
create unique index products_ean_idx on products (ean) where ean is not null;
create index products_category_idx on products (category_id);

-- ---------------------------------------------------------------------------
-- 5) Product variants (size / color / flavor / pack)
-- ---------------------------------------------------------------------------
create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  name text not null,
  size_text text,
  color text,
  flavor text,
  pack_count integer check (pack_count > 0),
  upc text,
  gtin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, name)
);

create trigger product_variants_updated_at
  before update on product_variants
  for each row execute function set_updated_at ();

create unique index product_variants_upc_idx on product_variants (upc) where upc is not null;
create unique index product_variants_gtin_idx on product_variants (gtin) where gtin is not null;
create index product_variants_product_idx on product_variants (product_id);

-- ---------------------------------------------------------------------------
-- 6) Aliases
--    product_aliases: alternative names for one product ("Tylenol" →
--    an acetaminophen product). search_aliases: query rewrites that are not
--    product-specific ("pop" → "soft drink"); mirrors src/data/ranking.ts
--    SYNONYMS for the client fallback path.
-- ---------------------------------------------------------------------------
create table product_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  alias text not null,
  alias_type text not null default 'SYNONYM'
    check (alias_type in (
      'SYNONYM', 'MISSPELLING', 'ABBREVIATION', 'GENERIC_NAME',
      'BRAND_GENERIC', 'PLURAL', 'REGIONAL', 'OTHER'
    )),
  language text not null default 'en',
  created_at timestamptz not null default now(),
  unique (product_id, alias, language)
);

create index product_aliases_alias_idx on product_aliases (lower(alias));
create index product_aliases_alias_trgm_idx on product_aliases using gin (alias gin_trgm_ops);
create index product_aliases_product_idx on product_aliases (product_id);

create table search_aliases (
  id uuid primary key default gen_random_uuid(),
  term text not null,
  expansion text not null,
  language text not null default 'en',
  created_at timestamptz not null default now(),
  unique (term, expansion, language)
);

create index search_aliases_term_idx on search_aliases (lower(term));

-- ---------------------------------------------------------------------------
-- 7) Store products: provider identity + lifecycle
-- ---------------------------------------------------------------------------
alter table store_products
  add column product_variant_id uuid references product_variants (id) on delete set null,
  add column provider_product_id text,
  add column retailer_sku text,
  add column active boolean not null default true,
  add column last_seen_at timestamptz not null default now();

create index store_products_sku_idx
  on store_products (store_id, retailer_sku) where retailer_sku is not null;
create index store_products_provider_idx
  on store_products (store_id, provider_product_id) where provider_product_id is not null;
create index store_products_product_idx on store_products (product_id);

-- ---------------------------------------------------------------------------
-- 8) Product locations: provenance, verification, lifetime
--    (still keyed 1:1 off store_products, so cross-store leakage stays
--    structurally impossible)
-- ---------------------------------------------------------------------------
alter table product_locations
  drop constraint product_locations_data_source_check;

alter table product_locations
  add column display_location text,
  add column source_provider text,
  add column verification_status text not null default 'UNVERIFIED'
    check (verification_status in (
      'UNVERIFIED', 'VERIFIED', 'COMMUNITY_VERIFIED', 'EXPIRED', 'DISPUTED'
    )),
  add column effective_at timestamptz not null default now(),
  add column expires_at timestamptz,
  add constraint product_locations_data_source_check check (
    data_source in (
      'RETAILER_API', 'AUTHORIZED_FEED', 'STORE_MANAGED',
      'COMMUNITY_VERIFIED', 'UNKNOWN'
    )
  );

-- ---------------------------------------------------------------------------
-- 9) Inventory snapshots: quantity + provenance
-- ---------------------------------------------------------------------------
alter table inventory_snapshots
  add column quantity integer check (quantity >= 0),
  add column source_provider text;

-- ---------------------------------------------------------------------------
-- 10) Prices: history-capable (latest non-expired row wins; see RPC v3)
-- ---------------------------------------------------------------------------
alter table prices drop constraint prices_pkey;
alter table prices rename column amount_cents to regular_price_cents;
alter table prices
  add column id uuid not null default gen_random_uuid(),
  add column sale_price_cents integer check (sale_price_cents >= 0),
  add column captured_at timestamptz not null default now(),
  add column expires_at timestamptz;
alter table prices add primary key (id);

create index prices_sp_captured_idx on prices (store_product_id, captured_at desc);

-- ---------------------------------------------------------------------------
-- 11) Provider registry (replaces 0002's provider_integrations/sync_logs,
--     which never shipped)
-- ---------------------------------------------------------------------------
drop table provider_sync_logs;
drop table provider_integrations;

create table providers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind text not null check (kind in (
    'RETAILER_API', 'AUTHORIZED_FEED', 'LICENSED_DATASET',
    'STORE_MANAGED', 'CSV_IMPORT', 'MOCK'
  )),
  retailer_id uuid references retailers (id) on delete cascade,
  enabled boolean not null default false,
  base_url text,
  -- Non-secret configuration only; credentials live in Edge Function secrets.
  config jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger providers_updated_at
  before update on providers
  for each row execute function set_updated_at ();

create table provider_capabilities (
  provider_id uuid primary key references providers (id) on delete cascade,
  store_directory boolean not null default false,
  product_catalog boolean not null default false,
  store_specific_products boolean not null default false,
  inventory boolean not null default false,
  pricing boolean not null default false,
  aisle_locations boolean not null default false,
  store_map boolean not null default false
);

create table provider_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers (id) on delete cascade,
  job_type text not null check (job_type in (
    'FULL_SYNC', 'INCREMENTAL', 'IMPORT', 'HEALTH_CHECK'
  )),
  status text not null default 'QUEUED' check (status in (
    'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'ROLLED_BACK'
  )),
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  error text
);

create index provider_sync_jobs_provider_idx
  on provider_sync_jobs (provider_id, scheduled_at desc);

create table provider_sync_logs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references provider_sync_jobs (id) on delete cascade,
  level text not null default 'INFO' check (level in ('DEBUG', 'INFO', 'WARN', 'ERROR')),
  message text not null,
  context jsonb not null default '{}'::jsonb,
  logged_at timestamptz not null default now()
);

create index provider_sync_logs_job_idx on provider_sync_logs (job_id, logged_at);

create table provider_errors (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references providers (id) on delete cascade,
  job_id uuid references provider_sync_jobs (id) on delete set null,
  code text,
  message text not null,
  context jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index provider_errors_provider_idx on provider_errors (provider_id, occurred_at desc);

-- Fixed-window request counters (Edge Functions increment atomically).
create table provider_rate_limits (
  provider_id uuid not null references providers (id) on delete cascade,
  window_key text not null,
  request_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  primary key (provider_id, window_key)
);

-- ---------------------------------------------------------------------------
-- 12) Search telemetry + AI interpretation cache (Edge Function writes via
--     service role; nothing here is client-readable)
-- ---------------------------------------------------------------------------
create table search_terms (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores (id) on delete set null,
  raw_term text not null,
  normalized_term text not null,
  result_count integer,
  search_mode text not null check (search_mode in (
    'DETERMINISTIC', 'AI_ASSISTED', 'PROVIDER_ASSISTED', 'WEB_ASSISTED'
  )),
  matched_tier text check (matched_tier in (
    'IDENTIFIER', 'EXACT', 'PREFIX', 'ALIAS', 'TOKENS', 'FTS', 'FUZZY', 'AI', 'NONE'
  )),
  ai_model text,
  ai_input_tokens integer,
  ai_output_tokens integer,
  duration_ms integer,
  searched_at timestamptz not null default now()
);

create index search_terms_norm_idx on search_terms (normalized_term, searched_at desc);
create index search_terms_day_idx on search_terms (searched_at desc);

create table ai_interpretations (
  id uuid primary key default gen_random_uuid(),
  normalized_term text not null unique,
  interpretation jsonb not null,
  model text not null,
  confidence numeric check (confidence between 0 and 1),
  hit_count integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index ai_interpretations_expiry_idx on ai_interpretations (expires_at);

-- ---------------------------------------------------------------------------
-- 13) Community reports → reviewed verifications
--     (0002's location_corrections becomes location_reports; a verification
--     row records who/how a value was confirmed before it may be promoted
--     into product_locations as COMMUNITY_VERIFIED)
-- ---------------------------------------------------------------------------
alter table location_corrections rename to location_reports;

create table location_verifications (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references location_reports (id) on delete set null,
  store_product_id uuid not null references store_products (id) on delete cascade,
  method text not null check (method in (
    'STORE_STAFF', 'RETAILER_API', 'OFFICIAL_PAGE', 'ADMIN_REVIEW'
  )),
  verified_by text,
  source_url text,
  verified_value jsonb not null,
  verified_at timestamptz not null default now()
);

create index location_verifications_sp_idx on location_verifications (store_product_id);

-- ---------------------------------------------------------------------------
-- 14) Import pipeline: jobs + row-level audit (enables preview and revert)
-- ---------------------------------------------------------------------------
create table import_jobs (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references providers (id) on delete set null,
  source_kind text not null check (source_kind in ('CSV', 'JSON', 'API_RESPONSE', 'FEED')),
  file_name text,
  dry_run boolean not null default false,
  status text not null default 'PENDING' check (status in (
    'PENDING', 'VALIDATED', 'APPLIED', 'FAILED', 'ROLLED_BACK'
  )),
  totals jsonb not null default '{}'::jsonb,
  row_errors jsonb not null default '[]'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  rolled_back_at timestamptz
);

create index import_jobs_created_idx on import_jobs (created_at desc);

create table import_audit (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references import_jobs (id) on delete cascade,
  table_name text not null,
  row_pk uuid not null,
  action text not null check (action in ('INSERT', 'UPDATE')),
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index import_audit_job_idx on import_audit (job_id, created_at);

-- ---------------------------------------------------------------------------
-- 15) Portal membership (admin/import authorization; used by Edge Functions
--     and future portal UI)
-- ---------------------------------------------------------------------------
create table portal_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in (
    'platform_admin', 'retailer_admin', 'store_manager', 'staff'
  )),
  retailer_id uuid references retailers (id) on delete cascade,
  store_id uuid references stores (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, role, retailer_id, store_id)
);

create index portal_members_user_idx on portal_members (user_id);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
-- World-readable catalog additions:
alter table retailer_capabilities enable row level security;
alter table product_categories enable row level security;
alter table product_variants enable row level security;
alter table product_aliases enable row level security;
alter table search_aliases enable row level security;

create policy "Public read retailer_capabilities" on retailer_capabilities
  for select to anon, authenticated using (true);
create policy "Public read product_categories" on product_categories
  for select to anon, authenticated using (true);
create policy "Public read product_variants" on product_variants
  for select to anon, authenticated using (true);
create policy "Public read product_aliases" on product_aliases
  for select to anon, authenticated using (true);
create policy "Public read search_aliases" on search_aliases
  for select to anon, authenticated using (true);

-- Service-role only (RLS enabled, no client policies — anon/authenticated
-- cannot read or write; Edge Functions use the service role):
alter table providers enable row level security;
alter table provider_capabilities enable row level security;
alter table provider_sync_jobs enable row level security;
alter table provider_sync_logs enable row level security;
alter table provider_errors enable row level security;
alter table provider_rate_limits enable row level security;
alter table search_terms enable row level security;
alter table ai_interpretations enable row level security;
alter table location_verifications enable row level security;
alter table import_jobs enable row level security;
alter table import_audit enable row level security;
alter table portal_members enable row level security;

-- Members may read their own memberships (needed by the portal UI).
create policy "Own portal memberships" on portal_members
  for select to authenticated using (auth.uid() = user_id);
