-- Fetch migration 0015: backfill directory integrity for rows that predate the
-- 0009 importer.
--
-- The nationwide import was already running when migrations 0008-0009 landed,
-- so ~4,700 stores were written by the older import_directory_stores. Those
-- rows carry no address_normalized, no source_priority and no store_identities
-- entry, which means:
--
--   * deduplication cannot see them (rules 4 and 5 both key off
--     address_normalized), so duplicates of them survive;
--   * a re-import cannot resolve them by identity and would insert again;
--   * source-priority protection does not apply, so a weak directory row could
--     overwrite a stronger one.
--
-- This is written to be idempotent and safe to re-run after any future import.

-- 1) Identity columns -------------------------------------------------------
update stores
set address_normalized = normalize_address(address_line)
where address_normalized is null and address_line is not null;

update stores
set source_priority = source_priority(source)
where source_priority = 0 and coalesce(source, '') <> '';

-- 2) External identities ----------------------------------------------------
insert into store_identities (store_id, id_type, id_value, source, confidence)
select s.id,
       case upper(s.source)
         when 'OSM' then 'OSM'
         when 'OVERTURE' then 'GERS'
         when 'RETAILER_API' then 'RETAILER_PROVIDER'
         else 'PROVIDER'
       end,
       s.source_id,
       s.source,
       case upper(s.source) when 'RETAILER_API' then 'HIGH'
                            when 'OVERTURE' then 'HIGH'
                            else 'MEDIUM' end
from stores s
where s.source_id is not null
  and not exists (select 1 from store_identities i where i.store_id = s.id)
on conflict (id_type, id_value) do nothing;

-- 3) Re-apply the brand-consistency guard to every directory row ------------
-- Rows imported before 0009 were never graded. Only ever moves a row from OK
-- to REJECTED for a name mismatch; a human decision to reject stays rejected.
update stores s
set review_status = 'REJECTED',
    review_reason = 'Directory POI name does not match retailer brand'
from retailers r
where r.id = s.retailer_id
  and not s.is_demo
  and s.review_status = 'OK'
  and not store_name_matches_brand(s.name, r.name, r.independent_operator, s.source);

-- And release anything the guard now accepts (e.g. a retailer newly flagged as
-- a co-op), so a fixed classification is not permanently punitive.
update stores s
set review_status = 'OK',
    review_reason = null
from retailers r
where r.id = s.retailer_id
  and s.review_status = 'REJECTED'
  and s.review_reason = 'Directory POI name does not match retailer brand'
  and store_name_matches_brand(s.name, r.name, r.independent_operator, s.source);
