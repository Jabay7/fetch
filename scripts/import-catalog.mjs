/**
 * Catalog import CLI for operators and store managers.
 *
 *   node scripts/import-catalog.mjs --file store-catalog.csv [--dry-run]
 *     [--provider csv-import] [--name "August planogram"]
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or a portal member
 * JWT in SUPABASE_ACCESS_TOKEN). See docs/ADMIN.md.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const getFlag = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const file = getFlag('file');
const dryRun = args.includes('--dry-run');
const provider = getFlag('provider') ?? 'csv-import';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ACCESS_TOKEN;

if (!file || !url || !key) {
  console.error(
    'Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-catalog.mjs --file <csv|json> [--dry-run]'
  );
  process.exit(2);
}

const content = await readFile(file, 'utf8');
const isJson = path.extname(file).toLowerCase() === '.json';

const body = {
  source_kind: isJson ? 'JSON' : 'CSV',
  file_name: path.basename(file),
  dry_run: dryRun,
  provider_slug: provider,
  ...(isJson ? { rows: JSON.parse(content) } : { csv: content }),
};

const response = await fetch(`${url}/functions/v1/catalog-import`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify(body),
});

const result = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(`Import failed (${response.status}):`, result.error ?? result);
  process.exit(1);
}

console.log(`${dryRun ? 'DRY RUN — no rows written' : 'Import applied'} (job ${result.job_id})`);
console.log('Parse:', JSON.stringify(result.parse));
if (result.parse_errors?.length) {
  console.log('Row errors:');
  for (const err of result.parse_errors) {
    console.log(`  row ${err.row}: [${err.code}] ${err.message}`);
  }
}
console.log('Apply:', JSON.stringify(result.apply));
