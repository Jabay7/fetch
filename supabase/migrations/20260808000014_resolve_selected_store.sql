-- Fetch migration 0014: make get_store honour lifecycle, merges and demo state.
--
-- The app persists the whole selected store as a JSON snapshot and never
-- rechecks it, so a selection made once is trusted forever. That is now wrong
-- in three ways:
--
--   * Demo stores carry illustrative aisle data. A shopper who picked one
--     before migration 0009 still resolves it by id and is still shown that
--     data as though it were real.
--   * 48 stores were merged into their canonical twin during deduplication.
--     Anyone holding a merged id points at a row that no longer receives
--     updates.
--   * Stores that are permanently closed or quarantined stay selectable.
--
-- get_store now follows merges to the surviving store and refuses to return
-- anything that is not discoverable. Because it returns the resolved id, the
-- client can heal a stale selection instead of silently dropping it.

create or replace function resolve_store_redirect(p_store_id uuid)
returns uuid
language plpgsql
stable
as $$
declare
  v_id uuid := p_store_id;
  v_next uuid;
  v_hops int := 0;
begin
  -- Follow merged_into_id to the surviving store. Bounded so a cycle
  -- introduced by bad data can never spin here.
  loop
    select s.merged_into_id into v_next from stores s where s.id = v_id;
    exit when v_next is null or v_hops >= 5;
    v_id := v_next;
    v_hops := v_hops + 1;
  end loop;
  return v_id;
end;
$$;

drop function if exists get_store (uuid);

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
    s.address_line, s.city, s.state, s.zip, s.source,
    c.aisle_data, c.inventory, c.pricing, c.product_images,
    c.store_map, c.realtime, c.product_search, c.department_data,
    c.last_synced_at, c.last_verified_at
  from stores s
  left join retailers r on r.id = s.retailer_id
  left join store_capabilities c on c.store_id = s.id
  where s.id = resolve_store_redirect(p_store_id)
    and s.active and s.lifecycle = 'ACTIVE'
    and s.review_status = 'OK' and not s.is_demo
$$;

grant execute on function get_store (uuid) to anon, authenticated;
grant execute on function resolve_store_redirect (uuid) to anon, authenticated;

comment on function get_store (uuid) is
  'Resolves a store id to the currently discoverable store, following merges. '
  'Returns no row when the store is demo, closed, quarantined or merged into '
  'nothing — callers should treat that as "pick another store".';
