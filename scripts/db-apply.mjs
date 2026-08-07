/**
 * Apply SQL files to the linked Supabase project via the management API
 * (no direct database password needed — authenticates with the operator's
 * personal access token).
 *
 *   node scripts/db-apply.mjs supabase/migrations/*.sql
 *   node scripts/db-apply.mjs supabase/seed.sql
 *
 * Reads SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF from the environment
 * or from a local .env file. Each file runs as one batch (implicit
 * transaction): a failing file aborts atomically and stops the run.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function loadEnv() {
  const env = { ...process.env };
  try {
    const raw = await readFile('.env', 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (match && !(match[1] in env)) env[match[1]] = match[2];
    }
  } catch {
    // no .env — rely on process env
  }
  return env;
}

const env = await loadEnv();
const token = env.SUPABASE_ACCESS_TOKEN;
const ref = env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error('SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF are required (env or .env)');
  process.exit(2);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/db-apply.mjs <file.sql> [more.sql ...]');
  process.exit(2);
}

for (const file of files) {
  const sql = await readFile(file, 'utf8');
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  if (!response.ok) {
    const detail = await response.text();
    console.error(`FAIL  ${path.basename(file)} (${response.status}): ${detail.slice(0, 500)}`);
    process.exit(1);
  }
  console.log(`  ok  ${path.basename(file)}`);
}
console.log('All files applied.');
