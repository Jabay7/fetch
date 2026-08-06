-- Fetch migration 0002: multi-retailer model.
-- Adds retailers, per-store capability flags, prices, location provenance
-- (data source + confidence), operational tables for provider integrations
-- and community corrections, and future-account user tables. Replaces the
-- search RPCs so they return the new columns. Apply after 0001, before seed.

-- ---------------------------------------------------------------------------
-- Retailers and capabilities
-- ---------------------------------------------------------------------------
create table retailers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

alter table stores
  add column retailer_id uuid references retailers (id) on delete set null;

-- What each store's integration actually provides. The app only renders
-- features flagged true here.
create table store_capabilities (
  store_id uuid primary key references stores (id) on delete cascade,
  aisle_data boolean not null default false,
  inventory boolean not null default false,
  pricing boolean not null default false,
  product_images boolean not null default false,
  store_map boolean not null default false,
  realtime boolean not null default false,
  last_synced_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Location provenance. Community data may only carry COMMUNITY_VERIFIED
-- after review — raw submissions live in location_corrections, never here.
-- ---------------------------------------------------------------------------
alter table product_locations
  add column data_source text not null default 'STORE_MANAGED'
    check (data_source in ('RETAILER_API', 'STORE_MANAGED', 'COMMUNITY_VERIFIED', 'UNKNOWN')),
  add column confidence text not null default 'HIGH'
    check (confidence in ('HIGH', 'MEDIUM', 'LOW'));

-- ---------------------------------------------------------------------------
-- Prices and inventory history
-- ---------------------------------------------------------------------------
create table prices (
  store_product_id uuid primary key references store_products (id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'USD',
  updated_at timestamptz not null default now()
);

create table inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  store_product_id uuid not null references store_products (id) on delete cascade,
  availability availability_status not null,
  recorded_at timestamptz not null default now()
);

create index inventory_snapshots_sp_idx
  on inventory_snapshots (store_product_id, recorded_at desc);

-- ---------------------------------------------------------------------------
-- Provider integrations and sync logging (managed via service role / portal)
-- ---------------------------------------------------------------------------
create table provider_integrations (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid not null references retailers (id) on delete cascade,
  kind text not null check (
    kind in ('RETAILER_API', 'PARTNER_FEED', 'LICENSED_DATASET', 'STORE_MANAGED', 'CSV_IMPORT')
  ),
  enabled boolean not null default false,
  -- Non-secret configuration only; credentials belong in Edge Function secrets.
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table provider_sync_logs (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references provider_integrations (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'RUNNING' check (status in ('RUNNING', 'SUCCEEDED', 'FAILED')),
  message text
);

-- ---------------------------------------------------------------------------
-- Community corrections and store requests (write path is the portal /
-- service role; the app currently reports via email)
-- ---------------------------------------------------------------------------
create table location_corrections (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  suggested_aisle text,
  suggested_bay text,
  suggested_shelf text,
  suggested_section text,
  note text,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table store_support_requests (
  id uuid primary key default gen_random_uuid(),
  retailer_name text,
  store_text text not null,
  city text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Future-account user tables (owner-scoped; the app is account-less today
-- and keeps these lists on-device — schema is ready for opt-in sync later)
-- ---------------------------------------------------------------------------
create table user_store_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  selected_store_id uuid references stores (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table favorite_stores (
  user_id uuid not null references auth.users (id) on delete cascade,
  store_id uuid not null references stores (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, store_id)
);

create table saved_products (
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table recent_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  term text not null,
  searched_at timestamptz not null default now()
);

create index recent_searches_user_idx on recent_searches (user_id, searched_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table retailers enable row level security;
alter table store_capabilities enable row level security;
alter table prices enable row level security;
-- Service-role only (RLS enabled, no client policies):
alter table inventory_snapshots enable row level security;
alter table provider_integrations enable row level security;
alter table provider_sync_logs enable row level security;
alter table location_corrections enable row level security;
alter table store_support_requests enable row level security;
-- Owner-scoped:
alter table user_store_preferences enable row level security;
alter table favorite_stores enable row level security;
alter table saved_products enable row level security;
alter table recent_searches enable row level security;

create policy "Public read retailers" on retailers
  for select to anon, authenticated using (true);
create policy "Public read store_capabilities" on store_capabilities
  for select to anon, authenticated using (true);
create policy "Public read prices" on prices
  for select to anon, authenticated using (true);

create policy "Own store preferences" on user_store_preferences
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Own favorite stores" on favorite_stores
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Own saved products" on saved_products
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Own recent searches" on recent_searches
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- RPCs v2. Return types change, so drop and recreate.
-- ---------------------------------------------------------------------------
drop function if exists search_stores (text);
drop function if exists search_products (uuid, text, int);
drop function if exists get_product_at_store (uuid, uuid);

create or replace function search_stores(p_term text default '')
returns table (
  id uuid,
  name text,
  chain text,
  retailer_id uuid,
  retailer_name text,
  address_line text,
  city text,
  state text,
  zip text,
  cap_aisle_data boolean,
  cap_inventory boolean,
  cap_pricing boolean,
  cap_product_images boolean,
  cap_store_map boolean,
  cap_realtime boolean,
  cap_last_synced_at timestamptz
)
language sql
stable
as $$
  select
    s.id, s.name, s.chain, s.retailer_id, r.name,
    s.address_line, s.city, s.state, s.zip,
    c.aisle_data, c.inventory, c.pricing, c.product_images,
    c.store_map, c.realtime, c.last_synced_at
  from stores s
  left join retailers r on r.id = s.retailer_id
  left join store_capabilities c on c.store_id = s.id
  where btrim(coalesce(p_term, '')) = ''
     or s.name ilike '%' || p_term || '%'
     or s.city ilike '%' || p_term || '%'
     or s.address_line ilike '%' || p_term || '%'
     or s.zip ilike p_term || '%'
     or s.state ilike btrim(p_term)
     or r.name ilike '%' || p_term || '%'
  order by s.name
$$;

create or replace function get_store(p_store_id uuid)
returns table (
  id uuid,
  name text,
  chain text,
  retailer_id uuid,
  retailer_name text,
  address_line text,
  city text,
  state text,
  zip text,
  cap_aisle_data boolean,
  cap_inventory boolean,
  cap_pricing boolean,
  cap_product_images boolean,
  cap_store_map boolean,
  cap_realtime boolean,
  cap_last_synced_at timestamptz
)
language sql
stable
as $$
  select
    s.id, s.name, s.chain, s.retailer_id, r.name,
    s.address_line, s.city, s.state, s.zip,
    c.aisle_data, c.inventory, c.pricing, c.product_images,
    c.store_map, c.realtime, c.last_synced_at
  from stores s
  left join retailers r on r.id = s.retailer_id
  left join store_capabilities c on c.store_id = s.id
  where s.id = p_store_id
  limit 1
$$;

create or replace function search_products(
  p_store_id uuid,
  p_term text,
  p_limit int default 25
)
returns table (
  product_id uuid,
  name text,
  brand text,
  size_text text,
  image_url text,
  availability text,
  price_cents int,
  aisle text,
  bay text,
  shelf text,
  section text,
  department text,
  data_source text,
  updated_at timestamptz
)
language plpgsql
stable
as $$
declare
  v_term text := lower(btrim(regexp_replace(coalesce(p_term, ''), '\s+', ' ', 'g')));
  v_like text;
  v_tsq tsquery;
begin
  if length(v_term) < 2 then
    return;
  end if;

  -- Escape LIKE wildcards so user input is treated literally.
  v_like := replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_');
  v_tsq := websearch_to_tsquery('english', v_term);

  return query
  with scored as (
    select
      p.id as r_product_id,
      p.name as r_name,
      p.brand as r_brand,
      p.size_text as r_size_text,
      p.image_url as r_image_url,
      sp.availability::text as r_availability,
      pr.amount_cents as r_price_cents,
      a.code as r_aisle,
      pl.bay as r_bay,
      pl.shelf as r_shelf,
      pl.section as r_section,
      d.name as r_department,
      pl.data_source as r_data_source,
      greatest(sp.updated_at, coalesce(pl.updated_at, sp.updated_at)) as r_updated_at,
      case
        when lower(p.name) = v_term then 500
        when p.name ilike v_like || '%' escape '\' then 400
        when p.name ilike '% ' || v_like || '%' escape '\' then 340
        when p.name ilike '%' || v_like || '%' escape '\' then 280
        when (
          select bool_and(
            (p.name || ' ' || coalesce(p.brand, '') || ' ' || coalesce(pl.section, ''))
              ilike '%' || t.tok || '%' escape '\'
          )
          from unnest(string_to_array(v_like, ' ')) as t(tok)
        ) then 250
        when p.search_tsv @@ v_tsq then 220
        when word_similarity(v_term, p.name || ' ' || coalesce(p.brand, '')) >= 0.45
          then 100 + 100 * word_similarity(v_term, p.name || ' ' || coalesce(p.brand, ''))
        else 0
      end as score
    from store_products sp
    join products p on p.id = sp.product_id
    left join product_locations pl on pl.store_product_id = sp.id
    left join aisles a on a.id = pl.aisle_id
    left join departments d on d.id = pl.department_id
    left join prices pr on pr.store_product_id = sp.id
    where sp.store_id = p_store_id
  )
  select
    r_product_id, r_name, r_brand, r_size_text, r_image_url, r_availability,
    r_price_cents, r_aisle, r_bay, r_shelf, r_section, r_department,
    r_data_source, r_updated_at
  from scored
  where score > 0
  order by score desc, r_name asc
  limit least(greatest(coalesce(p_limit, 25), 1), 50);
end;
$$;

create or replace function get_product_at_store(
  p_store_id uuid,
  p_product_id uuid
)
returns table (
  product_id uuid,
  name text,
  brand text,
  size_text text,
  image_url text,
  description text,
  upc text,
  availability text,
  price_cents int,
  aisle text,
  bay text,
  shelf text,
  section text,
  department text,
  data_source text,
  updated_at timestamptz
)
language sql
stable
as $$
  select
    p.id, p.name, p.brand, p.size_text, p.image_url, p.description, p.upc,
    sp.availability::text,
    pr.amount_cents,
    a.code, pl.bay, pl.shelf, pl.section, d.name,
    pl.data_source,
    greatest(sp.updated_at, coalesce(pl.updated_at, sp.updated_at))
  from store_products sp
  join products p on p.id = sp.product_id
  left join product_locations pl on pl.store_product_id = sp.id
  left join aisles a on a.id = pl.aisle_id
  left join departments d on d.id = pl.department_id
  left join prices pr on pr.store_product_id = sp.id
  where sp.store_id = p_store_id
    and p.id = p_product_id
  limit 1
$$;

create or replace function get_departments(p_store_id uuid)
returns table (section text)
language sql
stable
as $$
  select distinct pl.section
  from product_locations pl
  join store_products sp on sp.id = pl.store_product_id
  where sp.store_id = p_store_id
    and pl.section is not null
  order by 1
$$;

grant execute on function search_stores (text) to anon, authenticated;
grant execute on function get_store (uuid) to anon, authenticated;
grant execute on function search_products (uuid, text, int) to anon, authenticated;
grant execute on function get_product_at_store (uuid, uuid) to anon, authenticated;
grant execute on function get_departments (uuid) to anon, authenticated;
