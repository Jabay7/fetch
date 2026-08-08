/**
 * Nationwide Kroger-family store import.
 *
 * Every store this finds becomes immediately searchable with real aisles,
 * prices and stock, because the Kroger Products API answers for it on demand.
 * That makes this the highest-value store import available: a Kroger location
 * is worth more to a shopper than a thousand directory-only addresses.
 *
 * Enumeration walks a lat/long grid rather than a ZIP list. ZIP density tracks
 * population, so a ZIP sweep over-queries cities and misses rural stores. A
 * grid gives even coverage.
 *
 * The API caps a response at `filter.limit`, and a full response is
 * indistinguishable from a truncated one — so any cell that comes back full is
 * subdivided into quadrants and re-queried until it isn't. Without that, dense
 * metros silently lose stores.
 *
 *   npm run import:kroger                 # full sweep
 *   npm run import:kroger -- --dry-run    # enumerate only, no writes
 *   npm run import:kroger -- --max-calls 300
 */

import { readFile } from 'node:fs/promises';

import {
  chainToRetailerSlug,
  mapKrogerLocation,
} from '../supabase/functions/_shared/kroger.ts';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const maxCalls = args.includes('--max-calls')
  ? Number(args[args.indexOf('--max-calls') + 1])
  : 1200; // Stay clear of the documented daily Locations budget.

const PAGE_LIMIT = 200; // Max locations per response.
const BATCH_SIZE = 200; // Rows per database import call.

async function loadEnv() {
  const env = { ...process.env };
  try {
    const raw = await readFile('.env', 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const i = line.indexOf('=');
      if (i > 0 && !line.trimStart().startsWith('#')) {
        env[line.slice(0, i).trim()] ||= line.slice(i + 1).trim();
      }
    }
  } catch {
    /* .env is optional when the values are already exported */
  }
  return env;
}

const env = await loadEnv();
for (const key of ['KROGER_CLIENT_ID', 'KROGER_CLIENT_SECRET', 'SUPABASE_PROJECT_REF', 'SUPABASE_ACCESS_TOKEN']) {
  if (!env[key]) {
    console.error(`Missing ${key}`);
    process.exit(1);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Kroger auth -------------------------------------------------------------
let token = null;
let tokenExpiresAt = 0;

async function getToken() {
  if (token && Date.now() < tokenExpiresAt - 60_000) return token;
  const basic = Buffer.from(`${env.KROGER_CLIENT_ID}:${env.KROGER_CLIENT_SECRET}`).toString('base64');
  const response = await fetch('https://api.kroger.com/v1/connect/oauth2/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${basic}`,
    },
    body: 'grant_type=client_credentials&scope=product.compact',
  });
  const body = await response.json();
  if (!body.access_token) throw new Error(`kroger token failed: ${JSON.stringify(body).slice(0, 200)}`);
  token = body.access_token;
  tokenExpiresAt = Date.now() + body.expires_in * 1000;
  return token;
}

let callCount = 0;

async function locationsNear(lat, lon, radiusMiles) {
  if (callCount >= maxCalls) return null;
  callCount += 1;
  const params = new URLSearchParams({
    'filter.latLong.near': `${lat.toFixed(4)},${lon.toFixed(4)}`,
    'filter.radiusInMiles': String(radiusMiles),
    'filter.limit': String(PAGE_LIMIT),
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`https://api.kroger.com/v1/locations?${params}`, {
      headers: { authorization: `Bearer ${await getToken()}` },
    });
    if (response.status === 429) {
      const wait = Number(response.headers.get('retry-after') ?? 5) * 1000;
      console.warn(`  rate limited, waiting ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    if (!response.ok) {
      if (response.status >= 500) {
        await sleep(1500);
        continue;
      }
      console.warn(`  ${lat.toFixed(2)},${lon.toFixed(2)} → HTTP ${response.status}`);
      return [];
    }
    const body = await response.json();
    return body.data ?? [];
  }
  return [];
}

// --- Adaptive sweep ----------------------------------------------------------
const found = new Map(); // locationId → mapped store row

/**
 * Query one cell. A response at the page limit means the API truncated, so the
 * cell is split into quadrants and each is queried at half the radius. Depth is
 * bounded so a pathologically dense area cannot spin forever.
 */
async function sweepCell(lat, lon, radiusMiles, depth = 0) {
  const rows = await locationsNear(lat, lon, radiusMiles);
  if (rows === null) return; // call budget exhausted
  let added = 0;
  for (const location of rows) {
    if (!location.locationId || found.has(location.locationId)) continue;
    const mapped = mapKrogerLocation(location);
    if (!mapped) continue;
    found.set(location.locationId, mapped);
    added += 1;
  }
  const truncated = rows.length >= PAGE_LIMIT;
  if (added > 0 || truncated) {
    process.stdout.write(
      `\r  swept ${String(callCount).padStart(4)} cells · ${found.size} stores found   `
    );
  }
  if (truncated && depth < 4 && radiusMiles > 12) {
    const half = radiusMiles / 2;
    const dLat = half / 69; // ~69 miles per degree of latitude
    const dLon = half / (69 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
    for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      await sweepCell(lat + a * dLat * 0.5, lon + b * dLon * 0.5, half, depth + 1);
    }
  }
}

// Continental US plus Alaska/Hawaii anchors, at a spacing that overlaps the
// 100-mile query radius so nothing falls between cells.
function buildGrid() {
  const cells = [];
  for (let lat = 25.5; lat <= 49; lat += 2) {
    for (let lon = -124; lon <= -67; lon += 2.5) {
      cells.push([lat, lon]);
    }
  }
  cells.push([21.31, -157.86]); // Honolulu (Foodland is not Kroger, but cheap to check)
  cells.push([61.22, -149.9]); // Anchorage (Fred Meyer)
  cells.push([64.84, -147.72]); // Fairbanks (Fred Meyer)
  return cells;
}

console.log(`Kroger nationwide store sweep${dryRun ? ' (dry run)' : ''}`);
console.log(`  call budget: ${maxCalls}`);
const grid = buildGrid();
console.log(`  grid cells: ${grid.length}\n`);

for (const [lat, lon] of grid) {
  if (callCount >= maxCalls) {
    console.log('\n  call budget reached, stopping sweep');
    break;
  }
  await sweepCell(lat, lon, 100);
}
process.stdout.write('\n');

const stores = [...found.values()];
const byRetailer = new Map();
for (const s of stores) byRetailer.set(s.retailer_slug, (byRetailer.get(s.retailer_slug) ?? 0) + 1);

console.log(`\nDiscovered ${stores.length} Kroger-family stores in ${callCount} API calls:`);
for (const [slug, n] of [...byRetailer].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${slug}`);
}

if (dryRun) {
  console.log('\nDry run — nothing written.');
  process.exit(0);
}

// --- Persist -----------------------------------------------------------------
async function sql(query) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query }),
    }
  );
  const body = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(body).slice(0, 400));
  return body;
}

let inserted = 0;
let updated = 0;
let skipped = 0;

for (let i = 0; i < stores.length; i += BATCH_SIZE) {
  const batch = stores.slice(i, i + BATCH_SIZE).map((s) => ({
    ...s,
    // Official retailer data: highest source priority, and the store name is
    // trusted verbatim rather than graded against the brand.
    source: 'RETAILER_API',
    source_id: `kroger:${s.provider_store_id}`,
    source_name: s.name,
    source_url: 'https://developer-ce.kroger.com/api-products/api/location-api-public',
    source_attribution: 'Store data from the Kroger Locations API',
    data_confidence: 'HIGH',
    chain: s.chain ?? null,
  }));
  const literal = JSON.stringify(batch).replace(/'/g, "''");
  const result = await sql(`select import_directory_stores('${literal}'::jsonb) as r`);
  const r = result[0].r;
  inserted += r.inserted;
  updated += r.updated;
  skipped += r.skipped + r.unknown_retailers;
  process.stdout.write(
    `\r  imported ${Math.min(i + BATCH_SIZE, stores.length)}/${stores.length}   `
  );
}
process.stdout.write('\n');

// Every Kroger-family store can answer aisle, price and stock the moment it
// exists, because the Products API serves it live. Capabilities reflect the
// integration, not how much happens to be cached yet.
console.log('\nActivating capabilities for Kroger-family stores...');
const activated = await sql(`
  insert into store_capabilities (
    store_id, aisle_data, inventory, pricing, product_images,
    store_map, realtime, product_search, department_data, last_synced_at
  )
  select s.id, true, true, true, true, false, false, true, true, now()
  from stores s
  join retailers r on r.id = s.retailer_id
  where s.source = 'RETAILER_API'
    and s.provider_store_id is not null
    and r.parent_company = 'Kroger'
  on conflict (store_id) do update set
    aisle_data = true, inventory = true, pricing = true, product_images = true,
    product_search = true, department_data = true, last_synced_at = now()
  returning store_id
`);

// Kroger banners are live integrations; the matrix should say so.
await sql(`update retailers set integration_status = 'live' where parent_company = 'Kroger'`);
await sql('select refresh_store_coverage()');

const summary = (await sql('select * from get_coverage_summary()'))[0];

console.log(`\nDone.`);
console.log(`  inserted ${inserted}, updated ${updated}, skipped ${skipped}`);
console.log(`  capabilities activated: ${activated.length}`);
console.log('');
console.log('COVERAGE NOW:');
console.log(`  full-location stores : ${summary.full_location_stores}`);
console.log(`  product stores       : ${summary.product_stores}`);
console.log(`  searchable stores    : ${summary.searchable_stores}`);
console.log(`  coming soon          : ${summary.coming_soon_stores}`);
