/**
 * Replays every Supabase migration plus the seed against a real PostgreSQL
 * (PGlite/WASM, no server needed) and asserts the search RPCs, RLS shape,
 * and import pipeline behave as specified. Run with: npm run db:check
 *
 * Environment differences vs hosted Supabase are stubbed explicitly below
 * (auth schema, roles, moddatetime when absent) — nothing else is skipped.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;

function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok  ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const db = new PGlite({ extensions: { pg_trgm } });

// --- Supabase environment stubs (documented, minimal) ----------------------
await db.exec(`
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid
    language sql stable as 'select null::uuid';
  do $$ begin
    create role anon nologin;
    create role authenticated nologin;
  exception when duplicate_object then null; end $$;
`);

// --- Replay migrations + seed ----------------------------------------------
const migrationsDir = path.join(root, 'supabase', 'migrations');
const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
for (const file of files) {
  const sql = await readFile(path.join(migrationsDir, file), 'utf8');
  try {
    await db.exec(sql);
    console.log(`  ok  migration ${file}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  migration ${file} — ${error.message}`);
    process.exit(1);
  }
}

try {
  const seed = await readFile(path.join(root, 'supabase', 'seed.sql'), 'utf8');
  await db.exec(seed);
  console.log('  ok  seed.sql');
} catch (error) {
  failures += 1;
  console.error(`FAIL  seed.sql — ${error.message}`);
  process.exit(1);
}

// --- RPC assertions ---------------------------------------------------------
// The demo catalog is deliberately undiscoverable, so the product assertions
// below address it by id — the same way the bundled demo does — while
// search_stores is checked for the property that matters: it never leaks it.
const stores = await db.query("select * from search_stores('')");
ok('search_stores excludes the demo catalog', stores.rows.length === 0,
  `got ${stores.rows.length}: ${stores.rows.map((s) => s.name).join(', ')}`);

const demoStore = async (name) =>
  (await db.query('select * from get_store((select id from stores where name like $1))', [name]))
    .rows[0];
const schaumburg = await demoStore('Schaumburg Main Store');
const naperville = await demoStore('Naperville West Store');
const lakeview = await demoStore('Lakeview%');
ok('store rows carry retailer slug + integration status',
  Boolean(schaumburg?.retailer_slug && schaumburg?.retailer_integration_status));
ok('store rows carry new capability flags',
  schaumburg?.cap_product_search === true && schaumburg?.cap_department_data === true);

const search = async (storeId, term) =>
  (await db.query('select * from search_products($1, $2, 25)', [storeId, term])).rows;

const tooth = await search(schaumburg.id, 'toothpaste');
ok('toothpaste search returns 4 results at Schaumburg', tooth.length === 4, `got ${tooth.length}`);
const colgate = tooth.find((r) => r.name === 'Colgate Total Toothpaste');
ok('Colgate at Schaumburg is G18 / In stock / $4.49',
  colgate?.aisle === 'G18' && colgate?.availability === 'IN_STOCK' && colgate?.price_cents === 449,
  JSON.stringify({ aisle: colgate?.aisle, availability: colgate?.availability, price: colgate?.price_cents }));

const toothNap = await search(naperville.id, 'toothpaste');
const colgateNap = toothNap.find((r) => r.name === 'Colgate Total Toothpaste');
ok('Colgate at Naperville is aisle 12 / $4.39 (never leaks Schaumburg data)',
  colgateNap?.aisle === '12' && colgateNap?.price_cents === 439,
  JSON.stringify({ aisle: colgateNap?.aisle, price: colgateNap?.price_cents }));

const fuzzy = await search(schaumburg.id, 'sensodine');
ok('misspelling "sensodine" fuzzy-matches Sensodyne',
  fuzzy.some((r) => r.name.includes('Sensodyne')), `got ${fuzzy.map((r) => r.name).join(',')}`);

const lakeviewTooth = await search(lakeview.id, 'toothpaste');
ok('departments-only store returns products without aisle/price',
  lakeviewTooth.length >= 2 && lakeviewTooth.every((r) => r.aisle === null && r.price_cents === null),
  JSON.stringify(lakeviewTooth.map((r) => ({ n: r.name, a: r.aisle, p: r.price_cents }))));

const bounty = await search(schaumburg.id, 'paper towels');
ok('Bounty at Schaumburg has no aisle (aisle unavailable state)',
  bounty.length === 1 && bounty[0].aisle === null, JSON.stringify(bounty.map((r) => r.aisle)));

// Alias tier: seeded product alias should hit tier 370.
const aliasHit = await search(schaumburg.id, 'anticavity toothpaste');
ok('product alias matches (alias tier)',
  aliasHit.some((r) => r.name === 'Colgate Total Toothpaste' && Number(r.score) === 370),
  JSON.stringify(aliasHit.map((r) => [r.name, r.score])));

// Query-level expansions.
const expansions = await db.query("select * from get_search_expansions('tp')");
ok('search_aliases expansion tp → toilet paper',
  expansions.rows.some((r) => r.expansion === 'toilet paper'));

// Identifier lookup.
const byUpc = await db.query(
  'select * from lookup_store_product($1, $2)', [schaumburg.id, '0003500046013']);
ok('UPC lookup finds Colgate with matched_identifier UPC',
  byUpc.rows.length === 1 && byUpc.rows[0].matched_identifier === 'UPC'
    && byUpc.rows[0].name === 'Colgate Total Toothpaste',
  JSON.stringify(byUpc.rows.map((r) => [r.name, r.matched_identifier])));

const detail = await db.query(
  'select * from get_product_at_store($1, $2)', [schaumburg.id, colgate.product_id]);
ok('get_product_at_store returns provenance + verification',
  detail.rows[0]?.data_source === 'STORE_MANAGED' && detail.rows[0]?.verification_status !== null);

const departments = await db.query('select * from get_departments($1)', [schaumburg.id]);
ok('get_departments returns sections', departments.rows.length >= 5, `got ${departments.rows.length}`);

// Expired locations must disappear.
await db.exec(`
  update product_locations set expires_at = now() - interval '1 day'
  where store_product_id in (
    select sp.id from store_products sp
    join products p on p.id = sp.product_id
    where sp.store_id = '${schaumburg.id}' and p.name = 'Colgate Total Toothpaste'
  );
`);
const expired = await search(schaumburg.id, 'colgate total toothpaste');
ok('expired location is not returned',
  expired.length > 0 && expired[0].aisle === null, JSON.stringify(expired.map((r) => r.aisle)));
await db.exec('update product_locations set expires_at = null;');

// --- RLS shape --------------------------------------------------------------
const rls = await db.query(`
  select relname, relrowsecurity from pg_class
  where relnamespace = 'public'::regnamespace and relkind = 'r'
`);
const noRls = rls.rows.filter((r) => !r.relrowsecurity);
ok('every public table has row-level security enabled', noRls.length === 0,
  noRls.map((r) => r.relname).join(','));

const policies = await db.query('select tablename from pg_policies');
const policyTables = new Set(policies.rows.map((r) => r.tablename));
for (const t of ['providers', 'import_jobs', 'search_terms', 'ai_interpretations', 'provider_rate_limits']) {
  ok(`service-role-only table has no client policies: ${t}`, !policyTables.has(t));
}

// Anon can read the catalog but not ops tables.
await db.exec('grant usage on schema public to anon');
await db.exec('grant select on all tables in schema public to anon');
// (grants alone don't bypass RLS; policies decide)
await db.exec('set role anon');
const anonStores = await db.query('select count(*)::int as n from stores');
ok('anon can read stores', anonStores.rows[0].n >= 4);
const anonJobs = await db.query('select count(*)::int as n from import_jobs');
ok('anon sees zero import_jobs rows (RLS)', anonJobs.rows[0].n === 0);
const anonProviders = await db.query('select count(*)::int as n from providers');
ok('anon sees zero providers rows (RLS)', anonProviders.rows[0].n === 0);
await db.exec('reset role');

// --- Import pipeline --------------------------------------------------------
const jobIns = await db.query(
  "insert into import_jobs (source_kind, file_name, created_by) values ('CSV', 'test.csv', 'db-check') returning id");
const jobId = jobIns.rows[0].id;

const importRows = JSON.stringify([
  {
    retailer_slug: 'fetch-market',
    store_name: 'Schaumburg Main Store',
    product: { name: 'Db-Check Granola', brand: 'Checker', size: '12 oz', upc: '0099999000011', category: 'Cereal & Breakfast' },
    retailer_sku: 'CHK-1',
    location: { aisle: 'A6', department: 'Grocery', section: 'Cereal & Breakfast' },
    inventory_status: 'IN_STOCK',
    price: { regular_cents: 599 },
    source: 'STORE_MANAGED',
    source_provider: 'db-check',
  },
  {
    retailer_slug: 'fetch-market',
    store_name: 'Schaumburg Main Store',
    product: { name: 'Db-Check Granola', brand: 'Checker', upc: '0099999000011' },
    source: 'STORE_MANAGED',
  },
  {
    retailer_slug: 'nope',
    store_name: 'Missing Store',
    product: { name: 'Ghost Product' },
    source: 'STORE_MANAGED',
  },
]);

const applied = (await db.query(
  'select apply_catalog_import($1, $2::jsonb, false) as summary', [jobId, importRows])).rows[0].summary;
ok('import: 1 inserted, 1 duplicate, 1 unknown store',
  applied.rows_inserted === 1 && applied.duplicate_rows === 1 && applied.unknown_stores === 1,
  JSON.stringify(applied));

const imported = await search(schaumburg.id, 'granola');
ok('imported product is searchable with its aisle',
  imported.length === 1 && imported[0].aisle === 'A6' && imported[0].price_cents === 599,
  JSON.stringify(imported.map((r) => [r.name, r.aisle, r.price_cents])));

// Idempotency: re-import updates, doesn't duplicate.
const job2 = (await db.query(
  "insert into import_jobs (source_kind, created_by) values ('CSV', 'db-check') returning id")).rows[0].id;
const reapplied = (await db.query(
  'select apply_catalog_import($1, $2::jsonb, false) as summary',
  [job2, JSON.stringify([JSON.parse(importRows)[0]])])).rows[0].summary;
ok('re-import is idempotent (0 inserted, skipped or updated)',
  reapplied.rows_inserted === 0 && reapplied.rows_processed === 1, JSON.stringify(reapplied));

// Dry-run makes no changes.
const job3 = (await db.query(
  "insert into import_jobs (source_kind, created_by) values ('CSV', 'db-check') returning id")).rows[0].id;
const before = (await db.query('select count(*)::int as n from store_products')).rows[0].n;
await db.query('select apply_catalog_import($1, $2::jsonb, true) as summary', [job3, JSON.stringify([
  {
    retailer_slug: 'fetch-market',
    store_name: 'Naperville West Store',
    product: { name: 'Dry Run Only', upc: '0099999000029' },
    source: 'STORE_MANAGED',
  },
])]);
const after = (await db.query('select count(*)::int as n from store_products')).rows[0].n;
ok('dry-run writes nothing', before === after, `${before} -> ${after}`);

// Rollback restores pre-import state.
const reverted = (await db.query('select revert_import($1) as r', [jobId])).rows[0].r;
const goneHits = await search(schaumburg.id, 'granola');
const gone = (await db.query(
  "select count(*)::int as n from products where name = 'Db-Check Granola'")).rows[0].n;
ok('revert_import removes imported rows', gone === 0 && goneHits.length === 0,
  `products=${gone} hits=${goneHits.length} reverted=${JSON.stringify(reverted)}`);

// --- Store identity resolution & deduplication -------------------------------
{
  const retailer = (
    await db.query("select id from retailers where slug = 'fetch-market'")
  ).rows[0].id;

  const mk = async (name, addr, zip, lat, lon, source, providerId = null, storeNumber = null) =>
    (
      await db.query(
        `insert into stores (retailer_id, name, address_line, city, state, zip,
           latitude, longitude, source, source_id, provider_store_id, store_number,
           address_normalized, source_priority, active)
         values ($1,$2,$3,'Testville','IL',$4,$5,$6,$7,$8,$9,$10, normalize_address($3), source_priority($7), true)
         returning id`,
        [retailer, name, addr, zip, lat, lon, source, `test-${name}`, providerId, storeNumber]
      )
    ).rows[0].id;

  const official = await mk('Ident Official', '100 Main Street', '60601', 41.9, -87.65, 'RETAILER_API', 'PROV-1', '4242');

  // 1) official provider id wins
  ok('identity: resolves by official provider id',
    (await db.query('select resolve_store_identity($1,$2) as id', [retailer, 'PROV-1'])).rows[0].id === official);

  // 2) retailer + store number
  ok('identity: resolves by retailer store number',
    (await db.query('select resolve_store_identity($1,null,$2) as id', [retailer, '4242'])).rows[0].id === official);

  // 3) stable external identity (GERS)
  await db.query(
    `insert into store_identities (store_id, id_type, id_value, source) values ($1,'GERS','gers-abc','overture')`,
    [official]
  );
  ok('identity: resolves by GERS id',
    (await db.query(
      `select resolve_store_identity($1,null,null,'[{"id_type":"GERS","id_value":"gers-abc"}]'::jsonb) as id`,
      [retailer]
    )).rows[0].id === official);

  // 4) normalized address ("100 Main Street" ≡ "100 Main St")
  ok('identity: resolves by normalized address + zip',
    (await db.query(
      'select resolve_store_identity($1,null,null,null,$2,$3) as id',
      [retailer, '100 Main St.', '60601']
    )).rows[0].id === official);

  // 5) proximity with compatible house number
  ok('identity: resolves by tight proximity when address agrees',
    (await db.query(
      'select resolve_store_identity($1,null,null,null,$2,null,$3,$4) as id',
      [retailer, '100 Main St', 41.90005, -87.65005]
    )).rows[0].id === official);

  // Negative: same spot, DIFFERENT street number => genuinely different store
  ok('identity: proximity alone never merges different addresses',
    (await db.query(
      'select resolve_store_identity($1,null,null,null,$2,null,$3,$4) as id',
      [retailer, '250 Other St', 41.90005, -87.65005]
    )).rows[0].id === null);

  // Negative: unknown place
  ok('identity: returns null for a genuinely new store',
    (await db.query(
      'select resolve_store_identity($1,null,null,null,$2,$3,$4,$5) as id',
      [retailer, '999 Nowhere Rd', '99999', 45.0, -100.0]
    )).rows[0].id === null);

  // Duplicate detection + merge, keeping the official record
  const dupe = await mk('Ident Dupe', '100 Main St', '60601', 41.90002, -87.65002, 'OSM');
  const pairs = (await db.query('select * from find_duplicate_stores(60, 50)')).rows
    .filter((p) => p.keep_id === official || p.merge_id === official);
  ok('dedupe: detects the duplicate pair', pairs.length >= 1);
  ok('dedupe: keeps the higher-priority (official) record',
    pairs[0]?.keep_id === official && pairs[0]?.merge_id === dupe,
    JSON.stringify(pairs[0]));

  await db.query('select merge_duplicate_stores($1,$2)', [official, dupe]);
  const merged = (await db.query('select lifecycle, merged_into_id, active from stores where id = $1', [dupe])).rows[0];
  ok('dedupe: merged store is marked DUPLICATE and points at the survivor',
    merged.lifecycle === 'DUPLICATE' && merged.merged_into_id === official && merged.active === false);

  const visible = (await db.query("select count(*)::int n from search_stores('Ident')")).rows[0].n;
  ok('dedupe: merged duplicate disappears from discovery', visible === 1, `got ${visible}`);

  // Lifecycle: closed stores never surface
  const closed = await mk('Ident Closed', '500 Closed Ave', '60602', 41.95, -87.7, 'OSM');
  await db.query("update stores set lifecycle='PERMANENTLY_CLOSED' where id=$1", [closed]);
  ok('lifecycle: permanently closed stores are excluded from search',
    (await db.query("select count(*)::int n from search_stores('Ident Closed')")).rows[0].n === 0);
  const nearbyIds = (await db.query('select id from search_stores_near(41.95, -87.7, 5, 50)')).rows.map((r) => r.id);
  ok('lifecycle: permanently closed stores are excluded from nearby search',
    !nearbyIds.includes(closed) && nearbyIds.includes(official),
    `closed present: ${nearbyIds.includes(closed)}, official present: ${nearbyIds.includes(official)}`);

  // Source priority ladder
  const prio = (await db.query(
    `select source_priority('RETAILER_API') a, source_priority('AUTHORIZED_FEED') b,
            source_priority('STORE_MANAGED') c, source_priority('OVERTURE') d,
            source_priority('OSM') e, source_priority('COMMUNITY') f`
  )).rows[0];
  ok('source priority: official > feed > store-managed > overture > osm > community',
    prio.a > prio.b && prio.b > prio.c && prio.c > prio.d && prio.d > prio.e && prio.e > prio.f);
}

// --- Store data quality: demo isolation, brand guard, search ranking ---------
{
  // Demo data must never be discoverable, however it was seeded.
  const demoCount = (await db.query(
    "select count(*)::int n from stores where is_demo"
  )).rows[0].n;
  ok('demo: seed stores are flagged as demo', demoCount > 0, `flagged ${demoCount}`);

  const demoNames = (await db.query(
    "select name from stores where is_demo limit 1"
  )).rows[0]?.name;
  ok('demo: flagged stores are absent from store search',
    (await db.query('select count(*)::int n from search_stores($1)', [demoNames])).rows[0].n === 0,
    `searched "${demoNames}"`);

  const demoPoint = (await db.query(
    'select latitude, longitude from stores where is_demo and latitude is not null limit 1'
  )).rows[0];
  if (demoPoint) {
    const nearDemo = (await db.query(
      'select count(*)::int n from search_stores_near($1,$2,1,50) s join stores t on t.id = s.id where t.is_demo',
      [demoPoint.latitude, demoPoint.longitude]
    )).rows[0].n;
    ok('demo: flagged stores are absent from nearby search', nearDemo === 0, `got ${nearDemo}`);
  }

  // Brand-consistency guard: real mis-attributions caught, co-ops spared.
  const brand = (await db.query(`select
    store_name_matches_brand('Brookline Bank','Walgreens',false,'OSM') a,
    store_name_matches_brand('Walgreens #4021','Walgreens',false,'OSM') b,
    store_name_matches_brand('Marianos Lakeshore East',$$Mariano's$$,false,'OSM') c,
    store_name_matches_brand('Greenwood Hardware','True Value',true,'OSM') d,
    store_name_matches_brand('Some Renamed Store','Kroger',false,'RETAILER_API') e,
    store_name_matches_brand('CVS Pharmacy y mas','CVS',false,'OSM') f`)).rows[0];
  ok('brand guard: rejects an unrelated POI filed under a retailer', brand.a === false);
  ok('brand guard: accepts the retailer\'s own store', brand.b === true);
  ok('brand guard: accepts a banner store ignoring punctuation', brand.c === true);
  ok('brand guard: spares co-op members trading under their own name', brand.d === true);
  ok('brand guard: trusts official retailer feeds verbatim', brand.e === true);
  ok('brand guard: accepts a brand-prefixed variant', brand.f === true);

  // The real ingestion path must quarantine, not admit, a mismatched POI.
  const imported = (await db.query(`select import_directory_stores($1::jsonb) r`, [
    JSON.stringify([
      { retailer_slug: 'fetch-market', name: 'Fetch Market Riverside', source: 'OSM',
        source_id: 'osm/node/quality-1', address_line: '77 Riverside Dr', city: 'Testville',
        state: 'IL', zip: '60655', latitude: 41.71, longitude: -87.66 },
      { retailer_slug: 'fetch-market', name: 'Joe\'s Bitcoin ATM', source: 'OSM',
        source_id: 'osm/node/quality-2', address_line: '81 Riverside Dr', city: 'Testville',
        state: 'IL', zip: '60655', latitude: 41.72, longitude: -87.67 },
    ]),
  ])).rows[0].r;
  ok('import: mismatched POI is rejected, matching store is admitted',
    imported.inserted === 2 && imported.rejected === 1, JSON.stringify(imported));
  ok('import: rejected POI never reaches discovery',
    (await db.query("select count(*)::int n from search_stores('Bitcoin')")).rows[0].n === 0);
  ok('import: accepted POI is discoverable',
    (await db.query("select count(*)::int n from search_stores('Fetch Market Riverside')")).rows[0].n === 1);
  ok('import: identity columns are populated for new rows',
    (await db.query(
      "select count(*)::int n from stores where source_id='osm/node/quality-1' and address_normalized is not null and source_priority > 0"
    )).rows[0].n === 1);
  ok('import: an external identity is recorded for the new store',
    (await db.query(
      "select count(*)::int n from store_identities where id_value='osm/node/quality-1' and id_type='OSM'"
    )).rows[0].n === 1);

  // Re-importing the same rows must update, never duplicate.
  const again = (await db.query(`select import_directory_stores($1::jsonb) r`, [
    JSON.stringify([
      { retailer_slug: 'fetch-market', name: 'Fetch Market Riverside', source: 'OSM',
        source_id: 'osm/node/quality-1', address_line: '77 Riverside Dr', city: 'Testville',
        state: 'IL', zip: '60655', latitude: 41.71, longitude: -87.66 },
    ]),
  ])).rows[0].r;
  ok('import: re-running is idempotent', again.inserted === 0 && again.updated === 1,
    JSON.stringify(again));

  // Ranking: an exact retailer-name match must beat an incidental one.
  await db.query(
    `insert into stores (retailer_id, name, address_line, city, state, zip, latitude, longitude,
       source, source_id, address_normalized, source_priority, active)
     select id, 'Aardvark Corner Shop', '9 Fetch Market Ave', 'Testville', 'IL', '60699',
       41.5, -87.5, 'OSM', 'osm/node/rank-1', normalize_address('9 Fetch Market Ave'),
       source_priority('OSM'), true
     from retailers where slug = 'fetch-market'`
  );
  const ranked = (await db.query("select name from search_stores('Fetch Market')")).rows.map((r) => r.name);
  ok('ranking: an incidental address match never outranks the brand itself',
    ranked.length > 1 && ranked[ranked.length - 1] === 'Aardvark Corner Shop',
    JSON.stringify(ranked.slice(0, 4)));

  const zipRanked = (await db.query("select zip from search_stores('60655')")).rows.map((r) => r.zip);
  ok('ranking: an exact ZIP match ranks first', zipRanked[0] === '60655', JSON.stringify(zipRanked.slice(0, 3)));
}

// --- Result -----------------------------------------------------------------
console.log('');
if (failures > 0) {
  console.error(`${failures} schema check(s) failed`);
  process.exit(1);
}
console.log('All schema checks passed.');
await db.close();
