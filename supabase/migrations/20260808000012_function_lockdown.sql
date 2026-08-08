-- Fetch migration 0012: revoke public execute on internal functions.
--
-- Postgres grants EXECUTE to PUBLIC on every newly created function. The
-- discovery RPCs are deliberately public, but the ingestion and operations
-- helpers added in 0008-0011 inherited that default and became callable by
-- anonymous API clients.
--
-- The concrete risk is availability, not disclosure: find_duplicate_stores is a
-- geospatial self-join over the whole store table, and its arguments are caller
-- supplied. An anonymous client could call
--   find_duplicate_stores(100000, 2000)
-- and force a cross join across every store in the directory. The other
-- functions leak no data but are ingestion internals with no business being on
-- the public API surface.
--
-- Discovery RPCs intentionally left public:
--   search_stores, search_stores_near, search_products, get_store,
--   get_product_at_store, get_departments, get_popular_terms,
--   get_search_expansions, lookup_store_product, find_product_at_stores

do $$
declare
  v_fn text;
  v_sig text;
begin
  foreach v_fn in array array[
    'find_duplicate_stores',
    'merge_duplicate_stores',
    'resolve_store_identity',
    'grade_directory_store',
    'store_name_matches_brand',
    'store_is_discoverable',
    'normalize_address',
    'source_priority'
  ] loop
    for v_sig in
      select format('%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_fn
    loop
      execute format('revoke all on function %s from public', v_sig);
      -- Supabase roles are absent in the local PGlite replay used by db:check.
      if exists (select 1 from pg_roles where rolname = 'anon') then
        execute format('revoke all on function %s from anon, authenticated', v_sig);
      end if;
      if exists (select 1 from pg_roles where rolname = 'service_role') then
        execute format('grant execute on function %s to service_role', v_sig);
      end if;
    end loop;
  end loop;
end;
$$;

-- Belt and braces: the operational sweeps are service-role only and must stay
-- that way even if a later migration recreates them.
comment on function find_duplicate_stores (double precision, int) is
  'Operations only. Unbounded geospatial self-join — never grant to anon.';
