-- Fetch migration 0007: responsive product images with provenance.
--
-- Rather than duplicating the whole import function, providers stamp image
-- variants in one focused call after their rows land. Keyed by UPC/GTIN so
-- an image can only ever attach to the exact product the provider named —
-- never by fuzzy name similarity.

create or replace function stamp_product_images(p_rows jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_row jsonb;
  v_updated int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'stamp_product_images requires a jsonb array';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    if coalesce(v_row ->> 'image_url', '') = '' then
      continue;
    end if;
    -- Identity match only: UPC, GTIN, or EAN. No name matching.
    if coalesce(v_row ->> 'upc', v_row ->> 'gtin', v_row ->> 'ean', '') = '' then
      continue;
    end if;

    update products p set
      image_url = v_row ->> 'image_url',
      thumbnail_url = coalesce(v_row ->> 'thumbnail_url', p.thumbnail_url),
      medium_image_url = coalesce(v_row ->> 'medium_image_url', p.medium_image_url),
      large_image_url = coalesce(v_row ->> 'large_image_url', p.large_image_url),
      image_source = coalesce(v_row ->> 'image_source', p.image_source),
      image_source_type = coalesce(v_row ->> 'image_source_type', p.image_source_type),
      image_verified = true,
      image_updated_at = now()
    where (v_row ->> 'upc' is not null and p.upc = v_row ->> 'upc')
       or (v_row ->> 'gtin' is not null and p.gtin = v_row ->> 'gtin')
       or (v_row ->> 'ean' is not null and p.ean = v_row ->> 'ean');

    if found then
      v_updated := v_updated + 1;
    end if;
  end loop;

  return jsonb_build_object('images_stamped', v_updated);
end;
$$;

revoke execute on function stamp_product_images (jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Search RPCs v4: return the responsive image variants so the client can
-- pick the smallest image that covers the rendered size.
-- ---------------------------------------------------------------------------
drop function if exists search_products (uuid, text, int);
drop function if exists get_product_at_store (uuid, uuid);

create or replace function search_products(
  p_store_id uuid,
  p_term text,
  p_limit int default 25
)
returns table (
  product_id uuid, variant_id uuid, name text, brand text, size_text text,
  image_url text, thumbnail_url text, medium_image_url text, large_image_url text,
  availability text, price_cents int, sale_price_cents int,
  aisle text, bay text, shelf text, section text, department text,
  display_location text, data_source text, source_provider text,
  verification_status text, score numeric, updated_at timestamptz
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
  v_like := replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_');
  v_tsq := websearch_to_tsquery('english', v_term);

  return query
  with scored as (
    select
      p.id as r_product_id, sp.product_variant_id as r_variant_id, p.name as r_name,
      p.brand as r_brand, coalesce(pv.size_text, p.size_text) as r_size_text,
      p.image_url as r_image_url, p.thumbnail_url as r_thumbnail_url,
      p.medium_image_url as r_medium_image_url, p.large_image_url as r_large_image_url,
      sp.availability::text as r_availability,
      price.regular_price_cents as r_price_cents, price.sale_price_cents as r_sale_price_cents,
      loc.aisle as r_aisle, loc.bay as r_bay, loc.shelf as r_shelf, loc.section as r_section,
      loc.department as r_department, loc.display_location as r_display_location,
      loc.data_source as r_data_source, loc.source_provider as r_source_provider,
      loc.verification_status as r_verification_status,
      greatest(sp.updated_at, coalesce(loc.updated_at, sp.updated_at)) as r_updated_at,
      case
        when lower(p.name) = v_term then 500
        when p.name ilike v_like || '%' escape '\' then 400
        when exists (select 1 from product_aliases al
          where al.product_id = p.id and lower(al.alias) = v_term) then 370
        when p.name ilike '% ' || v_like || '%' escape '\' then 340
        when exists (select 1 from product_aliases al
          where al.product_id = p.id and al.alias ilike v_like || '%' escape '\') then 330
        when p.name ilike '%' || v_like || '%' escape '\' then 280
        when (select bool_and((p.name || ' ' || coalesce(p.brand, '') || ' ' || coalesce(loc.section, ''))
            ilike '%' || t.tok || '%' escape '\')
          from unnest(string_to_array(v_like, ' ')) as t(tok)) then 250
        when p.search_tsv @@ v_tsq then 220
        when word_similarity(v_term, p.name || ' ' || coalesce(p.brand, '')) >= 0.50
          then 100 + 100 * word_similarity(v_term, p.name || ' ' || coalesce(p.brand, ''))
        else 0
      end as r_score
    from store_products sp
    join products p on p.id = sp.product_id
    left join product_variants pv on pv.id = sp.product_variant_id
    left join lateral (
      select a.code as aisle, pl.bay, pl.shelf, pl.section, d.name as department,
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
      select pr.regular_price_cents, pr.sale_price_cents from prices pr
      where pr.store_product_id = sp.id
        and (pr.expires_at is null or pr.expires_at > now())
      order by pr.captured_at desc limit 1
    ) price on true
    where sp.store_id = p_store_id and sp.active
  )
  select r_product_id, r_variant_id, r_name, r_brand, r_size_text,
    r_image_url, r_thumbnail_url, r_medium_image_url, r_large_image_url,
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

create or replace function get_product_at_store(
  p_store_id uuid,
  p_product_id uuid
)
returns table (
  product_id uuid, variant_id uuid, name text, brand text, size_text text,
  image_url text, thumbnail_url text, medium_image_url text, large_image_url text,
  description text, upc text, availability text, price_cents int, sale_price_cents int,
  aisle text, bay text, shelf text, section text, department text,
  display_location text, data_source text, source_provider text,
  verification_status text, updated_at timestamptz
)
language sql
stable
as $$
  select p.id, sp.product_variant_id, p.name, p.brand,
    coalesce(pv.size_text, p.size_text),
    p.image_url, p.thumbnail_url, p.medium_image_url, p.large_image_url,
    p.description, p.upc, sp.availability::text,
    price.regular_price_cents, price.sale_price_cents,
    loc.aisle, loc.bay, loc.shelf, loc.section, loc.department,
    loc.display_location, loc.data_source, loc.source_provider, loc.verification_status,
    greatest(sp.updated_at, coalesce(loc.updated_at, sp.updated_at))
  from store_products sp
  join products p on p.id = sp.product_id
  left join product_variants pv on pv.id = sp.product_variant_id
  left join lateral (
    select a.code as aisle, pl.bay, pl.shelf, pl.section, d.name as department,
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
    select pr.regular_price_cents, pr.sale_price_cents from prices pr
    where pr.store_product_id = sp.id
      and (pr.expires_at is null or pr.expires_at > now())
    order by pr.captured_at desc limit 1
  ) price on true
  where sp.store_id = p_store_id and sp.active and p.id = p_product_id
  limit 1
$$;

grant execute on function search_products (uuid, text, int) to anon, authenticated;
grant execute on function get_product_at_store (uuid, uuid) to anon, authenticated;
