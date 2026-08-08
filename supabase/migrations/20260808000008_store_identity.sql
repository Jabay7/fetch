-- Fetch migration 0008: canonical store identity, lifecycle, source priority.
--
-- One physical store can be described by many providers (Kroger location id,
-- Overture GERS id, an OSM node, a retailer store number). Previously each
-- arrival could create a row. This migration makes identity explicit:
--
--   stores            one row per *physical* store (canonical)
--   store_identities  every external id that resolves to it
--
-- Resolution follows a strict priority ladder (see resolve_store_identity),
-- and field updates follow a strict source-priority rule: weaker directory
-- data can never overwrite official retailer data.

-- ---------------------------------------------------------------------------
-- 1) Lifecycle
-- ---------------------------------------------------------------------------
alter table stores
  add column lifecycle text not null default 'ACTIVE' check (lifecycle in (
    'ACTIVE', 'TEMPORARILY_CLOSED', 'PERMANENTLY_CLOSED', 'UNKNOWN',
    'DUPLICATE', 'RELOCATED'
  )),
  -- When lifecycle = DUPLICATE / RELOCATED, the surviving store.
  add column merged_into_id uuid references stores (id) on delete set null,
  add column lifecycle_updated_at timestamptz not null default now();

create index stores_lifecycle_idx on stores (lifecycle) where lifecycle = 'ACTIVE';

-- Discovery must only surface stores that are actually open. `active` stays
-- as the operator kill-switch; lifecycle carries provider-reported state.
comment on column stores.lifecycle is
  'Provider-reported state. Only ACTIVE stores appear in discovery.';

-- ---------------------------------------------------------------------------
-- 2) External identities
-- ---------------------------------------------------------------------------
create table store_identities (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  id_type text not null check (id_type in (
    'RETAILER_PROVIDER',   -- e.g. Kroger locationId (strongest)
    'RETAILER_STORE_NUMBER',
    'GERS',                -- Overture global entity reference
    'OSM',                 -- type/id, e.g. node/123
    'PROVIDER',            -- any other trusted provider key
    'INTERNAL'
  )),
  id_value text not null,
  /** Which provider asserted this identity. */
  source text not null,
  confidence text not null default 'HIGH' check (confidence in ('HIGH','MEDIUM','LOW')),
  created_at timestamptz not null default now(),
  unique (id_type, id_value)
);

create index store_identities_store_idx on store_identities (store_id);

-- Service-role only: external ids are an ingestion concern, not client data.
alter table store_identities enable row level security;

-- Backfill from what we already know.
insert into store_identities (store_id, id_type, id_value, source, confidence)
select id, 'RETAILER_PROVIDER', provider_store_id, 'kroger-api', 'HIGH'
from stores where provider_store_id is not null
on conflict (id_type, id_value) do nothing;

insert into store_identities (store_id, id_type, id_value, source, confidence)
select id, 'OSM', source_id, 'osm', 'MEDIUM'
from stores where source = 'OSM' and source_id is not null
on conflict (id_type, id_value) do nothing;

-- ---------------------------------------------------------------------------
-- 3) Source priority — higher wins; never overwritten by a lower source.
-- ---------------------------------------------------------------------------
create or replace function source_priority(p_source text)
returns int
language sql
immutable
as $$
  select case upper(coalesce(p_source, ''))
    when 'RETAILER_API' then 100
    when 'AUTHORIZED_FEED' then 80
    when 'STORE_MANAGED' then 60
    when 'OVERTURE' then 40
    when 'OSM' then 30
    when 'COMMUNITY' then 10
    when 'SEED' then 5
    else 0
  end
$$;

alter table stores
  add column source_priority int not null default 0;
update stores set source_priority = source_priority(source);

-- ---------------------------------------------------------------------------
-- 4) Address normalization (deterministic, for identity matching only —
--    the display address is always the provider's own text)
-- ---------------------------------------------------------------------------
create or replace function normalize_address(p_address text)
returns text
language plpgsql
immutable
as $$
declare
  v text := lower(coalesce(p_address, ''));
begin
  v := regexp_replace(v, '[.,#]', '', 'g');
  v := regexp_replace(v, '\y(avenue)\y', 'ave', 'g');
  v := regexp_replace(v, '\y(street)\y', 'st', 'g');
  v := regexp_replace(v, '\y(road)\y', 'rd', 'g');
  v := regexp_replace(v, '\y(drive)\y', 'dr', 'g');
  v := regexp_replace(v, '\y(boulevard|blvd)\y', 'blvd', 'g');
  v := regexp_replace(v, '\y(highway)\y', 'hwy', 'g');
  v := regexp_replace(v, '\y(parkway)\y', 'pkwy', 'g');
  v := regexp_replace(v, '\y(lane)\y', 'ln', 'g');
  v := regexp_replace(v, '\y(court)\y', 'ct', 'g');
  v := regexp_replace(v, '\y(place)\y', 'pl', 'g');
  v := regexp_replace(v, '\y(suite|ste|unit)\y.*$', '', 'g');
  v := regexp_replace(v, '\y(north)\y', 'n', 'g');
  v := regexp_replace(v, '\y(south)\y', 's', 'g');
  v := regexp_replace(v, '\y(east)\y', 'e', 'g');
  v := regexp_replace(v, '\y(west)\y', 'w', 'g');
  v := regexp_replace(v, '\s+', ' ', 'g');
  return nullif(btrim(v), '');
end;
$$;

alter table stores add column address_normalized text;
update stores set address_normalized = normalize_address(address_line);

create index stores_addr_norm_idx on stores (retailer_id, address_normalized, zip);

-- ---------------------------------------------------------------------------
-- 5) Identity resolution: given an incoming place, which canonical store is
--    it? Returns null when it is genuinely new.
--
--    Ladder (first match wins):
--      1 official retailer provider id
--      2 retailer + official store number
--      3 stable external identity (GERS / OSM / provider key)
--      4 retailer + normalized address + zip
--      5 retailer + proximity (<= p_radius_m) AND compatible address
--    Proximity alone never merges two stores — a mall can hold two branches,
--    so rule 5 additionally requires the normalized street numbers to agree
--    or one side to be missing an address.
-- ---------------------------------------------------------------------------
create or replace function resolve_store_identity(
  p_retailer_id uuid,
  p_provider_store_id text default null,
  p_store_number text default null,
  p_identities jsonb default '[]'::jsonb,   -- [{id_type, id_value}]
  p_address_line text default null,
  p_zip text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_radius_m double precision default 60
)
returns uuid
language plpgsql
stable
as $$
declare
  v_store_id uuid;
  v_identity jsonb;
  v_norm text := normalize_address(p_address_line);
  v_house text := substring(coalesce(v_norm, '') from '^[0-9]+');
begin
  -- 1) official retailer provider id
  if p_provider_store_id is not null then
    select s.id into v_store_id from stores s
    where s.retailer_id = p_retailer_id and s.provider_store_id = p_provider_store_id;
    if v_store_id is not null then return v_store_id; end if;
  end if;

  -- 2) retailer + official store number
  if p_store_number is not null then
    select s.id into v_store_id from stores s
    where s.retailer_id = p_retailer_id and s.store_number = p_store_number;
    if v_store_id is not null then return v_store_id; end if;
  end if;

  -- 3) any stable external identity we have already seen
  for v_identity in select * from jsonb_array_elements(coalesce(p_identities, '[]'::jsonb)) loop
    select si.store_id into v_store_id from store_identities si
    where si.id_type = v_identity ->> 'id_type'
      and si.id_value = v_identity ->> 'id_value';
    if v_store_id is not null then return v_store_id; end if;
  end loop;

  -- 4) retailer + normalized address + zip
  if v_norm is not null and p_zip is not null then
    select s.id into v_store_id from stores s
    where s.retailer_id = p_retailer_id
      and s.address_normalized = v_norm
      and s.zip = p_zip
    limit 1;
    if v_store_id is not null then return v_store_id; end if;
  end if;

  -- 5) retailer + tight proximity, with a compatible address
  if p_latitude is not null and p_longitude is not null then
    select s.id into v_store_id from stores s
    where s.retailer_id = p_retailer_id
      and s.latitude is not null and s.longitude is not null
      and (3958.8 * acos(least(1.0, greatest(-1.0,
        cos(radians(p_latitude)) * cos(radians(s.latitude)) *
        cos(radians(s.longitude) - radians(p_longitude)) +
        sin(radians(p_latitude)) * sin(radians(s.latitude))
      )))) * 1609.34 <= p_radius_m
      and (
        v_house is null
        or s.address_normalized is null
        or substring(s.address_normalized from '^[0-9]+') is null
        or substring(s.address_normalized from '^[0-9]+') = v_house
      )
    order by (3958.8 * acos(least(1.0, greatest(-1.0,
        cos(radians(p_latitude)) * cos(radians(s.latitude)) *
        cos(radians(s.longitude) - radians(p_longitude)) +
        sin(radians(p_latitude)) * sin(radians(s.latitude))
      ))))
    limit 1;
    if v_store_id is not null then return v_store_id; end if;
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Merge duplicates: keep the higher-priority record, move identities and
--    store_products across, and mark the loser DUPLICATE (never delete —
--    the id may be persisted on someone's device).
-- ---------------------------------------------------------------------------
create or replace function merge_duplicate_stores(p_keep uuid, p_merge uuid)
returns jsonb
language plpgsql
as $$
declare
  v_moved_identities int := 0;
  v_moved_products int := 0;
begin
  if p_keep = p_merge then
    raise exception 'cannot merge a store into itself';
  end if;

  update store_identities set store_id = p_keep
  where store_id = p_merge
    and not exists (
      select 1 from store_identities k
      where k.store_id = p_keep and k.id_type = store_identities.id_type
        and k.id_value = store_identities.id_value
    );
  get diagnostics v_moved_identities = row_count;

  -- Only move product rows the survivor lacks; never clobber richer data.
  update store_products sp set store_id = p_keep
  where sp.store_id = p_merge
    and not exists (
      select 1 from store_products k
      where k.store_id = p_keep and k.product_id = sp.product_id
    );
  get diagnostics v_moved_products = row_count;

  update stores set
    lifecycle = 'DUPLICATE',
    merged_into_id = p_keep,
    lifecycle_updated_at = now(),
    active = false
  where id = p_merge;

  return jsonb_build_object(
    'kept', p_keep, 'merged', p_merge,
    'identities_moved', v_moved_identities,
    'store_products_moved', v_moved_products
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Duplicate detection sweep: same retailer, within radius, compatible
--    address. Returns pairs for review/merge; does not mutate.
-- ---------------------------------------------------------------------------
create or replace function find_duplicate_stores(
  p_radius_m double precision default 60,
  p_limit int default 500
)
returns table (
  keep_id uuid, keep_name text, merge_id uuid, merge_name text,
  retailer text, meters double precision
)
language sql
stable
as $$
  select
    case when source_priority(a.source) >= source_priority(b.source) then a.id else b.id end,
    case when source_priority(a.source) >= source_priority(b.source) then a.name else b.name end,
    case when source_priority(a.source) >= source_priority(b.source) then b.id else a.id end,
    case when source_priority(a.source) >= source_priority(b.source) then b.name else a.name end,
    r.name,
    (3958.8 * acos(least(1.0, greatest(-1.0,
      cos(radians(a.latitude)) * cos(radians(b.latitude)) *
      cos(radians(b.longitude) - radians(a.longitude)) +
      sin(radians(a.latitude)) * sin(radians(b.latitude))
    )))) * 1609.34
  from stores a
  join stores b on a.retailer_id = b.retailer_id and a.id < b.id
  left join retailers r on r.id = a.retailer_id
  where a.lifecycle = 'ACTIVE' and b.lifecycle = 'ACTIVE'
    and a.latitude is not null and b.latitude is not null
    and (3958.8 * acos(least(1.0, greatest(-1.0,
      cos(radians(a.latitude)) * cos(radians(b.latitude)) *
      cos(radians(b.longitude) - radians(a.longitude)) +
      sin(radians(a.latitude)) * sin(radians(b.latitude))
    )))) * 1609.34 <= p_radius_m
    and (
      a.address_normalized is null or b.address_normalized is null
      or substring(a.address_normalized from '^[0-9]+') is null
      or substring(b.address_normalized from '^[0-9]+') is null
      or substring(a.address_normalized from '^[0-9]+') = substring(b.address_normalized from '^[0-9]+')
    )
  order by 6 asc
  limit least(greatest(coalesce(p_limit, 500), 1), 2000)
$$;

revoke execute on function merge_duplicate_stores (uuid, uuid) from public, anon, authenticated;
revoke execute on function find_duplicate_stores (double precision, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8) Discovery RPCs must exclude non-active lifecycle states.
--    (Return shapes change, so drop before recreating.)
-- ---------------------------------------------------------------------------
drop function if exists search_stores (text);
drop function if exists search_stores_near (double precision, double precision, double precision, int);

create or replace function search_stores(p_term text default '')
returns table (
  id uuid, name text, chain text,
  retailer_id uuid, retailer_name text, retailer_slug text,
  retailer_integration_status text, retailer_website_url text,
  address_line text, city text, state text, zip text,
  source text,
  cap_aisle_data boolean, cap_inventory boolean, cap_pricing boolean,
  cap_product_images boolean, cap_store_map boolean, cap_realtime boolean,
  cap_product_search boolean, cap_department_data boolean,
  cap_last_synced_at timestamptz, cap_last_verified_at timestamptz
)
language sql
stable
as $$
  select
    s.id, s.name, s.chain, s.retailer_id, r.name, r.slug,
    r.integration_status, r.website_url,
    s.address_line, s.city, s.state, s.zip, s.source,
    c.aisle_data, c.inventory, c.pricing, c.product_images,
    c.store_map, c.realtime, c.product_search, c.department_data,
    c.last_synced_at, c.last_verified_at
  from stores s
  left join retailers r on r.id = s.retailer_id
  left join store_capabilities c on c.store_id = s.id
  where s.active and s.lifecycle = 'ACTIVE'
    and (
      btrim(coalesce(p_term, '')) = ''
      or s.name ilike '%' || p_term || '%'
      or s.city ilike '%' || p_term || '%'
      or s.address_line ilike '%' || p_term || '%'
      or s.zip ilike p_term || '%'
      or s.state ilike btrim(p_term)
      or s.store_number = btrim(p_term)
      or r.name ilike '%' || p_term || '%'
    )
  order by (c.product_search is true) desc, s.name
  limit 60
$$;

create or replace function search_stores_near(
  p_lat double precision,
  p_lon double precision,
  p_radius_miles double precision default 30,
  p_limit int default 30
)
returns table (
  id uuid, name text, chain text,
  retailer_id uuid, retailer_name text, retailer_slug text,
  retailer_integration_status text, retailer_website_url text,
  address_line text, city text, state text, zip text, source text,
  cap_aisle_data boolean, cap_inventory boolean, cap_pricing boolean,
  cap_product_images boolean, cap_store_map boolean, cap_realtime boolean,
  cap_product_search boolean, cap_department_data boolean,
  cap_last_synced_at timestamptz, cap_last_verified_at timestamptz,
  distance_miles double precision
)
language sql
stable
as $$
  select
    s.id, s.name, s.chain, s.retailer_id, r.name, r.slug,
    r.integration_status, r.website_url,
    s.address_line, s.city, s.state, s.zip, s.source,
    c.aisle_data, c.inventory, c.pricing, c.product_images,
    c.store_map, c.realtime, c.product_search, c.department_data,
    c.last_synced_at, c.last_verified_at,
    (3958.8 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(s.latitude)) *
      cos(radians(s.longitude) - radians(p_lon)) +
      sin(radians(p_lat)) * sin(radians(s.latitude))
    )))) as distance_miles
  from stores s
  left join retailers r on r.id = s.retailer_id
  left join store_capabilities c on c.store_id = s.id
  where s.active and s.lifecycle = 'ACTIVE'
    and s.latitude is not null and s.longitude is not null
    and (3958.8 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(s.latitude)) *
      cos(radians(s.longitude) - radians(p_lon)) +
      sin(radians(p_lat)) * sin(radians(s.latitude))
    )))) <= p_radius_miles
  order by distance_miles asc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

grant execute on function search_stores (text) to anon, authenticated;
grant execute on function search_stores_near (double precision, double precision, double precision, int) to anon, authenticated;
