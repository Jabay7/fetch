-- Fetch: product-locator schema.
-- Apply with the Supabase SQL editor (paste this file, run, then seed.sql)
-- or the Supabase CLI: `supabase db push` from the repo root.
--
-- Security model: the mobile app connects with the anon (publishable) key.
-- Row-level security allows SELECT only; all writes happen through the
-- dashboard/service role. The search RPCs are STABLE and respect RLS.

create extension if not exists pg_trgm;

create type availability_status as enum (
  'IN_STOCK',
  'LOW_STOCK',
  'OUT_OF_STOCK',
  'UNKNOWN'
);

create table stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  chain text,
  address_line text not null,
  city text not null,
  state text not null,
  zip text not null,
  created_at timestamptz not null default now()
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

-- Aisles belong to a store; codes are opaque display strings ("G18", "12").
create table aisles (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  code text not null,
  label text,
  unique (store_id, code)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  size_text text,
  description text,
  upc text unique,
  image_url text,
  search_tsv tsvector generated always as (
    to_tsvector('english', coalesce(brand, '') || ' ' || name || ' ' || coalesce(description, ''))
  ) stored
);

-- A product carried by a store, with its stock signal.
create table store_products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  availability availability_status not null default 'UNKNOWN',
  updated_at timestamptz not null default now(),
  unique (store_id, product_id)
);

-- Planogram data. A store_product may have no row here ("aisle unknown").
-- Hanging locations off store_products makes cross-store aisle leakage
-- structurally impossible.
create table product_locations (
  id uuid primary key default gen_random_uuid(),
  store_product_id uuid not null unique references store_products (id) on delete cascade,
  aisle_id uuid references aisles (id) on delete set null,
  bay text,
  shelf text,
  section text,
  department_id uuid references departments (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index products_name_trgm_idx on products using gin (name gin_trgm_ops);
create index products_search_tsv_idx on products using gin (search_tsv);
create index store_products_store_idx on store_products (store_id);
create index product_locations_sp_idx on product_locations (store_product_id);
create index aisles_store_idx on aisles (store_id);

-- Row-level security: catalog is world-readable, never writable by clients.
alter table stores enable row level security;
alter table departments enable row level security;
alter table aisles enable row level security;
alter table products enable row level security;
alter table store_products enable row level security;
alter table product_locations enable row level security;

create policy "Public read stores" on stores for select to anon, authenticated using (true);
create policy "Public read departments" on departments for select to anon, authenticated using (true);
create policy "Public read aisles" on aisles for select to anon, authenticated using (true);
create policy "Public read products" on products for select to anon, authenticated using (true);
create policy "Public read store_products" on store_products for select to anon, authenticated using (true);
create policy "Public read product_locations" on product_locations for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Store search: name / city / state / ZIP / address, case-insensitive.
-- ---------------------------------------------------------------------------
create or replace function search_stores(p_term text default '')
returns table (
  id uuid,
  name text,
  chain text,
  address_line text,
  city text,
  state text,
  zip text
)
language sql
stable
as $$
  select s.id, s.name, s.chain, s.address_line, s.city, s.state, s.zip
  from stores s
  where btrim(coalesce(p_term, '')) = ''
     or s.name ilike '%' || p_term || '%'
     or s.city ilike '%' || p_term || '%'
     or s.address_line ilike '%' || p_term || '%'
     or s.zip ilike p_term || '%'
     or s.state ilike btrim(p_term)
  order by s.name
$$;

-- ---------------------------------------------------------------------------
-- Product search, scoped to one store. Ranking tiers mirror src/data/ranking.ts:
--   exact name (500) > name prefix (400) > word prefix (340) > substring (280)
--   > all tokens present (250) > full-text (220) > trigram fuzzy (100+).
-- ---------------------------------------------------------------------------
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
  aisle text,
  bay text,
  shelf text,
  section text,
  department text,
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
      a.code as r_aisle,
      pl.bay as r_bay,
      pl.shelf as r_shelf,
      pl.section as r_section,
      d.name as r_department,
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
    where sp.store_id = p_store_id
  )
  select
    r_product_id, r_name, r_brand, r_size_text, r_image_url, r_availability,
    r_aisle, r_bay, r_shelf, r_section, r_department, r_updated_at
  from scored
  where score > 0
  order by score desc, r_name asc
  limit least(greatest(coalesce(p_limit, 25), 1), 50);
end;
$$;

-- ---------------------------------------------------------------------------
-- Product details at one store. Empty result = store doesn't carry it.
-- ---------------------------------------------------------------------------
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
  aisle text,
  bay text,
  shelf text,
  section text,
  department text,
  updated_at timestamptz
)
language sql
stable
as $$
  select
    p.id, p.name, p.brand, p.size_text, p.image_url, p.description, p.upc,
    sp.availability::text,
    a.code, pl.bay, pl.shelf, pl.section, d.name,
    greatest(sp.updated_at, coalesce(pl.updated_at, sp.updated_at))
  from store_products sp
  join products p on p.id = sp.product_id
  left join product_locations pl on pl.store_product_id = sp.id
  left join aisles a on a.id = pl.aisle_id
  left join departments d on d.id = pl.department_id
  where sp.store_id = p_store_id
    and p.id = p_product_id
  limit 1
$$;

grant execute on function search_stores (text) to anon, authenticated;
grant execute on function search_products (uuid, text, int) to anon, authenticated;
grant execute on function get_product_at_store (uuid, uuid) to anon, authenticated;
