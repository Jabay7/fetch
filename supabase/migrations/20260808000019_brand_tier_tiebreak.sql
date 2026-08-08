-- Fetch migration 0019: order the brand tier by how plainly a store is that
-- brand.
--
-- Searching a retailer name puts every one of its stores in the top tier, and
-- the tier then fell back to alphabetical order. With 4,419 Walmart stores
-- that meant the first result was "Ford-Mercury Walmart Supercenter", and
-- "walgreens" led with "Community, a Walgreens Pharmacy". Both are real stores
-- of the right brand, but neither is what someone typing the brand expects to
-- see first.
--
-- Ordering within the tier now prefers stores whose name begins with the brand
-- over stores that merely contain it. Nothing is filtered out; only the order
-- changes.

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
    -- Lead with stores that can actually answer a product search.
    (c.product_search is true) desc,
    (c.aisle_data is true) desc,
    -- Then the plainest examples of the brand: a store called "Walmart
    -- Supercenter" before "Ford-Mercury Walmart Supercenter".
    (q.term <> '' and s.name ilike q.term || '%') desc,
    (r.name is not null and s.name ilike r.name || '%') desc,
    store_name_matches_brand(s.name, r.name, false, s.source) desc,
    s.name
  limit 60
$$;

grant execute on function search_stores (text) to anon, authenticated;
