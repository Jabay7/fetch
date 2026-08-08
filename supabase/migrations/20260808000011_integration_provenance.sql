-- Fetch migration 0011: verified integration provenance.
--
-- The integration matrix was re-verified against each retailer's own developer
-- portal and terms on 2026-08-07 (see docs/RETAILER-INTEGRATIONS.md). Several
-- stored statuses contradicted what is actually available, in both directions:
--
--   * Best Buy was marked 'unsupported' but is in fact the most integrable
--     retailer available — instant self-service key, per-store availability,
--     price and images.
--   * Lowe's was marked 'development', implying work in progress. Its API
--     portal publishes no consumer product APIs at all; the only documented
--     product is installation-services B2B.
--   * CVS was marked 'directory_only' but does run a real (invite-only)
--     developer programme.
--
-- Claiming a relationship we do not have is exactly the kind of invention this
-- product forbids, so status now carries the date it was checked and a note
-- explaining the gate.

alter table retailers
  add column integration_verified_at date,
  add column integration_notes text;

comment on column retailers.integration_verified_at is
  'Date the integration status was last checked against the retailer''s own '
  'developer portal or terms. Stale entries should be re-verified, not assumed.';
comment on column retailers.integration_notes is
  'Why the retailer sits at this status, and what would change it.';

-- Corrections -----------------------------------------------------------------

update retailers set
  integration_status = 'development',
  integration_notes = 'Self-service API key issued immediately. Products, '
    || 'Stores and per-SKU per-store availability with price and images. No '
    || 'aisle data. Terms impose a 72-hour caching ceiling and mandatory logo '
    || 'placement. Next integration to build.'
where slug = 'best-buy';

update retailers set
  integration_status = 'directory_only',
  integration_notes = 'API portal is live but its public catalogue is empty; '
    || 'the only documented products are installation-services B2B and one '
    || 'labelled "Lowes Internal". Lowe''s has shown aisle and bay data in its '
    || 'own app since 2013 but publishes no endpoint for it.'
where slug = 'lowes';

update retailers set
  integration_status = 'development',
  integration_notes = 'Store Locator and Store Inventory APIs are documented '
    || 'and usable, but production launch requires Walgreens approval. '
    || 'Inventory returns quantity keyed to an opaque product article id with '
    || 'no documented UPC mapping, so it cannot yet attach to our catalogue. '
    || 'No catalogue, price, image or aisle data.'
where slug = 'walgreens';

update retailers set
  integration_status = 'partnership_required',
  integration_notes = 'Developer portal exists but is invite-only, over mutual '
    || 'TLS. Catalogue is pharmacy/PBM; the only retail-relevant API is a '
    || 'store locator.'
where slug = 'cvs';

update retailers set
  integration_notes = 'No public developer programme. Redistribution of API '
    || 'product data to third parties is restricted by terms, and the '
    || 'competitor-destination clause is unresolved for a multi-retailer '
    || 'locator. Blocked pending written clarification from the retailer.'
where slug = 'walmart';

update retailers set
  integration_notes = 'Developer portal is a login wall with no public '
    || 'catalogue or self-service registration. The affiliate programme '
    || 'provides tracking links only, no data feed. Aisle data exists in the '
    || 'retailer''s own app but is not published.'
where slug = 'target';

update retailers set
  integration_notes = 'Developer and API hosts no longer resolve. Site terms '
    || 'prohibit extracting or scraping for resale. Aisle and bay data exists '
    || 'in the retailer''s own app but is not published.'
where slug = 'home-depot';

update retailers set
  integration_notes = 'Developer host no longer resolves. Remaining portals '
    || 'require an internal Active Directory account.'
where slug = 'meijer';

update retailers set
  integration_notes = 'No developer programme. Terms explicitly name store '
    || 'locations and product listings as prohibited without a written '
    || 'agreement.'
where slug in ('albertsons', 'safeway', 'vons', 'acme-markets', 'jewel-osco');

update retailers set
  integration_notes = 'Covered by the live Kroger Products and Locations APIs, '
    || 'including per-store aisle data. Store coverage expands as the Kroger '
    || 'importer runs within its daily call budget.'
where parent_company = 'Kroger';

update retailers set
  integration_notes = coalesce(integration_notes,
    'No authorised data path verified. Discoverable from the open store '
    || 'directory only; no product, price or aisle data is shown.')
where integration_status in ('directory_only', 'unsupported', 'partnership_required');

-- Everything above was checked in the same sweep.
update retailers set integration_verified_at = date '2026-08-07'
where integration_notes is not null;
