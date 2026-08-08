/**
 * Schedules the freshness job with pg_cron so previously-searched products
 * keep current aisles/stock/prices without anyone opening the app.
 *
 *   node scripts/setup-freshness-cron.mjs
 *
 * Runs hourly and calls the refresh-popular-products Edge Function, which
 * picks candidates by popularity (hot terms ~6h, long tail ~48h) so we never
 * sync millions of unused products. Idempotent: re-running re-schedules.
 */

import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

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
  console.error('SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF required in .env');
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

// A shared secret so only the scheduler can trigger the job.
const jobKey = env.REFRESH_JOB_KEY ?? randomUUID();
const functionUrl = `https://${env.SUPABASE_PROJECT_REF}.supabase.co/functions/v1/refresh-popular-products`;

await query('create extension if not exists pg_cron');
await query('create extension if not exists pg_net');

// Remove any previous schedule so this script is idempotent.
await query(`
  do $$
  begin
    perform cron.unschedule('fetch-freshness-hourly');
  exception when others then null;
  end $$;
`);

// The Edge Function gateway verifies a JWT before our handler runs, so the
// request needs the publishable anon key *and* the job key (which is what
// actually authorizes the refresh inside the function).
const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!anonKey) {
  console.error('EXPO_PUBLIC_SUPABASE_ANON_KEY required in .env');
  process.exit(2);
}

await query(`
  select cron.schedule(
    'fetch-freshness-hourly',
    '7 * * * *',
    $cron$
    select net.http_post(
      url := '${functionUrl}',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'Authorization', 'Bearer ${anonKey}',
        'x-refresh-key', '${jobKey}'
      ),
      body := '{}'::jsonb
    );
    $cron$
  )
`);

const jobs = await query(
  `select jobname, schedule, active from cron.job where jobname = 'fetch-freshness-hourly'`
);
console.log('Scheduled:', JSON.stringify(jobs));

if (!env.REFRESH_JOB_KEY) {
  console.log('\nGenerated a job key. Set it as a function secret and save it in .env:');
  console.log(`  npx supabase secrets set REFRESH_JOB_KEY=${jobKey} --project-ref ${env.SUPABASE_PROJECT_REF}`);
  console.log(`  echo REFRESH_JOB_KEY=${jobKey} >> .env`);
}
