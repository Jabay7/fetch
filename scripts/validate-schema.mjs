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
const stores = await db.query("select * from search_stores('')");
ok('search_stores returns seeded stores', stores.rows.length >= 4, `got ${stores.rows.length}`);

const schaumburg = stores.rows.find((s) => s.name === 'Schaumburg Main Store');
const naperville = stores.rows.find((s) => s.name === 'Naperville West Store');
const lakeview = stores.rows.find((s) => s.name?.startsWith('Lakeview'));
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

// --- Result -----------------------------------------------------------------
console.log('');
if (failures > 0) {
  console.error(`${failures} schema check(s) failed`);
  process.exit(1);
}
console.log('All schema checks passed.');
await db.close();
