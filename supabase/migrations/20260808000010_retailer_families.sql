-- Fetch migration 0010: retailer families and search aliases.
--
-- Kroger operates under banner names (Mariano's, Ralphs, Fred Meyer, King
-- Soopers, …). Our live Kroger integration therefore stores real, aisle-bearing
-- stores under "Mariano's" — and a shopper searching "kroger" got zero results
-- even though those are Kroger stores. Same problem for anyone searching "CVS"
-- when the row says "CVS Pharmacy", or "Sam's" for "Sam's Club".
--
-- This adds an explicit family/alias model rather than hardcoding string hacks
-- into the search function.

alter table retailers
  add column parent_company text,
  add column search_aliases text[] not null default '{}';

comment on column retailers.parent_company is
  'Operating parent, e.g. Mariano''s -> Kroger. Searching the parent surfaces '
  'every banner it operates.';
comment on column retailers.search_aliases is
  'Additional names shoppers use for this retailer.';

-- Kroger family (the banners our live Products/Locations integration covers).
update retailers set parent_company = 'Kroger'
where slug in (
  'kroger', 'marianos', 'ralphs', 'fred-meyer', 'king-soopers', 'frys-food',
  'smiths', 'qfc', 'harris-teeter', 'dillons', 'food-4-less', 'pick-n-save',
  'gerbes', 'baker-s', 'city-market', 'jay-c', 'metro-market', 'payless-super'
);

-- Common shorthands.
update retailers set search_aliases = '{"sams","sams club"}' where slug = 'sams-club';
update retailers set search_aliases = '{"walmart supercenter","wal mart"}' where slug = 'walmart';
update retailers set search_aliases = '{"cvs","cvs pharmacy"}' where slug = 'cvs';
update retailers set search_aliases = '{"bj s","bjs wholesale"}' where slug = 'bjs';
update retailers set search_aliases = '{"whole foods market"}' where slug = 'whole-foods';
update retailers set search_aliases = '{"home depot","the home depot"}' where slug = 'home-depot';
update retailers set search_aliases = '{"trader joes"}' where slug = 'trader-joes';
update retailers set search_aliases = '{"truevalue","true value hardware"}' where slug = 'true-value';

create index retailers_parent_idx on retailers (parent_company)
  where parent_company is not null;

-- ---------------------------------------------------------------------------
-- Store search 2.1 — family/alias aware, city-intent aware.
--
-- Ordering change vs 2.0: an exact city match now outranks a name *prefix*
-- match. Searching "chicago" should lead with stores in Chicago, not with
-- "Chicago Coast True Value Hardware" in alphabetical order.
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
    case
      when q.term = '' then 9
      -- The brand itself, including the operating parent and known aliases.
      when lower(r.name) = lower(q.term) or lower(s.name) = lower(q.term)
        or lower(r.parent_company) = lower(q.term)
        or lower(q.term) = any (r.search_aliases) then 0
      when s.zip = q.term then 1
      -- Place intent beats an incidental name prefix.
      when lower(s.city) = lower(q.term) then 2
      when r.name ilike q.term || '%' or s.name ilike q.term || '%' then 3
      when s.zip like q.term || '%' or lower(s.state) = lower(q.term)
        or s.store_number = q.term then 4
      when r.name ilike '%' || q.term || '%' or s.name ilike '%' || q.term || '%'
        or r.parent_company ilike '%' || q.term || '%' then 5
      else 6
    end,
    -- Within a tier, lead with stores that can actually answer a product
    -- search, then those whose own name matches the brand.
    (c.product_search is true) desc,
    (c.aisle_data is true) desc,
    store_name_matches_brand(s.name, r.name, false, s.source) desc,
    s.name
  limit 60
$$;

grant execute on function search_stores (text) to anon, authenticated;
