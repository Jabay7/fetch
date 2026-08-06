-- Fetch migration 0004: search RPCs v3.
--
-- Rebuilds the public read API over the 0003 schema:
--   * store rows gain retailer slug/status and the new capability flags
--   * product rows gain sale price, provenance, verification, display
--     location, variant identity, and the raw ranking score
--   * locations are omitted when expired or disputed — accuracy first
--   * prices come from the newest non-expired history row
--   * an exact-identifier lookup (UPC / GTIN / EAN / retailer SKU /
--     provider id) serves tier 1 of the deterministic pipeline
--
-- Ranking tiers mirror src/data/ranking.ts (change both + tests together):
--   exact name 500 > name prefix 400 > exact alias 370 > word prefix 340
--   > alias prefix 330 > substring 280 > all-tokens 250 > full-text 220
--   > trigram fuzzy 100–200. The client's synonym/plural expansion
--   (expandSearchTerms) and the Edge Function's search_aliases expansion
--   both re-call these RPCs per candidate term.

drop function if exists search_stores (text);
drop function if exists get_store (uuid);
drop function if exists search_products (uuid, text, int);
drop function if exists get_product_at_store (uuid, uuid);
drop function if exists get_departments (uuid);

-- ---------------------------------------------------------------------------
-- Stores
-- ---------------------------------------------------------------------------
create or replace function search_stores(p_term text default '')
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
  cap_last_verified_at timestamptz
)
language sql
stable
as $$
  select
    s.id, s.name, s.chain, s.retailer_id, r.name, r.slug, r.integration_status,
    s.address_line, s.city, s.state, s.zip,
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
  order by s.name
$$;

create or replace function get_store(p_store_id uuid)
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
  cap_last_verified_at timestamptz
)
language sql
stable
as $$
  select
    s.id, s.name, s.chain, s.retailer_id, r.name, r.slug, r.integration_status,
    s.address_line, s.city, s.state, s.zip,
    c.aisle_data, c.inventory, c.pricing, c.product_images,
    c.store_map, c.realtime, c.product_search, c.department_data,
    c.last_synced_at, c.last_verified_at
  from stores s
  left join retailers r on r.id = s.retailer_id
  left join store_capabilities c on c.store_id = s.id
  where s.id = p_store_id
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- Product search (single term; callers expand synonyms/plurals per candidate)
-- ---------------------------------------------------------------------------
create or replace function search_products(
  p_store_id uuid,
  p_term text,
  p_limit int default 25
)
returns table (
  product_id uuid,
  variant_id uuid,
  name text,
  brand text,
  size_text text,
  image_url text,
  availability text,
  price_cents int,
  sale_price_cents int,
  aisle text,
  bay text,
  shelf text,
  section text,
  department text,
  display_location text,
  data_source text,
  source_provider text,
  verification_status text,
  score numeric,
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
      sp.product_variant_id as r_variant_id,
      p.name as r_name,
      p.brand as r_brand,
      coalesce(pv.size_text, p.size_text) as r_size_text,
      p.image_url as r_image_url,
      sp.availability::text as r_availability,
      price.regular_price_cents as r_price_cents,
      price.sale_price_cents as r_sale_price_cents,
      loc.aisle as r_aisle,
      loc.bay as r_bay,
      loc.shelf as r_shelf,
      loc.section as r_section,
      loc.department as r_department,
      loc.display_location as r_display_location,
      loc.data_source as r_data_source,
      loc.source_provider as r_source_provider,
      loc.verification_status as r_verification_status,
      greatest(sp.updated_at, coalesce(loc.updated_at, sp.updated_at)) as r_updated_at,
      case
        when lower(p.name) = v_term then 500
        when p.name ilike v_like || '%' escape '\' then 400
        when exists (
          select 1 from product_aliases al
          where al.product_id = p.id and lower(al.alias) = v_term
        ) then 370
        when p.name ilike '% ' || v_like || '%' escape '\' then 340
        when exists (
          select 1 from product_aliases al
          where al.product_id = p.id
            and al.alias ilike v_like || '%' escape '\'
        ) then 330
        when p.name ilike '%' || v_like || '%' escape '\' then 280
        when (
          select bool_and(
            (p.name || ' ' || coalesce(p.brand, '') || ' ' || coalesce(loc.section, ''))
              ilike '%' || t.tok || '%' escape '\'
          )
          from unnest(string_to_array(v_like, ' ')) as t(tok)
        ) then 250
        when p.search_tsv @@ v_tsq then 220
        when word_similarity(v_term, p.name || ' ' || coalesce(p.brand, '')) >= 0.50
          then 100 + 100 * word_similarity(v_term, p.name || ' ' || coalesce(p.brand, ''))
        else 0
      end as r_score
    from store_products sp
    join products p on p.id = sp.product_id
    left join product_variants pv on pv.id = sp.product_variant_id
    left join lateral (
      select
        a.code as aisle, pl.bay, pl.shelf, pl.section, d.name as department,
        pl.display_location, pl.data_source, pl.source_provider,
        pl.verification_status, pl.updated_at
      from product_locations pl
      left join aisles a on a.id = pl.aisle_id
      left join departments d on d.id = pl.department_id
      where pl.store_product_id = sp.id
        and (pl.expires_at is null or pl.expires_at > now())
        and pl.verification_status not in ('EXPIRED', 'DISPUTED')
    ) loc on true
    left join lateral (
      select pr.regular_price_cents, pr.sale_price_cents
      from prices pr
      where pr.store_product_id = sp.id
        and (pr.expires_at is null or pr.expires_at > now())
      order by pr.captured_at desc
      limit 1
    ) price on true
    where sp.store_id = p_store_id
      and sp.active
  )
  select
    r_product_id, r_variant_id, r_name, r_brand, r_size_text, r_image_url,
    r_availability, r_price_cents, r_sale_price_cents,
    r_aisle, r_bay, r_shelf, r_section, r_department, r_display_location,
    r_data_source, r_source_provider, r_verification_status,
    r_score::numeric, r_updated_at
  from scored
  where r_score > 0
  order by r_score desc, r_name asc
  limit least(greatest(coalesce(p_limit, 25), 1), 50);
end;
$$;

-- ---------------------------------------------------------------------------
-- Exact identifier lookup: tier 1 of the deterministic pipeline. Matches
-- product UPC/GTIN/EAN, variant UPC/GTIN, retailer SKU, or provider product
-- id — always scoped to one store.
-- ---------------------------------------------------------------------------
create or replace function lookup_store_product(
  p_store_id uuid,
  p_code text
)
returns table (
  product_id uuid,
  variant_id uuid,
  name text,
  brand text,
  size_text text,
  image_url text,
  availability text,
  price_cents int,
  sale_price_cents int,
  aisle text,
  bay text,
  shelf text,
  section text,
  department text,
  display_location text,
  data_source text,
  source_provider text,
  verification_status text,
  matched_identifier text,
  updated_at timestamptz
)
language sql
stable
as $$
  select
    p.id,
    sp.product_variant_id,
    p.name,
    p.brand,
    coalesce(pv.size_text, p.size_text),
    p.image_url,
    sp.availability::text,
    price.regular_price_cents,
    price.sale_price_cents,
    loc.aisle, loc.bay, loc.shelf, loc.section, loc.department,
    loc.display_location, loc.data_source, loc.source_provider,
    loc.verification_status,
    case
      when p.upc = btrim(p_code) then 'UPC'
      when p.gtin = btrim(p_code) then 'GTIN'
      when p.ean = btrim(p_code) then 'EAN'
      when pv.upc = btrim(p_code) then 'VARIANT_UPC'
      when pv.gtin = btrim(p_code) then 'VARIANT_GTIN'
      when sp.retailer_sku = btrim(p_code) then 'RETAILER_SKU'
      else 'PROVIDER_PRODUCT_ID'
    end,
    greatest(sp.updated_at, coalesce(loc.updated_at, sp.updated_at))
  from store_products sp
  join products p on p.id = sp.product_id
  left join product_variants pv on pv.id = sp.product_variant_id
  left join lateral (
    select
      a.code as aisle, pl.bay, pl.shelf, pl.section, d.name as department,
      pl.display_location, pl.data_source, pl.source_provider,
      pl.verification_status, pl.updated_at
    from product_locations pl
    left join aisles a on a.id = pl.aisle_id
    left join departments d on d.id = pl.department_id
    where pl.store_product_id = sp.id
      and (pl.expires_at is null or pl.expires_at > now())
      and pl.verification_status not in ('EXPIRED', 'DISPUTED')
  ) loc on true
  left join lateral (
    select pr.regular_price_cents, pr.sale_price_cents
    from prices pr
    where pr.store_product_id = sp.id
      and (pr.expires_at is null or pr.expires_at > now())
    order by pr.captured_at desc
    limit 1
  ) price on true
  where sp.store_id = p_store_id
    and sp.active
    and btrim(coalesce(p_code, '')) <> ''
    and (
      p.upc = btrim(p_code)
      or p.gtin = btrim(p_code)
      or p.ean = btrim(p_code)
      or pv.upc = btrim(p_code)
      or pv.gtin = btrim(p_code)
      or sp.retailer_sku = btrim(p_code)
      or sp.provider_product_id = btrim(p_code)
    )
  limit 5
$$;

-- ---------------------------------------------------------------------------
-- Product details at one store
-- ---------------------------------------------------------------------------
create or replace function get_product_at_store(
  p_store_id uuid,
  p_product_id uuid
)
returns table (
  product_id uuid,
  variant_id uuid,
  name text,
  brand text,
  size_text text,
  image_url text,
  description text,
  upc text,
  availability text,
  price_cents int,
  sale_price_cents int,
  aisle text,
  bay text,
  shelf text,
  section text,
  department text,
  display_location text,
  data_source text,
  source_provider text,
  verification_status text,
  updated_at timestamptz
)
language sql
stable
as $$
  select
    p.id,
    sp.product_variant_id,
    p.name,
    p.brand,
    coalesce(pv.size_text, p.size_text),
    p.image_url,
    p.description,
    p.upc,
    sp.availability::text,
    price.regular_price_cents,
    price.sale_price_cents,
    loc.aisle, loc.bay, loc.shelf, loc.section, loc.department,
    loc.display_location, loc.data_source, loc.source_provider,
    loc.verification_status,
    greatest(sp.updated_at, coalesce(loc.updated_at, sp.updated_at))
  from store_products sp
  join products p on p.id = sp.product_id
  left join product_variants pv on pv.id = sp.product_variant_id
  left join lateral (
    select
      a.code as aisle, pl.bay, pl.shelf, pl.section, d.name as department,
      pl.display_location, pl.data_source, pl.source_provider,
      pl.verification_status, pl.updated_at
    from product_locations pl
    left join aisles a on a.id = pl.aisle_id
    left join departments d on d.id = pl.department_id
    where pl.store_product_id = sp.id
      and (pl.expires_at is null or pl.expires_at > now())
      and pl.verification_status not in ('EXPIRED', 'DISPUTED')
  ) loc on true
  left join lateral (
    select pr.regular_price_cents, pr.sale_price_cents
    from prices pr
    where pr.store_product_id = sp.id
      and (pr.expires_at is null or pr.expires_at > now())
    order by pr.captured_at desc
    limit 1
  ) price on true
  where sp.store_id = p_store_id
    and sp.active
    and p.id = p_product_id
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- Departments present at one store
-- ---------------------------------------------------------------------------
create or replace function get_departments(p_store_id uuid)
returns table (section text)
language sql
stable
as $$
  select distinct pl.section
  from product_locations pl
  join store_products sp on sp.id = pl.store_product_id
  where sp.store_id = p_store_id
    and sp.active
    and pl.section is not null
  order by 1
$$;

-- ---------------------------------------------------------------------------
-- Query-level alias expansions for a term (deterministic step 3; the client
-- mock provider keeps its own copy in src/data/ranking.ts SYNONYMS)
-- ---------------------------------------------------------------------------
create or replace function get_search_expansions(p_term text)
returns table (expansion text)
language sql
stable
as $$
  select sa.expansion
  from search_aliases sa
  where lower(sa.term) = lower(btrim(coalesce(p_term, '')))
  order by sa.expansion
$$;

grant execute on function search_stores (text) to anon, authenticated;
grant execute on function get_store (uuid) to anon, authenticated;
grant execute on function search_products (uuid, text, int) to anon, authenticated;
grant execute on function lookup_store_product (uuid, text) to anon, authenticated;
grant execute on function get_product_at_store (uuid, uuid) to anon, authenticated;
grant execute on function get_departments (uuid) to anon, authenticated;
grant execute on function get_search_expansions (text) to anon, authenticated;
