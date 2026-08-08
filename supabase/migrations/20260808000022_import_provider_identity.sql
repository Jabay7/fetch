-- Fetch migration 0022: the directory importer must persist provider identity.
--
-- import_directory_stores reads `provider_store_id` and `store_number` from
-- each incoming row and passes them to resolve_store_identity — but never
-- writes them to the stores table. For open-directory sources that was
-- harmless, because OSM has no provider id to keep.
--
-- For a retailer API it is fatal. The Kroger sweep imported 2,772 real Kroger
-- stores and every one landed without its locationId, which is the only key
-- that can query the Products API for that store. The stores existed, looked
-- correct, and could not answer a single search. Coverage stayed at 14.
--
-- Provider identity is now persisted on insert and backfilled on update, and
-- an identity row is recorded so a re-import resolves to the same store.

create or replace function import_directory_stores(p_rows jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_row jsonb;
  v_retailer_id uuid;
  v_store_id uuid;
  v_source text;
  v_source_name text;
  v_provider_id text;
  v_store_number text;
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
    v_source_name := nullif(v_row ->> 'source_name', '');
    v_provider_id := nullif(v_row ->> 'provider_store_id', '');
    v_store_number := nullif(v_row ->> 'store_number', '');
    v_review := grade_directory_store(
      coalesce(v_source_name, v_row ->> 'name'), v_retailer_id, v_source
    );
    if v_review <> 'OK' then
      v_rejected := v_rejected + 1;
    end if;

    v_store_id := resolve_store_identity(
      v_retailer_id, v_provider_id, v_store_number, '[]'::jsonb,
      v_row ->> 'address_line', v_row ->> 'zip',
      nullif(v_row ->> 'latitude', '')::double precision,
      nullif(v_row ->> 'longitude', '')::double precision
    );

    if v_store_id is null then
      select s.id into v_store_id from stores s
      where s.source = v_source and s.source_id = v_row ->> 'source_id';
    end if;

    if v_store_id is null then
      insert into stores (
        retailer_id, name, source_name, chain, address_line, city, state, zip,
        latitude, longitude, phone, active,
        provider_store_id, store_number,
        source, source_id, source_url, source_attribution,
        data_confidence, last_verified_at,
        address_normalized, source_priority, review_status, review_reason
      ) values (
        v_retailer_id, v_row ->> 'name', v_source_name, v_row ->> 'chain',
        v_row ->> 'address_line', v_row ->> 'city', v_row ->> 'state', v_row ->> 'zip',
        nullif(v_row ->> 'latitude', '')::double precision,
        nullif(v_row ->> 'longitude', '')::double precision,
        v_row ->> 'phone', true,
        v_provider_id, v_store_number,
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
      update stores s set
        name = case when source_priority(v_source) >= s.source_priority
                    then v_row ->> 'name' else s.name end,
        source_name = coalesce(v_source_name, s.source_name),
        -- Backfill provider identity onto a store first seen from a weaker
        -- source: an OSM record that turns out to be a known retailer store
        -- becomes queryable without losing its history.
        provider_store_id = coalesce(v_provider_id, s.provider_store_id),
        store_number = coalesce(v_store_number, s.store_number),
        source = case when source_priority(v_source) > s.source_priority
                      then v_source else s.source end,
        source_priority = greatest(s.source_priority, source_priority(v_source)),
        latitude = coalesce(nullif(v_row ->> 'latitude', '')::double precision, s.latitude),
        longitude = coalesce(nullif(v_row ->> 'longitude', '')::double precision, s.longitude),
        phone = coalesce(v_row ->> 'phone', s.phone),
        address_normalized = coalesce(s.address_normalized, normalize_address(s.address_line)),
        review_status = v_review,
        review_reason = case when v_review = 'OK' then null
                             else 'Directory POI name does not match retailer brand' end,
        last_verified_at = now()
      where s.id = v_store_id;

      if v_provider_id is not null then
        insert into store_identities (store_id, id_type, id_value, source, confidence)
        values (v_store_id, 'RETAILER_PROVIDER', v_provider_id, v_source, 'HIGH')
        on conflict (id_type, id_value) do nothing;
      end if;
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
