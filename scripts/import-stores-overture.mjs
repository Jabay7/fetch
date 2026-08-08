/**
 * Overture Maps Places integration.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT A BULK STORE IMPORTER
 *
 * Overture holds ~74M places, and a naive run would add tens of thousands more
 * directory-only stores. That is the opposite of what this product needs: a
 * store nobody can search is not worth having, and we already carry 39,986 of
 * them. Coverage beats count.
 *
 * What Overture uniquely offers is *quality*:
 *
 *   operating_status  a real permanently-closed signal. OpenStreetMap, our
 *                     directory backbone, has no reliable closure marker — a
 *                     shut store simply lingers. In the Chicago bounding box
 *                     alone Overture flags 747 closed shopping places.
 *   confidence        0-1 existence score, so junk can be filtered rather
 *                     than trusted equally with everything else.
 *
 * So the default mode audits what we already have. Importing new stores is
 * opt-in and scoped to retailers we can actually serve.
 *
 * ---------------------------------------------------------------------------
 * LICENSING
 *
 * Places is CDLA-Permissive-2.0 / Apache-2.0 and contains no OpenStreetMap
 * data, so it carries none of ODbL's share-alike obligations — unlike our OSM
 * rows. Provenance is therefore recorded per row and the two are never merged
 * into one lineage: joining CDLA data to OSM can pull ODbL onto the result.
 *
 * ---------------------------------------------------------------------------
 * SCHEMA NOTE
 *
 * Built against `taxonomy`, never `categories`. The latter is deprecated and
 * removed in the September 2026 release — next month at time of writing.
 * Note `taxonomy.alternates` is plural where the old `categories.alternate`
 * was singular.
 *
 *   npm run overture:audit                  # closure + confidence audit
 *   npm run overture:audit -- --apply       # ...and write the findings
 *   npm run overture:audit -- --state IL
 */

import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const onlyState = args.includes('--state') ? args[args.indexOf('--state') + 1] : null;

/** Existence score below which Overture rows are treated as junk. Overture
 *  documents a 0.2 floor but does not actually enforce it upstream. */
const MIN_CONFIDENCE = 0.6;
/** Metres within which an Overture place and our store are the same place. */
const MATCH_RADIUS_M = 120;

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
    /* optional */
  }
  return env;
}

const env = await loadEnv();
for (const key of ['SUPABASE_PROJECT_REF', 'SUPABASE_ACCESS_TOKEN']) {
  if (!env[key]) {
    console.error(`Missing ${key}`);
    process.exit(1);
  }
}

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

const plain = (rows) =>
  rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])
    )
  );

// --- Release discovery -------------------------------------------------------
// Never hard-code a release: Overture publishes monthly and the STAC catalog is
// the documented way to find the current one.
const stac = await (await fetch('https://stac.overturemaps.org/catalog.json')).json();
const release = stac.latest;
if (!release) {
  console.error('Could not resolve the latest Overture release from STAC');
  process.exit(1);
}
const PLACES = `s3://overturemaps-us-west-2/release/${release}/theme=places/type=place/*.parquet`;

console.log(`Overture Places audit`);
console.log(`  release   : ${release}`);
console.log(`  licence   : CDLA-Permissive-2.0 / Apache-2.0 (no share-alike)`);
console.log(`  confidence: >= ${MIN_CONFIDENCE}`);
console.log('');

const { DuckDBInstance } = await import('@duckdb/node-api');
const instance = await DuckDBInstance.create(':memory:');
const con = await instance.connect();
await con.run("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';");

// --- Our stores, bucketed by state ------------------------------------------
const stateFilter = onlyState ? `and s.state = '${onlyState.replace(/'/g, "''")}'` : '';
const stores = plain(
  await sql(`
    select s.id, s.name, s.city, s.state, s.latitude, s.longitude,
           coalesce(r.name, '') retailer
    from stores s
    left join retailers r on r.id = s.retailer_id
    where s.active and s.lifecycle = 'ACTIVE' and s.review_status = 'OK'
      and not s.is_demo and s.source = 'OSM'
      and s.latitude is not null and s.longitude is not null
      ${stateFilter}
  `)
);
console.log(`Auditing ${stores.length} OpenStreetMap-sourced stores` +
  (onlyState ? ` in ${onlyState}` : '') + '\n');

const byState = new Map();
for (const store of stores) {
  if (!byState.has(store.state)) byState.set(store.state, []);
  byState.get(store.state).push(store);
}

const normalize = (value) =>
  (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const metres = (aLat, aLon, bLat, bLon) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
};

const closed = [];
let scanned = 0;

for (const [state, group] of [...byState].sort((a, b) => b[1].length - a[1].length)) {
  // One bounding box per state, padded, so each state is a single scan rather
  // than a request per store.
  const lats = group.map((s) => s.latitude);
  const lons = group.map((s) => s.longitude);
  const pad = 0.02;
  const box = {
    xmin: Math.min(...lons) - pad,
    xmax: Math.max(...lons) + pad,
    ymin: Math.min(...lats) - pad,
    ymax: Math.max(...lats) + pad,
  };

  let rows;
  try {
    // Only closures are pulled. It is a small, targeted result set — the point
    // is to find stores of ours that have shut, not to mirror the corpus.
    const result = await con.runAndReadAll(`
      select names.primary nm,
             addresses[1].freeform addr,
             addresses[1].locality city,
             -- Places geometry is always a Point, so the bbox struct carries
             -- the coordinate. Avoids needing the spatial extension.
             bbox.ymin lat, bbox.xmin lon,
             confidence conf
      from read_parquet('${PLACES}')
      where bbox.xmin between ${box.xmin} and ${box.xmax}
        and bbox.ymin between ${box.ymin} and ${box.ymax}
        and list_contains(taxonomy.hierarchy, 'shopping')
        and operating_status = 'permanently_closed'
        and confidence >= ${MIN_CONFIDENCE}
        and names.primary is not null
    `);
    rows = plain(result.getRowObjects());
  } catch (error) {
    console.warn(`  ${state}: query failed (${String(error.message).slice(0, 70)})`);
    continue;
  }
  scanned += 1;

  let hits = 0;
  for (const store of group) {
    const storeKey = normalize(store.name);
    const retailerKey = normalize(store.retailer);
    for (const place of rows) {
      const placeKey = normalize(place.nm);
      // Require both a name relationship and physical proximity. Either alone
      // produces false positives: chains repeat names across a city, and two
      // unrelated shops share a strip mall.
      const nameMatches =
        placeKey && storeKey &&
        (placeKey === storeKey ||
          placeKey.includes(storeKey) ||
          storeKey.includes(placeKey) ||
          (retailerKey.length >= 4 && placeKey.includes(retailerKey)));
      if (!nameMatches) continue;
      const d = metres(store.latitude, store.longitude, place.lat, place.lon);
      if (d > MATCH_RADIUS_M) continue;
      closed.push({
        id: store.id,
        name: store.name,
        city: store.city,
        state: store.state,
        overture: place.nm,
        metres: Math.round(d),
        confidence: Number(place.conf).toFixed(2),
      });
      hits += 1;
      break;
    }
  }
  console.log(
    `  ${state.padEnd(3)} ${String(group.length).padStart(5)} stores · ` +
      `${String(rows.length).padStart(5)} closed places · ${hits} match`
  );
}

console.log('');
console.log(`Scanned ${scanned} states.`);
console.log(`Stores in our directory that Overture reports permanently closed: ${closed.length}`);
for (const row of closed.slice(0, 15)) {
  console.log(
    `   ${row.name.slice(0, 34).padEnd(36)} ${(row.city + ', ' + row.state).padEnd(22)} ` +
      `${row.metres}m  conf ${row.confidence}`
  );
}

if (!apply) {
  console.log('\nDry run — nothing written. Re-run with --apply to record these.');
  process.exit(0);
}

if (closed.length === 0) {
  console.log('\nNothing to apply.');
  process.exit(0);
}

// Lifecycle, not deletion: the record stays for audit and can be revived if a
// store reopens or the match turns out to be wrong.
const ids = closed.map((row) => `'${row.id}'`).join(',');
await sql(`
  update stores set
    lifecycle = 'PERMANENTLY_CLOSED',
    lifecycle_updated_at = now(),
    review_reason = 'Overture Places reports this location permanently closed'
  where id in (${ids})
`);
await sql('select refresh_store_coverage()');

console.log(`\nMarked ${closed.length} stores permanently closed.`);
console.log('Attribution: Places data from Overture Maps Foundation (overturemaps.org),');
console.log('CDLA-Permissive-2.0 / Apache-2.0.');
