-- Fetch migration 0020: store coverage tiers.
--
-- The directory holds 40,128 stores. Seven of them can answer a product
-- search. Presenting those two groups identically is the central product
-- failure: a shopper picks a store, searches, and finds nothing — having been
-- given no way to know that was the expected outcome.
--
-- A store's usefulness is now an explicit, measured property rather than an
-- implication of its existence:
--
--   FULL_LOCATION  products + images + availability + aisle or department
--   PRODUCT        products + images + availability, no verified aisle yet
--   COMMUNITY      real store whose locations come from verified contributors
--   COMING_SOON    a directory record and nothing else
--
-- Discovery defaults to the first three. COMING_SOON stores stay reachable
-- behind an explicit "more stores" path, where they become an acquisition
-- funnel (request support, help map, claim this store) instead of a dead end.
--
-- Directory data is never deleted. It remains the substrate for outreach,
-- nearby-store awareness, and community bootstrapping.

-- ---------------------------------------------------------------------------
-- 1) Activation thresholds
--
-- A single test product must not flip a store to "supported". These are the
-- minimum real catalogs at which a store starts being useful rather than
-- misleading, expressed as a function so the values are documented in one
-- place and testable.
-- ---------------------------------------------------------------------------
create or replace function coverage_threshold(p_kind text)
returns int
language sql
immutable
as $$
  select case p_kind
    -- A store-managed or imported catalog worth calling searchable.
    when 'CATALOG' then 50
    -- Verified locations before a store is called location-supported.
    when 'LOCATIONS' then 25
    -- Community-mapped locations before a store is offered as community-supported.
    when 'COMMUNITY' then 25
    else 0
  end
$$;

-- ---------------------------------------------------------------------------
-- 2) Measured coverage, one row per store
-- ---------------------------------------------------------------------------
create table store_coverage (
  store_id uuid primary key references stores (id) on delete cascade,
  support_tier text not null default 'COMING_SOON' check (support_tier in (
    'FULL_LOCATION', 'PRODUCT', 'COMMUNITY', 'COMING_SOON'
  )),
  /** True when a live retailer integration answers searches for this store,
      regardless of how much has been cached locally so far. */
  provider_backed boolean not null default false,
  product_count int not null default 0,
  image_count int not null default 0,
  aisle_location_count int not null default 0,
  department_location_count int not null default 0,
  official_location_count int not null default 0,
  community_location_count int not null default 0,
  price_count int not null default 0,
  inventory_count int not null default 0,
  last_product_sync_at timestamptz,
  computed_at timestamptz not null default now()
);

create index store_coverage_tier_idx on store_coverage (support_tier);

alter table store_coverage enable row level security;

-- Coverage is public: shoppers are told plainly what a store can do.
create policy "Coverage is readable" on store_coverage for select using (true);

comment on table store_coverage is
  'Measured, refreshed answer to "what can this store actually do for a '
  'shopper?" Never hand-set — always derived by refresh_store_coverage.';

-- ---------------------------------------------------------------------------
-- 3) Refresh — set-based so a full sweep over the directory stays cheap
-- ---------------------------------------------------------------------------
create or replace function refresh_store_coverage(p_store_id uuid default null)
returns int
language plpgsql
as $$
declare
  v_rows int;
begin
  insert into store_coverage as sc (
    store_id, support_tier, provider_backed, product_count, image_count,
    aisle_location_count, department_location_count, official_location_count,
    community_location_count, price_count, inventory_count,
    last_product_sync_at, computed_at
  )
  select
    s.id,
    case
      -- A live retailer integration can answer any search on demand, so its
      -- tier comes from the integration's capabilities rather than from how
      -- much happens to be cached.
      when m.provider_backed and m.cap_aisle then 'FULL_LOCATION'
      when m.provider_backed then 'PRODUCT'
      -- Otherwise the store has to have earned it with real data.
      when m.product_count >= coverage_threshold('CATALOG')
        and m.official_location_count >= coverage_threshold('LOCATIONS')
        then 'FULL_LOCATION'
      when m.product_count >= coverage_threshold('CATALOG') then 'PRODUCT'
      when m.community_location_count >= coverage_threshold('COMMUNITY') then 'COMMUNITY'
      else 'COMING_SOON'
    end,
    m.provider_backed, m.product_count, m.image_count,
    m.aisle_location_count, m.department_location_count, m.official_location_count,
    m.community_location_count, m.price_count, m.inventory_count,
    m.last_product_sync_at, now()
  from stores s
  -- Joined before the lateral: a LATERAL may only reference FROM items that
  -- precede it.
  left join retailers r on r.id = s.retailer_id
  left join store_capabilities c on c.store_id = s.id
  cross join lateral (
    select
      coalesce(r.integration_status = 'live'
        and s.provider_store_id is not null
        and c.product_search, false) as provider_backed,
      coalesce(c.aisle_data, false) as cap_aisle,
      count(sp.id) filter (where sp.active) as product_count,
      count(distinct p.id) filter (
        where p.thumbnail_url is not null or p.image_url is not null
      ) as image_count,
      count(pl.id) filter (where pl.aisle_id is not null) as aisle_location_count,
      count(pl.id) filter (
        where pl.aisle_id is null and pl.department_id is not null
      ) as department_location_count,
      count(pl.id) filter (
        where pl.data_source in ('RETAILER_API', 'AUTHORIZED_FEED', 'STORE_MANAGED')
      ) as official_location_count,
      count(pl.id) filter (
        where pl.data_source = 'COMMUNITY_VERIFIED'
          and pl.verification_status in ('VERIFIED', 'COMMUNITY_VERIFIED')
      ) as community_location_count,
      count(distinct pr.store_product_id) as price_count,
      count(sp.id) filter (where sp.availability <> 'UNKNOWN') as inventory_count,
      max(sp.last_seen_at) as last_product_sync_at
    from store_products sp
    left join products p on p.id = sp.product_id
    left join product_locations pl on pl.store_product_id = sp.id
      and (pl.expires_at is null or pl.expires_at > now())
      and pl.verification_status not in ('EXPIRED', 'DISPUTED')
    left join prices pr on pr.store_product_id = sp.id
      and (pr.expires_at is null or pr.expires_at > now())
    where sp.store_id = s.id
  ) m
  where p_store_id is null or s.id = p_store_id
  on conflict (store_id) do update set
    support_tier = excluded.support_tier,
    provider_backed = excluded.provider_backed,
    product_count = excluded.product_count,
    image_count = excluded.image_count,
    aisle_location_count = excluded.aisle_location_count,
    department_location_count = excluded.department_location_count,
    official_location_count = excluded.official_location_count,
    community_location_count = excluded.community_location_count,
    price_count = excluded.price_count,
    inventory_count = excluded.inventory_count,
    last_product_sync_at = excluded.last_product_sync_at,
    computed_at = now();

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function refresh_store_coverage (uuid) from public;

-- Seed the table for every existing store.
select refresh_store_coverage();

-- ---------------------------------------------------------------------------
-- 4) Discovery honours the tier
--
-- p_tier: 'SUPPORTED' (default) returns only stores that can help a shopper.
--         'COMING_SOON' returns the directory-only remainder.
--         'ALL' returns both, for admin and nearby-awareness use.
-- ---------------------------------------------------------------------------
drop function if exists search_stores (text);

create or replace function search_stores(
  p_term text default '',
  p_tier text default 'SUPPORTED'
)
returns table (
  id uuid, name text, chain text,
  retailer_id uuid, retailer_name text, retailer_slug text,
  retailer_integration_status text, retailer_website_url text,
  address_line text, city text, state text, zip text,
  source text,
  support_tier text, product_count int, aisle_location_count int,
  community_location_count int,
  cap_aisle_data boolean, cap_inventory boolean, cap_pricing boolean,
  cap_product_images boolean, cap_store_map boolean, cap_realtime boolean,
  cap_product_search boolean, cap_department_data boolean,
  cap_last_synced_at timestamptz, cap_last_verified_at timestamptz
)
language sql
stable
as $$
  with q as (
    select btrim(coalesce(p_term, '')) as term,
           upper(coalesce(p_tier, 'SUPPORTED')) as tier
  )
  select
    s.id, s.name, s.chain, s.retailer_id, r.name, r.slug,
    r.integration_status, r.website_url,
    s.address_line, s.city, s.state, s.zip, s.source,
    coalesce(v.support_tier, 'COMING_SOON'),
    coalesce(v.product_count, 0), coalesce(v.aisle_location_count, 0),
    coalesce(v.community_location_count, 0),
    c.aisle_data, c.inventory, c.pricing, c.product_images,
    c.store_map, c.realtime, c.product_search, c.department_data,
    c.last_synced_at, c.last_verified_at
  from stores s
  cross join q
  left join retailers r on r.id = s.retailer_id
  left join store_capabilities c on c.store_id = s.id
  left join store_coverage v on v.store_id = s.id
  where s.active and s.lifecycle = 'ACTIVE' and s.review_status = 'OK' and not s.is_demo
    and (
      q.tier = 'ALL'
      or (q.tier = 'SUPPORTED'
          and coalesce(v.support_tier, 'COMING_SOON') <> 'COMING_SOON')
      or (q.tier = 'COMING_SOON'
          and coalesce(v.support_tier, 'COMING_SOON') = 'COMING_SOON')
    )
    and (
      q.term = ''
      or lower(r.name) = lower(q.term)
      or lower(r.parent_company) = lower(q.term)
      or lower(q.term) = any (r.search_aliases)
      or lower(s.name) = lower(q.term)
      or s.zip = q.term
      or lower(s.city) = lower(q.term)
      or s.name ilike '%' || q.term || '%'
      or s.city ilike '%' || q.term || '%'
      or s.address_line ilike '%' || q.term || '%'
      or s.zip like q.term || '%'
      or lower(s.state) = lower(q.term)
      or s.store_number = q.term
      or r.name ilike '%' || q.term || '%'
      or r.parent_company ilike '%' || q.term || '%'
    )
  order by
    -- Usefulness first: a store that can answer the shopper's next question
    -- outranks a closer or alphabetically earlier one that cannot.
    case coalesce(v.support_tier, 'COMING_SOON')
      when 'FULL_LOCATION' then 0 when 'PRODUCT' then 1
      when 'COMMUNITY' then 2 else 3 end,
    case
      when q.term = '' then 9
      when lower(r.name) = lower(q.term) or lower(s.name) = lower(q.term)
        or lower(r.parent_company) = lower(q.term)
        or lower(q.term) = any (r.search_aliases) then 0
      when s.zip = q.term then 1
      when lower(s.city) = lower(q.term) then 2
      when r.name ilike q.term || '%' or s.name ilike q.term || '%' then 3
      when s.zip like q.term || '%' or lower(s.state) = lower(q.term)
        or s.store_number = q.term then 4
      when r.name ilike '%' || q.term || '%' or s.name ilike '%' || q.term || '%'
        or r.parent_company ilike '%' || q.term || '%' then 5
      else 6
    end,
    (q.term <> '' and s.name ilike q.term || '%') desc,
    (r.name is not null and s.name ilike r.name || '%') desc,
    store_name_matches_brand(s.name, r.name, false, s.source) desc,
    s.name
  limit 60
$$;

grant execute on function search_stores (text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Nearby search, same gate — plus the tier so the UI can label each pin
-- ---------------------------------------------------------------------------
drop function if exists search_stores_near (double precision, double precision, double precision, int);

create or replace function search_stores_near(
  p_lat double precision,
  p_lon double precision,
  p_radius_miles double precision default 30,
  p_limit int default 30,
  p_tier text default 'SUPPORTED'
)
returns table (
  id uuid, name text, chain text,
  retailer_id uuid, retailer_name text, retailer_slug text,
  retailer_integration_status text, retailer_website_url text,
  address_line text, city text, state text, zip text,
  source text, distance_miles double precision,
  support_tier text, product_count int, aisle_location_count int,
  community_location_count int,
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
    3958.7559 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(s.latitude)) *
      cos(radians(s.longitude) - radians(p_lon)) +
      sin(radians(p_lat)) * sin(radians(s.latitude))
    ))) as distance_miles,
    coalesce(v.support_tier, 'COMING_SOON'),
    coalesce(v.product_count, 0), coalesce(v.aisle_location_count, 0),
    coalesce(v.community_location_count, 0),
    c.aisle_data, c.inventory, c.pricing, c.product_images,
    c.store_map, c.realtime, c.product_search, c.department_data,
    c.last_synced_at, c.last_verified_at
  from stores s
  left join retailers r on r.id = s.retailer_id
  left join store_capabilities c on c.store_id = s.id
  left join store_coverage v on v.store_id = s.id
  where s.active and s.lifecycle = 'ACTIVE' and s.review_status = 'OK' and not s.is_demo
    and s.latitude is not null and s.longitude is not null
    and (
      upper(coalesce(p_tier, 'SUPPORTED')) = 'ALL'
      or (upper(coalesce(p_tier, 'SUPPORTED')) = 'SUPPORTED'
          and coalesce(v.support_tier, 'COMING_SOON') <> 'COMING_SOON')
      or (upper(coalesce(p_tier, 'SUPPORTED')) = 'COMING_SOON'
          and coalesce(v.support_tier, 'COMING_SOON') = 'COMING_SOON')
    )
    and 3958.7559 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(s.latitude)) *
      cos(radians(s.longitude) - radians(p_lon)) +
      sin(radians(p_lat)) * sin(radians(s.latitude))
    ))) <= greatest(coalesce(p_radius_miles, 30), 0.1)
  order by
    case coalesce(v.support_tier, 'COMING_SOON')
      when 'FULL_LOCATION' then 0 when 'PRODUCT' then 1
      when 'COMMUNITY' then 2 else 3 end,
    distance_miles
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

grant execute on function search_stores_near (double precision, double precision, double precision, int, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) get_store exposes the tier too, so a store screen can be honest before
--    the shopper types anything.
-- ---------------------------------------------------------------------------
drop function if exists get_store (uuid);

create or replace function get_store(p_store_id uuid)
returns table (
  id uuid, name text, chain text,
  retailer_id uuid, retailer_name text, retailer_slug text,
  retailer_integration_status text, retailer_website_url text,
  address_line text, city text, state text, zip text,
  source text,
  support_tier text, product_count int, aisle_location_count int,
  community_location_count int,
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
    coalesce(v.support_tier, 'COMING_SOON'),
    coalesce(v.product_count, 0), coalesce(v.aisle_location_count, 0),
    coalesce(v.community_location_count, 0),
    c.aisle_data, c.inventory, c.pricing, c.product_images,
    c.store_map, c.realtime, c.product_search, c.department_data,
    c.last_synced_at, c.last_verified_at
  from stores s
  left join retailers r on r.id = s.retailer_id
  left join store_capabilities c on c.store_id = s.id
  left join store_coverage v on v.store_id = s.id
  where s.id = resolve_store_redirect(p_store_id)
    and s.active and s.lifecycle = 'ACTIVE'
    and s.review_status = 'OK' and not s.is_demo
$$;

grant execute on function get_store (uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) Coverage dashboard — the honest numbers, replacing the vanity count
-- ---------------------------------------------------------------------------
create or replace function get_coverage_summary()
returns table (
  directory_stores int,
  full_location_stores int,
  product_stores int,
  community_stores int,
  coming_soon_stores int,
  searchable_stores int,
  universal_products int,
  store_product_mappings int,
  products_with_images int,
  image_coverage_pct numeric,
  product_locations int,
  official_locations int,
  community_locations int
)
language sql
stable
as $$
  select
    (select count(*)::int from stores
      where active and lifecycle = 'ACTIVE' and review_status = 'OK' and not is_demo),
    (select count(*)::int from store_coverage where support_tier = 'FULL_LOCATION'),
    (select count(*)::int from store_coverage where support_tier = 'PRODUCT'),
    (select count(*)::int from store_coverage where support_tier = 'COMMUNITY'),
    (select count(*)::int from store_coverage where support_tier = 'COMING_SOON'),
    (select count(*)::int from store_coverage where support_tier <> 'COMING_SOON'),
    (select count(*)::int from products),
    (select count(*)::int from store_products where active),
    (select count(*)::int from products
      where thumbnail_url is not null or image_url is not null),
    (select case when count(*) = 0 then 0
       else round(100.0 * count(*) filter (
         where thumbnail_url is not null or image_url is not null) / count(*), 1)
     end from products),
    (select count(*)::int from product_locations),
    (select count(*)::int from product_locations
      where data_source in ('RETAILER_API', 'AUTHORIZED_FEED', 'STORE_MANAGED')),
    (select count(*)::int from product_locations
      where data_source = 'COMMUNITY_VERIFIED')
$$;

grant execute on function get_coverage_summary () to anon, authenticated;

-- An ingestion constant, not part of the public API.
revoke all on function coverage_threshold (text) from public;
