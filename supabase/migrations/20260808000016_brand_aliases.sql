-- Fetch migration 0016: tighten the brand guard with explicit aliases.
--
-- 0009's guard had a fallback: if the full brand name was not contained in the
-- store name, accept when the brand's leading word appeared anywhere. Auditing
-- the full 31k directory showed that rule is too loose for short, common brand
-- words. It was accepting:
--
--   Giant Food        <- "Giant Gas", "Giant Fuel", "Giant Gasoline"  (12 gas
--                        stations, a different company entirely)
--   Whole Foods Market<- "Kimberton Whole Foods"  (an independent PA chain)
--
-- while legitimately accepting:
--
--   Office Depot      <- "OfficeMax"           (same company, ODP)
--   Stop & Shop       <- "Super Stop and Shop" (wording variant)
--
-- The distinction is not something a string heuristic can make — it is
-- retail knowledge. So the fallback is replaced by the alias list the
-- retailers table already carries, which is curated and reviewable.

-- 1) Curate aliases for the brands whose stores trade under a variant name.
update retailers set search_aliases = array['officemax', 'office max']
where slug = 'office-depot';

update retailers set search_aliases = array['stop and shop', 'stop n shop', 'super stop and shop']
where slug = 'stop-and-shop';

-- Deliberately NOT the bare word "giant": that is a gas-station chain.
update retailers set search_aliases = array['giant food', 'giant pharmacy']
where slug = 'giant-food';

update retailers set search_aliases = array['whole foods market']
where slug = 'whole-foods';

-- 2) Replace the guard. The 5th parameter defaults, so existing 4-argument
--    call sites (search_stores ordering) keep resolving to this function.
drop function if exists store_name_matches_brand (text, text, boolean, text);

create or replace function store_name_matches_brand(
  p_store_name text,
  p_retailer_name text,
  p_independent boolean default false,
  p_source text default 'OSM',
  p_aliases text[] default '{}'
)
returns boolean
language plpgsql
immutable
as $$
declare
  v_sn text;
  v_rn text;
  v_alias text;
begin
  -- Co-op members and official retailer data are always accepted.
  if coalesce(p_independent, false) then return true; end if;
  if upper(coalesce(p_source, '')) in ('RETAILER_API', 'AUTHORIZED_FEED', 'STORE_MANAGED')
    then return true; end if;
  if coalesce(btrim(p_store_name), '') = '' or coalesce(btrim(p_retailer_name), '') = ''
    then return false; end if;

  v_sn := lower(regexp_replace(p_store_name, '[^a-zA-Z0-9]', '', 'g'));
  v_rn := lower(regexp_replace(p_retailer_name, '[^a-zA-Z0-9]', '', 'g'));

  -- Whole-brand containment, ignoring punctuation and spacing. Covers
  -- "Walgreens #4021", "Marianos Lakeshore East", "CVS Pharmacy y mas",
  -- "Kroger Marketplace".
  if position(v_rn in v_sn) > 0 or position(v_sn in v_rn) > 0 then return true; end if;

  -- Curated aliases for stores that trade under a different name than the
  -- retailer record: OfficeMax under Office Depot, wording variants, etc.
  foreach v_alias in array coalesce(p_aliases, '{}') loop
    v_alias := lower(regexp_replace(coalesce(v_alias, ''), '[^a-zA-Z0-9]', '', 'g'));
    if length(v_alias) >= 4 and position(v_alias in v_sn) > 0 then return true; end if;
  end loop;

  return false;
end;
$$;

grant execute on function store_name_matches_brand (text, text, boolean, text, text[]) to public;

comment on function store_name_matches_brand (text, text, boolean, text, text[]) is
  'Pure predicate, no table access. Called from search_stores ordering, so it '
  'must remain executable by anonymous clients.';

-- 3) grade_directory_store passes the retailer''s aliases through.
create or replace function grade_directory_store(
  p_name text,
  p_retailer_id uuid,
  p_source text
)
returns text
language sql
stable
as $$
  select case
    when store_name_matches_brand(
      p_name, r.name, r.independent_operator, p_source, r.search_aliases
    ) then 'OK' else 'REJECTED' end
  from retailers r where r.id = p_retailer_id
$$;

-- 4) Re-grade the whole directory under the tightened rule.
update stores s
set review_status = 'REJECTED',
    review_reason = 'Directory POI name does not match retailer brand'
from retailers r
where r.id = s.retailer_id
  and not s.is_demo
  and s.review_status = 'OK'
  and not store_name_matches_brand(s.name, r.name, r.independent_operator, s.source, r.search_aliases);

update stores s
set review_status = 'OK',
    review_reason = null
from retailers r
where r.id = s.retailer_id
  and s.review_status = 'REJECTED'
  and s.review_reason = 'Directory POI name does not match retailer brand'
  and store_name_matches_brand(s.name, r.name, r.independent_operator, s.source, r.search_aliases);
