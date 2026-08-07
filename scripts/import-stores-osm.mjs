/**
 * Nationwide store-directory import from OpenStreetMap (ODbL, attributed).
 *
 *   node scripts/import-stores-osm.mjs                  # all brands
 *   node scripts/import-stores-osm.mjs --brands walmart,target
 *   node scripts/import-stores-osm.mjs --dry-run        # fetch + map only
 *
 * Fetches each brand's US locations from Overpass, maps them via the shared
 * osm-directory core, and applies them through the import_directory_stores
 * RPC (management API; needs SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF
 * in .env). Polite to Overpass: serial queries, delays, proper User-Agent.
 */

import { readFile } from 'node:fs/promises';

import {
  buildOverpassQuery,
  mapOsmElements,
  OSM_BRANDS,
} from '../supabase/functions/_shared/osm-directory.ts';

const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];
const USER_AGENT = 'FetchProductLocator/1.0 (store directory import; github.com/Jabay7/fetch)';
const BATCH_SIZE = 250;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const brandsArg = args.includes('--brands') ? args[args.indexOf('--brands') + 1] : null;
const brands = brandsArg
  ? OSM_BRANDS.filter((b) => brandsArg.split(',').includes(b.slug))
  : OSM_BRANDS;

async function loadEnv() {
  const env = { ...process.env };
  try {
    const raw = await readFile('.env', 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2];
    }
  } catch {
    /* rely on process env */
  }
  return env;
}

const env = await loadEnv();
if (!dryRun && (!env.SUPABASE_ACCESS_TOKEN || !env.SUPABASE_PROJECT_REF)) {
  console.error('SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF required (or use --dry-run)');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBrand(brand) {
  const query = buildOverpassQuery(brand);
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': USER_AGENT,
        },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!response.ok) {
        console.warn(`  ${brand.slug}: ${endpoint.split('/')[2]} → ${response.status}, trying next`);
        continue;
      }
      const body = await response.json();
      return body.elements ?? [];
    } catch (error) {
      console.warn(`  ${brand.slug}: ${endpoint.split('/')[2]} failed (${error.message}), trying next`);
    }
  }
  return null;
}

async function applyRows(rows) {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const jsonLiteral = JSON.stringify(batch).replace(/'/g, "''");
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query: `select import_directory_stores('${jsonLiteral}'::jsonb) as result`,
        }),
      }
    );
    if (!response.ok) {
      console.error(`  apply failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
      return null;
    }
    const [{ result }] = await response.json();
    inserted += result.inserted;
    updated += result.updated;
    skipped += result.skipped;
  }
  return { inserted, updated, skipped };
}

let totalMapped = 0;
let totalInserted = 0;
const summary = [];

for (const brand of brands) {
  process.stdout.write(`${brand.slug.padEnd(16)} fetching… `);
  const elements = await fetchBrand(brand);
  if (elements === null) {
    console.log('FAILED (all endpoints)');
    summary.push({ brand: brand.slug, error: 'fetch failed' });
    continue;
  }
  const rows = mapOsmElements(elements, brand);
  totalMapped += rows.length;
  process.stdout.write(`${elements.length} elements → ${rows.length} usable`);

  if (dryRun || rows.length === 0) {
    console.log(dryRun ? ' (dry run)' : '');
    summary.push({ brand: brand.slug, elements: elements.length, usable: rows.length });
  } else {
    const applied = await applyRows(rows);
    if (applied) {
      totalInserted += applied.inserted;
      console.log(` → +${applied.inserted} new, ${applied.updated} updated, ${applied.skipped} skipped`);
      summary.push({ brand: brand.slug, usable: rows.length, ...applied });
    } else {
      summary.push({ brand: brand.slug, usable: rows.length, error: 'apply failed' });
    }
  }
  await sleep(3000); // be polite to Overpass
}

console.log(`\nDone. Mapped ${totalMapped} stores${dryRun ? '' : `, inserted ${totalInserted} new`}.`);
const failures = summary.filter((s) => s.error);
if (failures.length > 0) {
  console.log('Failures:', failures.map((f) => f.brand).join(', '));
}
