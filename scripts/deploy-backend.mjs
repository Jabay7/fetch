/**
 * One-shot backend deploy: applies any un-applied migrations, then reports
 * what still needs the Supabase CLI (Edge Functions).
 *
 *   node scripts/deploy-backend.mjs
 *
 * Needs SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF in .env (mint a token
 * at supabase.com/dashboard/account/tokens). Safe to re-run: migrations are
 * tracked in supabase_migrations.schema_migrations and skipped when present.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

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
if (!env.SUPABASE_ACCESS_TOKEN || !env.SUPABASE_PROJECT_REF) {
  console.error('Missing SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF in .env');
  console.error('Mint a token at https://supabase.com/dashboard/account/tokens');
  process.exit(2);
}

async function query(sql) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  if (!response.ok) {
    throw new Error(`${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return response.json();
}

// Which migrations has this project already seen?
const applied = new Set(
  (
    await query(
      `select version from supabase_migrations.schema_migrations order by version`
    )
  ).map((r) => r.version)
);

const dir = path.join('supabase', 'migrations');
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

let ran = 0;
for (const file of files) {
  const version = file.split('_')[0];
  if (applied.has(version)) {
    console.log(`  skip  ${file} (already applied)`);
    continue;
  }
  const sql = await readFile(path.join(dir, file), 'utf8');
  try {
    await query(sql);
    await query(
      `insert into supabase_migrations.schema_migrations (version, name)
       values ('${version}', '${file.replace(/^\d+_/, '').replace(/\.sql$/, '')}')
       on conflict (version) do nothing`
    );
    console.log(`   ok   ${file}`);
    ran += 1;
  } catch (error) {
    console.error(`  FAIL  ${file}: ${error.message}`);
    process.exit(1);
  }
}

console.log(`\n${ran} migration(s) applied.`);
console.log('\nStill to run (needs the Supabase CLI, same token):');
console.log(
  '  npx supabase functions deploy product-search-assistant store-search ' +
    'catalog-import refresh-popular-products --project-ref ' +
    env.SUPABASE_PROJECT_REF +
    ' --use-api'
);
console.log('  node scripts/import-stores-osm.mjs        # nationwide directory');
console.log('  node scripts/coverage-report.mjs          # verify coverage');
