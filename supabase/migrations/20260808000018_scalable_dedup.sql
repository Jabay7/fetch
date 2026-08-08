-- Fetch migration 0018: make duplicate detection scale with the directory.
--
-- find_duplicate_stores compared every pair of stores sharing a retailer and
-- computed a great-circle distance for each. That is quadratic per retailer:
-- Walgreens alone now has ~4,000 rows, so ~8M pairs, each running acos(). At
-- 21k stores it was slow; at 34k it exceeds the statement timeout and the
-- deduplication sweep simply fails.
--
-- The fix is to reject almost every pair with cheap arithmetic before any
-- trigonometry runs. Two stores can only be within p_radius_m of each other if
-- their latitudes and longitudes are within a small band, and that band is
-- index-friendly. The exact haversine still decides — the band only prunes.
--
-- Longitude degrees shrink toward the poles, so the band uses a deliberately
-- generous divisor (40,000 m per degree, versus ~111,320 at the equator and
-- ~38,000 at 70°N). Being generous costs a few extra candidate pairs; being
-- tight would silently miss real duplicates.

create index if not exists stores_dedup_idx
  on stores (retailer_id, latitude, longitude)
  where lifecycle = 'ACTIVE' and review_status = 'OK' and not is_demo;

create or replace function find_duplicate_stores(
  p_radius_m double precision default 60,
  p_limit int default 500
)
returns table (
  keep_id uuid, keep_name text, merge_id uuid, merge_name text,
  retailer text, meters double precision
)
language sql
stable
as $$
  with candidates as (
    select a.id a_id, a.name a_name, a.source_priority a_pri,
           a.address_normalized a_addr, a.retailer_id,
           b.id b_id, b.name b_name, b.source_priority b_pri,
           b.address_normalized b_addr,
           6371000 * acos(least(1.0, greatest(-1.0,
             cos(radians(a.latitude)) * cos(radians(b.latitude)) *
             cos(radians(b.longitude) - radians(a.longitude)) +
             sin(radians(a.latitude)) * sin(radians(b.latitude))
           ))) as meters
    from stores a
    join stores b
      on b.retailer_id = a.retailer_id
     and b.id > a.id
     and b.lifecycle = 'ACTIVE' and b.review_status = 'OK' and not b.is_demo
     -- Cheap rectangular prune. Runs off the index and discards the
     -- overwhelming majority of pairs before any trigonometry.
     and b.latitude between a.latitude - (p_radius_m / 111320.0)
                        and a.latitude + (p_radius_m / 111320.0)
     and b.longitude between a.longitude - (p_radius_m / 40000.0)
                         and a.longitude + (p_radius_m / 40000.0)
    where a.latitude is not null and a.longitude is not null
      and b.latitude is not null and b.longitude is not null
      and a.lifecycle = 'ACTIVE' and a.review_status = 'OK' and not a.is_demo
  )
  select
    case when c.a_pri >= c.b_pri then c.a_id else c.b_id end,
    case when c.a_pri >= c.b_pri then c.a_name else c.b_name end,
    case when c.a_pri >= c.b_pri then c.b_id else c.a_id end,
    case when c.a_pri >= c.b_pri then c.b_name else c.a_name end,
    r.name,
    c.meters
  from candidates c
  left join retailers r on r.id = c.retailer_id
  where c.meters <= p_radius_m
    -- Same street number, or one side has no usable house number.
    and (
      substring(coalesce(c.a_addr, '') from '^[0-9]+') is null
      or substring(coalesce(c.b_addr, '') from '^[0-9]+') is null
      or substring(c.a_addr from '^[0-9]+') = substring(c.b_addr from '^[0-9]+')
    )
  order by c.meters asc
  limit least(greatest(coalesce(p_limit, 500), 1), 2000)
$$;

revoke all on function find_duplicate_stores (double precision, int)
  from public, anon, authenticated;

comment on function find_duplicate_stores (double precision, int) is
  'Operations only. Bounding-box prefilter keeps this linear-ish, but it still '
  'scans the directory — never grant to anon.';
