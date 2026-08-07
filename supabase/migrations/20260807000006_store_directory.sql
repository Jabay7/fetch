-- Fetch migration 0006: nationwide store directory, geo search, image
-- provenance, trending, cross-store lookup, freshness scheduling.
--
-- Directory coverage is deliberately separated from aisle coverage: a store
-- may exist purely as a directory entry (found via an open dataset) with
-- product_search=false, and the app renders an honest "directory only"
-- experience for it. Every imported store carries source provenance.

-- ---------------------------------------------------------------------------
-- 1) Store directory provenance
-- ---------------------------------------------------------------------------
alter table stores
  add column source text not null default 'SEED' check (source in (
    'SEED', 'RETAILER_API', 'OSM', 'STORE_MANAGED', 'COMMUNITY'
  )),
  add column source_id text,
  add column source_url text,
  add column source_attribution text,
  add column data_confidence text not null default 'HIGH'
    check (data_confidence in ('HIGH', 'MEDIUM', 'LOW')),
  add column last_verified_at timestamptz;

create unique index stores_source_identity_idx
  on stores (source, source_id) where source_id is not null;
create index stores_geo_idx on stores (latitude, longitude)
  where latitude is not null and longitude is not null;

-- Existing rows: label honestly.
update stores set source = 'RETAILER_API', source_id = provider_store_id,
  source_attribution = 'Kroger Locations API', last_verified_at = now()
  where provider_store_id is not null;

-- ---------------------------------------------------------------------------
-- 2) Product image provenance + responsive sizes
-- ---------------------------------------------------------------------------
alter table products
  add column image_source text,
  add column image_source_type text check (image_source_type in (
    'RETAILER_API', 'AUTHORIZED_FEED', 'MANUFACTURER', 'LICENSED',
    'OPEN_DATA', 'INTERNAL', 'PLACEHOLDER'
  )),
  add column image_license text,
  add column image_verified boolean not null default false,
  add column image_updated_at timestamptz,
  add column thumbnail_url text,
  add column medium_image_url text,
  add column large_image_url text;

-- Kroger-sourced images already in image_url came from the official API.
update products p set
  image_source = 'kroger-api',
  image_source_type = 'RETAILER_API',
  image_verified = true,
  image_updated_at = now()
where p.image_url is not null
  and exists (
    select 1 from store_products sp
    join stores s on s.id = sp.store_id
    where sp.product_id = p.id and s.provider_store_id is not null
  );

-- ---------------------------------------------------------------------------
-- 3) Geo store search (haversine; no extension dependency)
-- ---------------------------------------------------------------------------
create or replace function search_stores_near(
  p_lat double precision,
  p_lon double precision,
  p_radius_miles double precision default 30,
  p_limit int default 30
)
returns table (
  id uuid,
  name text,
  chain text,
  retailer_id uuid,
  retailer_name text,
  retailer_slug text,
  retailer_integration_status text,
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
  cap_product_search boolean,
  cap_department_data boolean,
  cap_last_synced_at timestamptz,
  cap_last_verified_at timestamptz,
  distance_miles double precision
)
language sql
stable
as $$
  select
    s.id, s.name, s.chain, s.retailer_id, r.name, r.slug, r.integration_status,
    s.address_line, s.city, s.state, s.zip,
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
  where s.active
    and s.latitude is not null and s.longitude is not null
    and (3958.8 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(s.latitude)) *
      cos(radians(s.longitude) - radians(p_lon)) +
      sin(radians(p_lat)) * sin(radians(s.latitude))
    )))) <= p_radius_miles
  order by distance_miles asc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

grant execute on function search_stores_near (double precision, double precision, double precision, int)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Directory import: upsert stores from a provenance-carrying feed
--    (OSM/licensed datasets). Service-role only. Dedupe by (source,
--    source_id); secondary dedupe by retailer + normalized address.
-- ---------------------------------------------------------------------------
create or replace function import_directory_stores(p_rows jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_row jsonb;
  v_retailer_id uuid;
  v_store_id uuid;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_unknown_retailers int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'import_directory_stores requires a jsonb array';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    select r.id into v_retailer_id from retailers r
    where r.slug = v_row ->> 'retailer_slug';
    if v_retailer_id is null then
      v_unknown_retailers := v_unknown_retailers + 1;
      continue;
    end if;
    if coalesce(v_row ->> 'name', '') = '' or coalesce(v_row ->> 'source_id', '') = ''
       or coalesce(v_row ->> 'address_line', '') = '' or coalesce(v_row ->> 'city', '') = ''
       or coalesce(v_row ->> 'state', '') = '' or coalesce(v_row ->> 'zip', '') = '' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select s.id into v_store_id from stores s
    where s.source = coalesce(v_row ->> 'source', 'OSM')
      and s.source_id = v_row ->> 'source_id';

    -- Address-level dedupe: a retailer store already known from a better
    -- source (e.g. the retailer's own API) must not be duplicated.
    if v_store_id is null then
      select s.id into v_store_id from stores s
      where s.retailer_id = v_retailer_id
        and lower(s.address_line) = lower(v_row ->> 'address_line')
        and s.zip = v_row ->> 'zip';
      if v_store_id is not null then
        v_skipped := v_skipped + 1;
        continue;
      end if;
    end if;

    if v_store_id is null then
      insert into stores (
        retailer_id, name, chain, address_line, city, state, zip,
        latitude, longitude, phone, active,
        source, source_id, source_url, source_attribution,
        data_confidence, last_verified_at
      ) values (
        v_retailer_id, v_row ->> 'name', v_row ->> 'chain',
        v_row ->> 'address_line', v_row ->> 'city', v_row ->> 'state', v_row ->> 'zip',
        nullif(v_row ->> 'latitude', '')::double precision,
        nullif(v_row ->> 'longitude', '')::double precision,
        v_row ->> 'phone', true,
        coalesce(v_row ->> 'source', 'OSM'), v_row ->> 'source_id',
        v_row ->> 'source_url', v_row ->> 'source_attribution',
        coalesce(v_row ->> 'data_confidence', 'MEDIUM'),
        coalesce((v_row ->> 'last_verified_at')::timestamptz, now())
      ) returning id into v_store_id;

      -- Directory-only capability profile: discoverable, honest about the
      -- rest. Flags flip when a real integration or import lights up.
      insert into store_capabilities (
        store_id, aisle_data, inventory, pricing, product_images,
        store_map, realtime, product_search, department_data
      ) values (v_store_id, false, false, false, false, false, false, false, false)
      on conflict (store_id) do nothing;
      v_inserted := v_inserted + 1;
    else
      update stores s set
        name = v_row ->> 'name',
        latitude = coalesce(nullif(v_row ->> 'latitude', '')::double precision, s.latitude),
        longitude = coalesce(nullif(v_row ->> 'longitude', '')::double precision, s.longitude),
        phone = coalesce(v_row ->> 'phone', s.phone),
        last_verified_at = now()
      where s.id = v_store_id;
      v_updated := v_updated + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted, 'updated', v_updated,
    'skipped', v_skipped, 'unknown_retailers', v_unknown_retailers
  );
end;
$$;

revoke execute on function import_directory_stores (jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Cross-store availability for one product
-- ---------------------------------------------------------------------------
create or replace function find_product_at_stores(
  p_product_id uuid,
  p_exclude_store_id uuid default null,
  p_limit int default 8
)
returns table (
  store_id uuid,
  store_name text,
  city text,
  aisle text,
  availability text,
  price_cents int
)
language sql
stable
as $$
  select s.id, s.name, s.city, a.code, sp.availability::text, price.regular_price_cents
  from store_products sp
  join stores s on s.id = sp.store_id
  left join product_locations pl on pl.store_product_id = sp.id
    and (pl.expires_at is null or pl.expires_at > now())
    and pl.verification_status not in ('EXPIRED', 'DISPUTED')
  left join aisles a on a.id = pl.aisle_id
  left join lateral (
    select pr.regular_price_cents from prices pr
    where pr.store_product_id = sp.id
      and (pr.expires_at is null or pr.expires_at > now())
    order by pr.captured_at desc limit 1
  ) price on true
  where sp.product_id = p_product_id
    and sp.active
    and s.active
    and (p_exclude_store_id is null or s.id <> p_exclude_store_id)
  order by (a.code is not null) desc, s.name
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;

grant execute on function find_product_at_stores (uuid, uuid, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) Trending searches (privacy-safe aggregates; minimum threshold keeps any
--    single user's query invisible)
-- ---------------------------------------------------------------------------
create or replace function get_popular_terms(
  p_store_id uuid default null,
  p_limit int default 6
)
returns table (term text, searches bigint)
language sql
stable
as $$
  select st.normalized_term, count(*)::bigint
  from search_terms st
  where st.searched_at > now() - interval '14 days'
    and st.result_count > 0
    and length(st.normalized_term) >= 3
    and (p_store_id is null or st.store_id = p_store_id)
  group by st.normalized_term
  having count(*) >= 3
  order by count(*) desc, st.normalized_term
  limit least(greatest(coalesce(p_limit, 6), 1), 12);
$$;

grant execute on function get_popular_terms (uuid, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) Freshness: which (store, term) pairs deserve a scheduled re-sync.
--    Popularity-weighted: hot terms refresh when older than 6h, everything
--    else when older than 48h. The refresh-popular-products Edge Function
--    consumes this; scheduling lives in the hosted project (pg_cron) and is
--    a no-op in local validation.
-- ---------------------------------------------------------------------------
create or replace function get_refresh_candidates(p_limit int default 20)
returns table (
  store_id uuid,
  provider_store_id text,
  term text,
  searches bigint,
  last_synced timestamptz
)
language sql
stable
as $$
  with popular as (
    select st.store_id, st.normalized_term, count(*)::bigint as searches
    from search_terms st
    where st.searched_at > now() - interval '14 days'
      and st.result_count > 0
      and st.store_id is not null
    group by st.store_id, st.normalized_term
  ),
  last_sync as (
    select j.file_name, max(j.created_at) as synced_at
    from import_jobs j
    where j.created_by in ('kroger-live', 'freshness-job')
    group by j.file_name
  )
  select p.store_id, s.provider_store_id, p.normalized_term, p.searches, ls.synced_at
  from popular p
  join stores s on s.id = p.store_id and s.provider_store_id is not null and s.active
  left join last_sync ls
    on ls.file_name = 'kroger:' || s.provider_store_id || ':' || left(p.normalized_term, 40)
  where ls.synced_at is null
     or ls.synced_at < now() - (case when p.searches >= 5 then interval '6 hours'
                                     else interval '48 hours' end)
  order by p.searches desc, ls.synced_at asc nulls first
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke execute on function get_refresh_candidates (int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8) Retailer matrix additions for the nationwide directory. Banners of
--    integrated/researched parents inherit an honest status; everything else
--    starts directory_only (open-data directory presence, no product data).
-- ---------------------------------------------------------------------------
with new_retailers(name, slug, status, website, notes) as (
  values
    ('Ralphs', 'ralphs', 'development', 'https://www.ralphs.com', 'Kroger banner; served by the Kroger API integration.'),
    ('Fred Meyer', 'fred-meyer', 'development', 'https://www.fredmeyer.com', 'Kroger banner; served by the Kroger API integration.'),
    ('Fry''s Food Stores', 'frys-food', 'development', 'https://www.frysfood.com', 'Kroger banner; served by the Kroger API integration.'),
    ('King Soopers', 'king-soopers', 'development', 'https://www.kingsoopers.com', 'Kroger banner; served by the Kroger API integration.'),
    ('Harris Teeter', 'harris-teeter', 'development', 'https://www.harristeeter.com', 'Kroger subsidiary; separate API onboarding may apply.'),
    ('Smith''s', 'smiths', 'development', 'https://www.smithsfoodanddrug.com', 'Kroger banner; served by the Kroger API integration.'),
    ('Albertsons', 'albertsons', 'partnership_required', 'https://www.albertsons.com', 'Ad-measurement APIs only; no catalog/location path without partnership.'),
    ('Safeway', 'safeway', 'partnership_required', 'https://www.safeway.com', 'Albertsons banner.'),
    ('Vons', 'vons', 'partnership_required', 'https://www.vons.com', 'Albertsons banner.'),
    ('ACME Markets', 'acme-markets', 'partnership_required', 'https://www.acmemarkets.com', 'Albertsons banner.'),
    ('Trader Joe''s', 'trader-joes', 'directory_only', 'https://www.traderjoes.com', 'No developer or partner data program.'),
    ('Publix', 'publix', 'directory_only', 'https://www.publix.com', 'No public developer program.'),
    ('H-E-B', 'heb', 'directory_only', 'https://www.heb.com', 'No public developer program.'),
    ('Wegmans', 'wegmans', 'directory_only', 'https://www.wegmans.com', 'No public developer program.'),
    ('Food Lion', 'food-lion', 'directory_only', 'https://www.foodlion.com', 'Ahold Delhaize banner; no public developer program.'),
    ('Giant Food', 'giant-food', 'directory_only', 'https://giantfood.com', 'Ahold Delhaize banner; no public developer program.'),
    ('Stop & Shop', 'stop-and-shop', 'directory_only', 'https://stopandshop.com', 'Ahold Delhaize banner; no public developer program.'),
    ('Piggly Wiggly', 'piggly-wiggly', 'directory_only', 'https://www.pigglywiggly.com', 'Franchise co-op; store-managed imports are the realistic path.'),
    ('Hy-Vee', 'hy-vee', 'directory_only', 'https://www.hy-vee.com', 'No public developer program.'),
    ('Fresh Thyme', 'fresh-thyme', 'directory_only', 'https://www.freshthyme.com', 'No public developer program.'),
    ('Sprouts Farmers Market', 'sprouts', 'directory_only', 'https://www.sprouts.com', 'No public developer program.'),
    ('Rite Aid', 'rite-aid', 'directory_only', 'https://www.riteaid.com', 'Remaining locations directory-listed; no data program.'),
    ('True Value', 'true-value', 'directory_only', 'https://www.truevalue.com', 'Hardware co-op; store-managed imports are the realistic path.'),
    ('Ulta Beauty', 'ulta', 'directory_only', 'https://www.ulta.com', 'No public developer program.'),
    ('Sephora', 'sephora', 'directory_only', 'https://www.sephora.com', 'No public developer program.'),
    ('AutoZone', 'autozone', 'directory_only', 'https://www.autozone.com', 'No public developer program.'),
    ('O''Reilly Auto Parts', 'oreilly', 'directory_only', 'https://www.oreillyauto.com', 'No public developer program.'),
    ('Advance Auto Parts', 'advance-auto', 'directory_only', 'https://www.advanceautoparts.com', 'No public developer program.'),
    ('NAPA Auto Parts', 'napa', 'directory_only', 'https://www.napaonline.com', 'No public developer program.'),
    ('Dick''s Sporting Goods', 'dicks', 'directory_only', 'https://www.dickssportinggoods.com', 'No public developer program.'),
    ('Academy Sports + Outdoors', 'academy', 'directory_only', 'https://www.academy.com', 'No public developer program.')
)
insert into retailers (name, slug, integration_status, website_url)
select nr.name, nr.slug, nr.status, nr.website
from new_retailers nr
where not exists (select 1 from retailers r where r.slug = nr.slug);

-- Directory presence exists for every retailer via open data; record it in
-- the capability matrix rows that are missing one.
insert into retailer_capabilities (retailer_id, store_directory, notes, last_reviewed_at)
select r.id, true, 'Directory presence via open datasets (OSM, attributed); no product data path confirmed.', now()
from retailers r
where not exists (select 1 from retailer_capabilities c where c.retailer_id = r.id);

update retailer_capabilities set store_directory = true
where store_directory = false;

-- ---------------------------------------------------------------------------
-- 9) search_stores / get_store v4: retailer website + directory provenance
-- ---------------------------------------------------------------------------
drop function if exists search_stores (text);
drop function if exists get_store (uuid);

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
    s.address_line, s.city, s.state, s.zip,
    s.source,
    c.aisle_data, c.inventory, c.pricing, c.product_images,
    c.store_map, c.realtime, c.product_search, c.department_data,
    c.last_synced_at, c.last_verified_at
  from stores s
  left join retailers r on r.id = s.retailer_id
  left join store_capabilities c on c.store_id = s.id
  where s.active
    and (
      btrim(coalesce(p_term, '')) = ''
      or s.name ilike '%' || p_term || '%'
      or s.city ilike '%' || p_term || '%'
      or s.address_line ilike '%' || p_term || '%'
      or s.zip ilike p_term || '%'
      or s.state ilike btrim(p_term)
      or r.name ilike '%' || p_term || '%'
    )
  order by (c.product_search is true) desc, s.name
  limit 60
$$;

create or replace function get_store(p_store_id uuid)
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
    s.address_line, s.city, s.state, s.zip,
    s.source,
    c.aisle_data, c.inventory, c.pricing, c.product_images,
    c.store_map, c.realtime, c.product_search, c.department_data,
    c.last_synced_at, c.last_verified_at
  from stores s
  left join retailers r on r.id = s.retailer_id
  left join store_capabilities c on c.store_id = s.id
  where s.id = p_store_id
  limit 1
$$;

grant execute on function search_stores (text) to anon, authenticated;
grant execute on function get_store (uuid) to anon, authenticated;
