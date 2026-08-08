-- Fetch migration 0021: activate the Kroger banner family, and bring the
-- cached provider data inside Kroger's terms.
--
-- TWO SEPARATE THINGS HAPPEN HERE. Read both.
--
-- ---------------------------------------------------------------------------
-- A) ACTIVATION — the coverage win
--
-- Kroger operates ~2,700 US stores under 24 banners, and one set of API
-- credentials answers for all of them. Every such store can return real
-- aisles, prices and stock on demand, so each one is a FULL_LOCATION store the
-- moment it exists. Twelve banners had no retailer row, so their stores were
-- skipped at import. Creating them converts thousands of directory records
-- into searchable stores without any new credential.
--
-- ---------------------------------------------------------------------------
-- B) COMPLIANCE — a real problem with the existing design
--
-- Kroger's Acceptable Use policy and Terms of Service prohibit what our
-- cache-through sync was doing. Verbatim, from the Products API acceptable-use
-- page:
--
--   "Systematically scraping or gathering response data to create a database.
--    This includes using bots or crawlers to retrieve data from our APIs."
--
-- and from Terms of Service section 5(e):
--
--   "Scrape, build databases, or otherwise create permanent copies of such
--    content, or keep cached copies longer than permitted by the cache header"
--
-- We were persisting Kroger products, prices and aisle locations indefinitely.
-- That is a permanent copy, and it is not permitted regardless of volume.
--
-- The fix is to treat provider-sourced rows as an expiring cache rather than a
-- catalog. Search still works exactly as before — the provider answers live
-- and the cache only absorbs repeat queries within its window. What changes is
-- that nothing provider-sourced outlives the window.
--
-- This does not reduce what a shopper can find. A Kroger store answers any
-- search on demand; the cache was never what made it searchable.

-- ---------------------------------------------------------------------------
-- 1) The missing banners
-- ---------------------------------------------------------------------------
insert into retailers (name, slug, integration_status, website_url, parent_company)
values
  ('QFC', 'qfc', 'live', 'https://www.qfc.com', 'Kroger'),
  ('Food 4 Less', 'food-4-less', 'live', 'https://www.food4less.com', 'Kroger'),
  ('Dillons', 'dillons', 'live', 'https://www.dillons.com', 'Kroger'),
  ('Jay C Food Stores', 'jay-c', 'live', 'https://www.jaycfoods.com', 'Kroger'),
  ('City Market', 'city-market', 'live', 'https://www.citymarket.com', 'Kroger'),
  ('Ruler Foods', 'ruler-foods', 'live', 'https://www.rulerfoods.com', 'Kroger'),
  ('Pay Less Super Markets', 'payless-super', 'live', 'https://www.pay-less.com', 'Kroger'),
  ('Pick ''n Save', 'pick-n-save', 'live', 'https://www.picknsave.com', 'Kroger'),
  ('Metro Market', 'metro-market', 'live', 'https://www.metromarket.net', 'Kroger'),
  ('Baker''s', 'baker-s', 'live', 'https://www.bakersplus.com', 'Kroger'),
  ('Gerbes', 'gerbes', 'live', 'https://www.gerbes.com', 'Kroger'),
  ('Owen''s Market', 'owens-market', 'live', 'https://www.owensmarket.com', 'Kroger')
on conflict (slug) do update set
  integration_status = 'live',
  parent_company = 'Kroger';

update retailers set
  integration_status = 'live',
  integration_verified_at = date '2026-08-07',
  integration_notes = 'Covered by the live Kroger Products and Locations APIs, '
    || 'including per-store aisle data. Product data is served on demand and '
    || 'cached only within the window Kroger''s terms permit — never mirrored.'
where parent_company = 'Kroger';

-- ---------------------------------------------------------------------------
-- 2) Activation: a live integration means the store is capable now
-- ---------------------------------------------------------------------------
create or replace function activate_provider_stores()
returns int
language plpgsql
as $$
declare
  v_rows int;
begin
  insert into store_capabilities (
    store_id, aisle_data, inventory, pricing, product_images,
    store_map, realtime, product_search, department_data, last_synced_at
  )
  select s.id, true, true, true, true, false, false, true, true, now()
  from stores s
  join retailers r on r.id = s.retailer_id
  where s.provider_store_id is not null
    and r.parent_company = 'Kroger'
    and s.active and s.lifecycle = 'ACTIVE' and s.review_status = 'OK'
  on conflict (store_id) do update set
    aisle_data = true, inventory = true, pricing = true, product_images = true,
    product_search = true, department_data = true, last_synced_at = now();
  get diagnostics v_rows = row_count;

  perform refresh_store_coverage();
  return v_rows;
end;
$$;

revoke all on function activate_provider_stores () from public;

-- ---------------------------------------------------------------------------
-- 3) Provider cache expiry
--
-- Everything sourced from a retailer API now carries an explicit expiry.
-- PROVIDER_CACHE_HOURS is deliberately conservative: prices and stock move
-- daily, and holding them longer would be both stale and outside the terms.
-- ---------------------------------------------------------------------------
create or replace function provider_cache_hours()
returns int
language sql
immutable
as $$ select 24 $$;

revoke all on function provider_cache_hours () from public;

comment on function provider_cache_hours () is
  'Maximum age of retailer-API-sourced rows. Kroger''s terms forbid permanent '
  'copies and cap caching at the response cache header; 24h is a conservative '
  'ceiling well inside that.';

/**
 * Drop retailer-sourced rows past the cache window.
 *
 * Store identity is untouched — a store must stay selectable, and its address
 * is independently available from the open directory. What expires is the
 * catalog: products, prices, availability and aisle locations.
 */
create or replace function purge_expired_provider_cache()
returns jsonb
language plpgsql
as $$
declare
  v_cutoff timestamptz := now() - (provider_cache_hours() || ' hours')::interval;
  v_locations int := 0;
  v_prices int := 0;
  v_store_products int := 0;
  v_products int := 0;
begin
  -- Aisle/department locations sourced from the provider.
  delete from product_locations pl
  using store_products sp, stores s, retailers r
  where pl.store_product_id = sp.id
    and s.id = sp.store_id and r.id = s.retailer_id
    and r.parent_company = 'Kroger'
    and pl.data_source = 'RETAILER_API'
    and pl.updated_at < v_cutoff;
  get diagnostics v_locations = row_count;

  delete from prices pr
  using store_products sp, stores s, retailers r
  where pr.store_product_id = sp.id
    and s.id = sp.store_id and r.id = s.retailer_id
    and r.parent_company = 'Kroger'
    and pr.captured_at < v_cutoff;
  get diagnostics v_prices = row_count;

  delete from store_products sp
  using stores s, retailers r
  where s.id = sp.store_id and r.id = s.retailer_id
    and r.parent_company = 'Kroger'
    and coalesce(sp.last_seen_at, sp.updated_at) < v_cutoff;
  get diagnostics v_store_products = row_count;

  -- Products left with no store mapping and no independent identity source
  -- are provider content with nothing corroborating them.
  delete from products p
  where p.updated_at < v_cutoff
    and not exists (select 1 from store_products sp where sp.product_id = p.id)
    and coalesce(p.image_source, '') not in ('OPEN_FOOD_FACTS', 'GS1', 'STORE_MANAGED');
  get diagnostics v_products = row_count;

  perform refresh_store_coverage();

  return jsonb_build_object(
    'cutoff', v_cutoff,
    'locations_purged', v_locations,
    'prices_purged', v_prices,
    'store_products_purged', v_store_products,
    'products_purged', v_products
  );
end;
$$;

revoke all on function purge_expired_provider_cache () from public;

select activate_provider_stores();
