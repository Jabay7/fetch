-- Fetch migration 0013: restore anon execute on the pure helpers that the
-- public search RPCs call.
--
-- 0012 revoked public execute from every ingestion helper. Two of those are
-- also called from inside search_stores, which is `language sql stable` and so
-- runs as the caller — revoking them denied the caller mid-query and took
-- store search down with:
--   permission denied for function store_name_matches_brand
--
-- These two are pure text/lookup functions: they read no tables, take no
-- caller-controlled bounds, and cannot be used to enumerate or overload
-- anything. Re-granting them is safe; the operational sweeps
-- (find_duplicate_stores, merge_duplicate_stores, resolve_store_identity,
-- grade_directory_store) stay service-role only.

do $$
declare
  v_sig text;
begin
  for v_sig in
    select format('%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('store_name_matches_brand', 'source_priority')
  loop
    execute format('grant execute on function %s to public', v_sig);
  end loop;
end;
$$;

comment on function store_name_matches_brand (text, text, boolean, text) is
  'Pure predicate, no table access. Called from search_stores ordering, so it '
  'must remain executable by anonymous clients.';
