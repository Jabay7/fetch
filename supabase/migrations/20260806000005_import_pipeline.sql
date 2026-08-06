-- Fetch migration 0005: catalog import pipeline (server side).
--
-- The TypeScript half (supabase/functions/_shared/catalog-import-core.ts)
-- parses CSV/JSON, validates, normalizes, and maps columns; it then calls
-- apply_catalog_import with normalized rows. This RPC is the transactional
-- half: store matching, product identity matching, insert-or-update, price
-- and inventory history, per-row error isolation, audit rows for revert,
-- and dry-run preview. Rows never fail the whole import; each row's error
-- is reported in the summary.
--
-- Execution model: Edge Functions call this with the service role. Clients
-- cannot execute it (revoked below).

create or replace function apply_catalog_import(
  p_job_id uuid,
  p_rows jsonb,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
as $$
declare
  v_row jsonb;
  v_index int := 0;
  v_processed int := 0;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_invalid int := 0;
  v_duplicates int := 0;
  v_unknown_stores int := 0;
  v_no_location int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_seen_keys text[] := '{}';

  v_retailer_id uuid;
  v_store_id uuid;
  v_product_id uuid;
  v_variant_id uuid;
  v_sp_id uuid;
  v_category_id uuid;
  v_department_id uuid;
  v_aisle_id uuid;
  v_loc_id uuid;
  v_key text;
  v_is_new boolean;
  v_changed boolean;
  v_before jsonb;
  v_after jsonb;
  v_loc jsonb;
  v_prod jsonb;
  v_var jsonb;
  v_price jsonb;
  v_avail text;
  v_source text;
  v_source_provider text;
  v_latest_regular int;
  v_latest_sale int;
  v_summary jsonb;
begin
  if p_job_id is null or p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'apply_catalog_import requires a job id and a jsonb array of rows';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_index := v_index + 1;
    v_processed := v_processed + 1;

    begin
      v_prod := v_row -> 'product';
      v_var := v_row -> 'variant';
      v_loc := v_row -> 'location';
      v_price := v_row -> 'price';
      v_source := coalesce(v_row ->> 'source', 'STORE_MANAGED');
      v_source_provider := v_row ->> 'source_provider';

      -- 1) Resolve retailer + store. Unknown store = reported, row skipped.
      select r.id into v_retailer_id
      from retailers r
      where r.slug = v_row ->> 'retailer_slug';

      v_store_id := null;
      if v_retailer_id is not null then
        select s.id into v_store_id
        from stores s
        where s.retailer_id = v_retailer_id
          and (
            (v_row ->> 'store_number' is not null and s.store_number = v_row ->> 'store_number')
            or (v_row ->> 'provider_store_id' is not null and s.provider_store_id = v_row ->> 'provider_store_id')
            or (v_row ->> 'store_name' is not null and lower(s.name) = lower(v_row ->> 'store_name'))
          )
        limit 1;
      end if;

      if v_store_id is null then
        v_unknown_stores := v_unknown_stores + 1;
        v_errors := v_errors || jsonb_build_object(
          'row', v_index, 'code', 'UNKNOWN_STORE',
          'message', 'No store matched retailer_slug/store_number/provider_store_id/store_name'
        );
        continue;
      end if;

      -- 2) In-batch duplicate detection (same store + product identity).
      v_key := v_store_id || '|' || coalesce(
        v_prod ->> 'upc', v_prod ->> 'gtin', v_prod ->> 'ean',
        lower(coalesce(v_prod ->> 'brand', '')) || '~' || lower(v_prod ->> 'name')
      );
      if v_key = any (v_seen_keys) then
        v_duplicates := v_duplicates + 1;
        v_errors := v_errors || jsonb_build_object(
          'row', v_index, 'code', 'DUPLICATE_ROW',
          'message', 'Same store and product identity appeared earlier in this import'
        );
        continue;
      end if;
      v_seen_keys := v_seen_keys || v_key;

      -- 3) Product identity: UPC > GTIN > EAN > (brand, name).
      select p.id into v_product_id
      from products p
      where (v_prod ->> 'upc' is not null and p.upc = v_prod ->> 'upc')
         or (v_prod ->> 'gtin' is not null and p.gtin = v_prod ->> 'gtin')
         or (v_prod ->> 'ean' is not null and p.ean = v_prod ->> 'ean')
      limit 1;

      if v_product_id is null then
        select p.id into v_product_id
        from products p
        where lower(p.name) = lower(v_prod ->> 'name')
          and lower(coalesce(p.brand, '')) = lower(coalesce(v_prod ->> 'brand', ''))
        limit 1;
      end if;

      -- Optional category.
      v_category_id := null;
      if v_prod ->> 'category' is not null then
        select c.id into v_category_id from product_categories c
        where lower(c.name) = lower(v_prod ->> 'category');
        if v_category_id is null and not p_dry_run then
          insert into product_categories (name) values (v_prod ->> 'category')
          returning id into v_category_id;
          insert into import_audit (job_id, table_name, row_pk, action, after)
          values (p_job_id, 'product_categories', v_category_id, 'INSERT',
                  jsonb_build_object('name', v_prod ->> 'category'));
        end if;
      end if;

      if v_product_id is null then
        if not p_dry_run then
          insert into products (name, brand, size_text, description, upc, gtin, ean, image_url, category_id)
          values (
            v_prod ->> 'name', v_prod ->> 'brand', v_prod ->> 'size',
            v_prod ->> 'description', v_prod ->> 'upc', v_prod ->> 'gtin',
            v_prod ->> 'ean', v_prod ->> 'image_url', v_category_id
          )
          returning id into v_product_id;
          insert into import_audit (job_id, table_name, row_pk, action, after)
          select p_job_id, 'products', v_product_id, 'INSERT', to_jsonb(p) from products p where p.id = v_product_id;
        end if;
      elsif not p_dry_run then
        -- Fill gaps only; imports never blank existing catalog fields.
        select to_jsonb(p) into v_before from products p where p.id = v_product_id;
        update products p set
          brand = coalesce(p.brand, v_prod ->> 'brand'),
          size_text = coalesce(p.size_text, v_prod ->> 'size'),
          description = coalesce(p.description, v_prod ->> 'description'),
          image_url = coalesce(p.image_url, v_prod ->> 'image_url'),
          gtin = coalesce(p.gtin, v_prod ->> 'gtin'),
          ean = coalesce(p.ean, v_prod ->> 'ean'),
          category_id = coalesce(p.category_id, v_category_id)
        where p.id = v_product_id;
        select to_jsonb(p) into v_after from products p where p.id = v_product_id;
        if v_before <> v_after then
          insert into import_audit (job_id, table_name, row_pk, action, before, after)
          values (p_job_id, 'products', v_product_id, 'UPDATE', v_before, v_after);
        end if;
      end if;

      -- 4) Optional variant, keyed by (product, name) or its own UPC.
      v_variant_id := null;
      if v_var is not null and jsonb_typeof(v_var) = 'object' and v_var ->> 'name' is not null then
        select pv.id into v_variant_id
        from product_variants pv
        where (v_var ->> 'upc' is not null and pv.upc = v_var ->> 'upc')
           or (pv.product_id = v_product_id and lower(pv.name) = lower(v_var ->> 'name'))
        limit 1;
        if v_variant_id is null and not p_dry_run then
          insert into product_variants (product_id, name, size_text, color, flavor, pack_count, upc, gtin)
          values (
            v_product_id, v_var ->> 'name', v_var ->> 'size', v_var ->> 'color',
            v_var ->> 'flavor', nullif(v_var ->> 'pack_count', '')::int,
            v_var ->> 'upc', v_var ->> 'gtin'
          )
          returning id into v_variant_id;
          insert into import_audit (job_id, table_name, row_pk, action, after)
          select p_job_id, 'product_variants', v_variant_id, 'INSERT', to_jsonb(pv)
          from product_variants pv where pv.id = v_variant_id;
        end if;
      end if;

      -- 5) store_products insert-or-update.
      v_avail := nullif(v_row ->> 'inventory_status', '');
      select sp.id, to_jsonb(sp) into v_sp_id, v_before
      from store_products sp
      where sp.store_id = v_store_id and sp.product_id = v_product_id;
      v_is_new := v_sp_id is null;

      if p_dry_run then
        if v_is_new then v_inserted := v_inserted + 1; else v_updated := v_updated + 1; end if;
      elsif v_is_new then
        insert into store_products (
          store_id, product_id, product_variant_id, provider_product_id,
          retailer_sku, availability, active, last_seen_at, updated_at
        )
        values (
          v_store_id, v_product_id, v_variant_id, v_row ->> 'provider_product_id',
          v_row ->> 'retailer_sku',
          coalesce(v_avail, 'UNKNOWN')::availability_status,
          true, now(), coalesce((v_row ->> 'updated_at')::timestamptz, now())
        )
        returning id into v_sp_id;
        insert into import_audit (job_id, table_name, row_pk, action, after)
        select p_job_id, 'store_products', v_sp_id, 'INSERT', to_jsonb(sp)
        from store_products sp where sp.id = v_sp_id;
        v_inserted := v_inserted + 1;
      else
        update store_products sp set
          product_variant_id = coalesce(v_variant_id, sp.product_variant_id),
          provider_product_id = coalesce(v_row ->> 'provider_product_id', sp.provider_product_id),
          retailer_sku = coalesce(v_row ->> 'retailer_sku', sp.retailer_sku),
          availability = coalesce(v_avail, sp.availability::text)::availability_status,
          active = true,
          last_seen_at = now(),
          updated_at = coalesce((v_row ->> 'updated_at')::timestamptz, now())
        where sp.id = v_sp_id;
        select to_jsonb(sp) into v_after from store_products sp where sp.id = v_sp_id;
        if v_before <> v_after then
          insert into import_audit (job_id, table_name, row_pk, action, before, after)
          values (p_job_id, 'store_products', v_sp_id, 'UPDATE', v_before, v_after);
          v_updated := v_updated + 1;
        else
          v_skipped := v_skipped + 1;
        end if;
      end if;

      -- Availability change history.
      if not p_dry_run and v_avail is not null
         and (v_is_new or (v_before ->> 'availability') is distinct from v_avail) then
        insert into inventory_snapshots (store_product_id, availability, quantity, source_provider)
        values (
          v_sp_id, v_avail::availability_status,
          nullif(v_row ->> 'inventory_quantity', '')::int, v_source_provider
        );
      end if;

      -- 6) Location upsert — only when the row actually carries location data.
      if v_loc is not null and jsonb_typeof(v_loc) = 'object' and (
           v_loc ->> 'aisle' is not null or v_loc ->> 'department' is not null
        or v_loc ->> 'bay' is not null or v_loc ->> 'shelf' is not null
        or v_loc ->> 'section' is not null or v_loc ->> 'display_location' is not null
      ) then
        if not p_dry_run then
          v_aisle_id := null;
          if v_loc ->> 'aisle' is not null then
            select a.id into v_aisle_id from aisles a
            where a.store_id = v_store_id and a.code = v_loc ->> 'aisle';
            if v_aisle_id is null then
              insert into aisles (store_id, code) values (v_store_id, v_loc ->> 'aisle')
              returning id into v_aisle_id;
              insert into import_audit (job_id, table_name, row_pk, action, after)
              values (p_job_id, 'aisles', v_aisle_id, 'INSERT',
                      jsonb_build_object('store_id', v_store_id, 'code', v_loc ->> 'aisle'));
            end if;
          end if;

          v_department_id := null;
          if v_loc ->> 'department' is not null then
            select d.id into v_department_id from departments d
            where lower(d.name) = lower(v_loc ->> 'department');
            if v_department_id is null then
              insert into departments (name) values (v_loc ->> 'department')
              returning id into v_department_id;
              insert into import_audit (job_id, table_name, row_pk, action, after)
              values (p_job_id, 'departments', v_department_id, 'INSERT',
                      jsonb_build_object('name', v_loc ->> 'department'));
            end if;
          end if;

          select pl.id, to_jsonb(pl) into v_loc_id, v_before
          from product_locations pl where pl.store_product_id = v_sp_id;

          if v_loc_id is null then
            insert into product_locations (
              store_product_id, aisle_id, bay, shelf, section, department_id,
              display_location, data_source, source_provider,
              verification_status, effective_at
            )
            values (
              v_sp_id, v_aisle_id, v_loc ->> 'bay', v_loc ->> 'shelf',
              v_loc ->> 'section', v_department_id, v_loc ->> 'display_location',
              v_source, v_source_provider, 'UNVERIFIED', now()
            )
            returning id into v_loc_id;
            insert into import_audit (job_id, table_name, row_pk, action, after)
            select p_job_id, 'product_locations', v_loc_id, 'INSERT', to_jsonb(pl)
            from product_locations pl where pl.id = v_loc_id;
          else
            update product_locations pl set
              aisle_id = v_aisle_id,
              bay = v_loc ->> 'bay',
              shelf = v_loc ->> 'shelf',
              section = coalesce(v_loc ->> 'section', pl.section),
              department_id = coalesce(v_department_id, pl.department_id),
              display_location = v_loc ->> 'display_location',
              data_source = v_source,
              source_provider = v_source_provider,
              verification_status = 'UNVERIFIED',
              effective_at = now(),
              expires_at = null,
              updated_at = now()
            where pl.id = v_loc_id;
            select to_jsonb(pl) into v_after from product_locations pl where pl.id = v_loc_id;
            if v_before <> v_after then
              insert into import_audit (job_id, table_name, row_pk, action, before, after)
              values (p_job_id, 'product_locations', v_loc_id, 'UPDATE', v_before, v_after);
            end if;
          end if;
        end if;
      else
        v_no_location := v_no_location + 1;
      end if;

      -- 7) Price history: append only when the effective price changed.
      if v_price is not null and jsonb_typeof(v_price) = 'object'
         and v_price ->> 'regular_cents' is not null then
        select pr.regular_price_cents, pr.sale_price_cents
          into v_latest_regular, v_latest_sale
        from prices pr
        where pr.store_product_id = v_sp_id
        order by pr.captured_at desc
        limit 1;

        if v_latest_regular is distinct from (v_price ->> 'regular_cents')::int
           or v_latest_sale is distinct from nullif(v_price ->> 'sale_cents', '')::int then
          if not p_dry_run then
            insert into prices (store_product_id, regular_price_cents, sale_price_cents, currency)
            values (
              v_sp_id, (v_price ->> 'regular_cents')::int,
              nullif(v_price ->> 'sale_cents', '')::int,
              coalesce(v_price ->> 'currency', 'USD')
            )
            returning id into v_loc_id;
            insert into import_audit (job_id, table_name, row_pk, action, after)
            select p_job_id, 'prices', v_loc_id, 'INSERT', to_jsonb(pr)
            from prices pr where pr.id = v_loc_id;
          end if;
        end if;
      end if;

    exception when others then
      v_invalid := v_invalid + 1;
      v_errors := v_errors || jsonb_build_object(
        'row', v_index, 'code', 'ROW_ERROR', 'message', sqlerrm
      );
    end;
  end loop;

  v_summary := jsonb_build_object(
    'rows_processed', v_processed,
    'rows_inserted', v_inserted,
    'rows_updated', v_updated,
    'rows_skipped', v_skipped,
    'invalid_rows', v_invalid,
    'duplicate_rows', v_duplicates,
    'unknown_stores', v_unknown_stores,
    'products_without_location', v_no_location
  );

  update import_jobs j set
    status = case when p_dry_run then 'VALIDATED' else 'APPLIED' end,
    dry_run = p_dry_run,
    totals = v_summary,
    row_errors = v_errors,
    applied_at = case when p_dry_run then null else now() end
  where j.id = p_job_id;

  return v_summary || jsonb_build_object('errors', v_errors);
end;
$$;

-- ---------------------------------------------------------------------------
-- Revert a completed import using its audit trail (reverse order).
-- INSERT audits are deleted; UPDATE audits restore the before-image in place.
-- ---------------------------------------------------------------------------
create or replace function revert_import(p_job_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_audit record;
  v_cols text;
  v_reverted int := 0;
begin
  if not exists (select 1 from import_jobs j where j.id = p_job_id and j.status = 'APPLIED') then
    raise exception 'Import job % is not in APPLIED state', p_job_id;
  end if;

  for v_audit in
    select * from import_audit a
    where a.job_id = p_job_id
    order by a.created_at desc, a.id desc
  loop
    if v_audit.action = 'INSERT' then
      execute format('delete from %I where id = $1', v_audit.table_name)
        using v_audit.row_pk;
    else
      select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
        into v_cols
      from information_schema.columns
      where table_schema = 'public' and table_name = v_audit.table_name;
      execute format(
        'update %I t set (%s) = (select %s from jsonb_populate_record(null::%I, $1)) where t.id = $2',
        v_audit.table_name, v_cols, v_cols, v_audit.table_name
      ) using v_audit.before, v_audit.row_pk;
    end if;
    v_reverted := v_reverted + 1;
  end loop;

  update import_jobs j set status = 'ROLLED_BACK', rolled_back_at = now()
  where j.id = p_job_id;

  return jsonb_build_object('reverted_changes', v_reverted);
end;
$$;

-- Import RPCs are for the service role only.
revoke execute on function apply_catalog_import (uuid, jsonb, boolean) from public, anon, authenticated;
revoke execute on function revert_import (uuid) from public, anon, authenticated;
