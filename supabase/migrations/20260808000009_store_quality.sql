-- Fetch migration 0009: store data quality + store search 2.0.
--
-- Three production defects this fixes:
--
--   1. Demo seed stores were discoverable in the live directory. They carry
--      illustrative aisle data, so a real shopper could have been shown an
--      aisle that was never verified anywhere. Demo data must never appear in
--      production discovery.
--
--   2. Directory imports attached unrelated POIs to real retailers — a bank,
--      a bitcoin ATM and a frozen-custard stand were all filed as Walgreens
--      stores. These come from co-located OSM nodes carrying a brand tag.
--
--   3. search_stores ordered alphabetically, so searching "walgreens" ranked
--      "Brookline Bank" first and "chicago" ranked an Evanston store first.
--
-- Deliberate nuance for (2): True Value, Ace Hardware and Do it Best are
-- *co-ops*. "Greenwood Hardware" really is a True Value member store. A naive
-- brand-name rule would have wrongly purged 97 legitimate stores, so the guard
-- is skipped for retailers flagged as independent-operator banners.

-- ---------------------------------------------------------------------------
-- 1) Demo data must never reach production discovery
-- ---------------------------------------------------------------------------
alter table stores
  add column is_demo boolean not null default false;

update stores set is_demo = true where upper(coalesce(source, '')) = 'SEED';

comment on column stores.is_demo is
  'Illustrative catalog used by the bundled demo. Never surfaced in discovery.';

-- ---------------------------------------------------------------------------
-- 2) Import review state — quarantine, never silently delete
-- ---------------------------------------------------------------------------
alter table stores
  add column review_status text not null default 'OK' check (review_status in (
    'OK', 'NEEDS_REVIEW', 'REJECTED'
  )),
  add column review_reason text;

comment on column stores.review_status is
  'Ingestion quality gate. Only OK rows are discoverable; rejected rows are '
  'retained for audit rather than deleted.';

-- Co-op / independent-operator banners, where member stores legitimately trade
-- under their own name.
alter table retailers
  add column independent_operator boolean not null default false;

update retailers set independent_operator = true
where slug in ('true-value', 'ace-hardware', 'do-it-best', 'iga', 'hardware-hank');

comment on column retailers.independent_operator is
  'Co-op banner: member stores may legitimately use their own trading name, '
  'so the brand-consistency guard does not apply.';

-- ---------------------------------------------------------------------------
-- 3) Brand-consistency guard
--
--    A directory POI is only accepted under a retailer when its name is
--    recognisably that brand. Official retailer feeds are trusted verbatim.
-- ---------------------------------------------------------------------------
create or replace function store_name_matches_brand(
  p_store_name text,
  p_retailer_name text,
  p_independent boolean default false,
  p_source text default 'OSM'
)
returns boolean
language plpgsql
immutable
as $$
declare
  v_sn text;
  v_rn text;
  v_token text;
begin
  -- Co-op members and official retailer data are always accepted.
  if coalesce(p_independent, false) then return true; end if;
  if upper(coalesce(p_source, '')) in ('RETAILER_API', 'AUTHORIZED_FEED', 'STORE_MANAGED')
    then return true; end if;
  if coalesce(btrim(p_store_name), '') = '' or coalesce(btrim(p_retailer_name), '') = ''
    then return false; end if;

  v_sn := lower(regexp_replace(p_store_name, '[^a-zA-Z0-9]', '', 'g'));
  v_rn := lower(regexp_replace(p_retailer_name, '[^a-zA-Z0-9]', '', 'g'));

  -- Whole-brand containment, ignoring punctuation and spacing:
  -- "Marianos Lakeshore East" ~ "Mariano's", "Walgreens #123" ~ "Walgreens".
  if position(v_rn in v_sn) > 0 or position(v_sn in v_rn) > 0 then return true; end if;

  -- Fall back to the leading significant word of the brand, which covers
  -- "Kroger Marketplace" and "CVS Pharmacy y mas".
  v_token := lower(regexp_replace(split_part(btrim(p_retailer_name), ' ', 1), '[^a-zA-Z0-9]', '', 'g'));
  if length(v_token) >= 4 and position(v_token in v_sn) > 0 then return true; end if;

  return false;
end;
$$;

-- Quarantine the POIs that were mis-attributed by earlier imports.
update stores s
set review_status = 'REJECTED',
    review_reason = 'Directory POI name does not match retailer brand'
from retailers r
where r.id = s.retailer_id
  and not s.is_demo
  and s.review_status = 'OK'
  and not store_name_matches_brand(s.name, r.name, r.independent_operator, s.source);

create index stores_discoverable_idx on stores (retailer_id)
  where active and lifecycle = 'ACTIVE' and review_status = 'OK' and not is_demo;

-- ---------------------------------------------------------------------------
-- 4) Single source of truth for "may this store be discovered?"
-- ---------------------------------------------------------------------------
create or replace function store_is_discoverable(p_store stores)
returns boolean
language sql
immutable
as $$
  select p_store.active
     and p_store.lifecycle = 'ACTIVE'
     and p_store.review_status = 'OK'
     and not p_store.is_demo
$$;

-- ---------------------------------------------------------------------------
-- 5) Store search 2.0 — relevance tiers
--
--    Ordering is deterministic and explainable:
--      0 exact retailer or store name          ("walgreens", "kroger")
--      1 exact ZIP                             ("60601")
--      2 retailer or store name prefix         ("walg")
--      3 exact city                            ("chicago")
--      4 ZIP prefix / state / store number
--      5 retailer or store name contains
--      6 city or street address contains
--    Ties break toward stores that can actually answer a product search,
--    then toward stores whose own name matches the brand, then by name.
-- ---------------------------------------------------------------------------
drop function if exists search_stores (text);

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
  with q as (select btrim(coalesce(p_term, '')) as term)
  select
    s.id, s.name, s.chain, s.retailer_id, r.name, r.slug,
    r.integration_status, r.website_url,
    s.address_line, s.city, s.state, s.zip, s.source,
    c.aisle_data, c.inventory, c.pricing, c.product_images,
    c.store_map, c.realtime, c.product_search, c.department_data,
    c.last_synced_at, c.last_verified_at
  from stores s
  cross join q
  left join retailers r on r.id = s.retailer_id
  left join store_capabilities c on c.store_id = s.id
  where s.active and s.lifecycle = 'ACTIVE' and s.review_status = 'OK' and not s.is_demo
    and (
      q.term = ''
      or lower(r.name) = lower(q.term)
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
    )
  order by
    case
      when q.term = '' then 9
      when lower(r.name) = lower(q.term) or lower(s.name) = lower(q.term) then 0
      when s.zip = q.term then 1
      when r.name ilike q.term || '%' or s.name ilike q.term || '%' then 2
      when lower(s.city) = lower(q.term) then 3
      when s.zip like q.term || '%' or lower(s.state) = lower(q.term)
        or s.store_number = q.term then 4
      when r.name ilike '%' || q.term || '%' or s.name ilike '%' || q.term || '%' then 5
      else 6
    end,
    (c.product_search is true) desc,
    store_name_matches_brand(s.name, r.name, false, s.source) desc,
    s.name
  limit 60
$$;

grant execute on function search_stores (text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) Nearby search + cross-store lookup honour the same gate
-- ---------------------------------------------------------------------------
drop function if exists search_stores_near (double precision, double precision, double precision, int);
drop function if exists find_product_at_stores (uuid, uuid, int);
drop function if exists find_duplicate_stores (double precision, int);

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
  address_line text, city text, state text, zip text,
  source text, distance_miles double precision,
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
    c.aisle_data, c.inventory, c.pricing, c.product_images,
    c.store_map, c.realtime, c.product_search, c.department_data,
    c.last_synced_at, c.last_verified_at
  from stores s
  left join retailers r on r.id = s.retailer_id
  left join store_capabilities c on c.store_id = s.id
  where s.active and s.lifecycle = 'ACTIVE' and s.review_status = 'OK' and not s.is_demo
    and s.latitude is not null and s.longitude is not null
    and 3958.7559 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat)) * cos(radians(s.latitude)) *
      cos(radians(s.longitude) - radians(p_lon)) +
      sin(radians(p_lat)) * sin(radians(s.latitude))
    ))) <= greatest(coalesce(p_radius_miles, 30), 0.1)
  order by distance_miles
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

grant execute on function search_stores_near (double precision, double precision, double precision, int) to anon, authenticated;

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
    and s.active and s.lifecycle = 'ACTIVE' and s.review_status = 'OK' and not s.is_demo
    and (p_exclude_store_id is null or s.id <> p_exclude_store_id)
  order by (a.code is not null) desc, s.name
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;

grant execute on function find_product_at_stores (uuid, uuid, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) Identity + dedup must ignore demo and rejected rows too, so a real
--    incoming store never resolves onto a quarantined one.
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
    case when a.source_priority >= b.source_priority then a.id else b.id end,
    case when a.source_priority >= b.source_priority then a.name else b.name end,
    case when a.source_priority >= b.source_priority then b.id else a.id end,
    case when a.source_priority >= b.source_priority then b.name else a.name end,
    r.name,
    6371000 * acos(least(1.0, greatest(-1.0,
      cos(radians(a.latitude)) * cos(radians(b.latitude)) *
      cos(radians(b.longitude) - radians(a.longitude)) +
      sin(radians(a.latitude)) * sin(radians(b.latitude))
    )))
  from stores a
  join stores b
    on b.retailer_id = a.retailer_id
   and b.id > a.id
   and b.latitude is not null and b.longitude is not null
  left join retailers r on r.id = a.retailer_id
  where a.latitude is not null and a.longitude is not null
    and a.lifecycle = 'ACTIVE' and b.lifecycle = 'ACTIVE'
    and a.review_status = 'OK' and b.review_status = 'OK'
    and not a.is_demo and not b.is_demo
    and 6371000 * acos(least(1.0, greatest(-1.0,
      cos(radians(a.latitude)) * cos(radians(b.latitude)) *
      cos(radians(b.longitude) - radians(a.longitude)) +
      sin(radians(a.latitude)) * sin(radians(b.latitude))
    ))) <= p_radius_m
    -- Same street number, or one side has no usable house number.
    and (
      substring(coalesce(a.address_normalized, '') from '^[0-9]+') is null
      or substring(coalesce(b.address_normalized, '') from '^[0-9]+') is null
      or substring(a.address_normalized from '^[0-9]+')
         = substring(b.address_normalized from '^[0-9]+')
    )
  order by 6 asc
  limit least(greatest(coalesce(p_limit, 500), 1), 2000)
$$;

-- ---------------------------------------------------------------------------
-- 8) Directory imports apply the guard at write time, so bad rows never
--    become discoverable in the first place.
-- ---------------------------------------------------------------------------
create or replace function grade_directory_store(
  p_name text,
  p_retailer_id uuid,
  p_source text
)
returns text
language sql
stable
as $$
  select case
    when store_name_matches_brand(
      p_name,
      (select r.name from retailers r where r.id = p_retailer_id),
      (select r.independent_operator from retailers r where r.id = p_retailer_id),
      p_source
    ) then 'OK'
    else 'REJECTED'
  end
$$;

-- Rewritten importer. Beyond the quality gate this also populates the identity
-- columns added in 0008 (address_normalized, source_priority) which the
-- previous version predated — without them every newly imported store was
-- invisible to address and proximity deduplication.
create or replace function import_directory_stores(p_rows jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_row jsonb;
  v_retailer_id uuid;
  v_store_id uuid;
  v_source text;
  v_review text;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_rejected int := 0;
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

    v_source := coalesce(v_row ->> 'source', 'OSM');
    v_review := grade_directory_store(v_row ->> 'name', v_retailer_id, v_source);
    if v_review <> 'OK' then
      v_rejected := v_rejected + 1;
    end if;

    -- Prefer the canonical identity ladder; fall back to source id.
    v_store_id := resolve_store_identity(
      v_retailer_id,
      nullif(v_row ->> 'provider_store_id', ''),
      nullif(v_row ->> 'store_number', ''),
      '[]'::jsonb,
      v_row ->> 'address_line',
      v_row ->> 'zip',
      nullif(v_row ->> 'latitude', '')::double precision,
      nullif(v_row ->> 'longitude', '')::double precision
    );

    if v_store_id is null then
      select s.id into v_store_id from stores s
      where s.source = v_source and s.source_id = v_row ->> 'source_id';
    end if;

    if v_store_id is null then
      insert into stores (
        retailer_id, name, chain, address_line, city, state, zip,
        latitude, longitude, phone, active,
        source, source_id, source_url, source_attribution,
        data_confidence, last_verified_at,
        address_normalized, source_priority, review_status, review_reason
      ) values (
        v_retailer_id, v_row ->> 'name', v_row ->> 'chain',
        v_row ->> 'address_line', v_row ->> 'city', v_row ->> 'state', v_row ->> 'zip',
        nullif(v_row ->> 'latitude', '')::double precision,
        nullif(v_row ->> 'longitude', '')::double precision,
        v_row ->> 'phone', true,
        v_source, v_row ->> 'source_id',
        v_row ->> 'source_url', v_row ->> 'source_attribution',
        coalesce(v_row ->> 'data_confidence', 'MEDIUM'),
        coalesce((v_row ->> 'last_verified_at')::timestamptz, now()),
        normalize_address(v_row ->> 'address_line'),
        source_priority(v_source),
        v_review,
        case when v_review = 'OK' then null
             else 'Directory POI name does not match retailer brand' end
      ) returning id into v_store_id;

      insert into store_identities (store_id, id_type, id_value, source, confidence)
      values (
        v_store_id,
        case upper(v_source) when 'OSM' then 'OSM' when 'OVERTURE' then 'GERS'
             else 'PROVIDER' end,
        v_row ->> 'source_id', v_source,
        case upper(v_source) when 'OVERTURE' then 'HIGH' else 'MEDIUM' end
      )
      on conflict (id_type, id_value) do nothing;

      insert into store_capabilities (
        store_id, aisle_data, inventory, pricing, product_images,
        store_map, realtime, product_search, department_data
      ) values (v_store_id, false, false, false, false, false, false, false, false)
      on conflict (store_id) do nothing;
      v_inserted := v_inserted + 1;
    else
      -- Never let a weaker directory source overwrite stronger official data.
      update stores s set
        name = case when source_priority(v_source) >= s.source_priority
                    then v_row ->> 'name' else s.name end,
        latitude = coalesce(nullif(v_row ->> 'latitude', '')::double precision, s.latitude),
        longitude = coalesce(nullif(v_row ->> 'longitude', '')::double precision, s.longitude),
        phone = coalesce(v_row ->> 'phone', s.phone),
        address_normalized = coalesce(s.address_normalized, normalize_address(s.address_line)),
        last_verified_at = now()
      where s.id = v_store_id;
      v_updated := v_updated + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted, 'updated', v_updated,
    'skipped', v_skipped, 'rejected', v_rejected,
    'unknown_retailers', v_unknown_retailers
  );
end;
$$;

revoke execute on function import_directory_stores (jsonb) from public, anon, authenticated;
