// refresh-popular-products Edge Function (Deno).
// Deploy: supabase functions deploy refresh-popular-products
// Secrets: REFRESH_JOB_KEY (shared secret for the scheduler)
//
// Scheduled freshness job: re-syncs the aisle/stock/price of products people
// actually search, popularity-weighted (hot terms every ~6h, the long tail
// every ~48h — see get_refresh_candidates). Never syncs unused products.
// Triggered hourly by pg_cron (scripts/setup-freshness-cron.mjs) or manually
// with the shared key.

import { createClient } from 'npm:@supabase/supabase-js@2';

import { KrogerClient } from '../_shared/kroger.ts';
import { syncKrogerTerm } from '../_shared/kroger-sync.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 });
  }

  const configuredKey = Deno.env.get('REFRESH_JOB_KEY');
  const providedKey = req.headers.get('x-refresh-key');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!(configuredKey && providedKey === configuredKey) && bearer !== serviceKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const clientId = Deno.env.get('KROGER_CLIENT_ID');
  const clientSecret = Deno.env.get('KROGER_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ refreshed: 0, note: 'kroger unconfigured' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, {
    auth: { persistSession: false },
  });
  const kroger = new KrogerClient(
    { clientId, clientSecret },
    { baseUrl: Deno.env.get('KROGER_API_BASE') ?? undefined }
  );

  const started = Date.now();
  const { data: candidates, error } = await db.rpc('get_refresh_candidates', {
    p_limit: 15,
  });
  if (error) {
    return new Response(JSON.stringify({ error: 'candidate query failed' }), { status: 500 });
  }

  let refreshed = 0;
  const details: { store: string; term: string; ok: boolean }[] = [];
  for (const candidate of candidates ?? []) {
    const ok = await syncKrogerTerm(
      db,
      kroger,
      { retailerSlug: 'kroger', providerStoreId: candidate.provider_store_id },
      candidate.term,
      20,
      'freshness-job'
    );
    if (ok) refreshed += 1;
    details.push({ store: candidate.provider_store_id, term: candidate.term, ok });
  }

  // Operational record for the provider dashboard.
  const { data: provider } = await db
    .from('providers')
    .select('id')
    .eq('slug', 'kroger-api')
    .maybeSingle();
  if (provider) {
    await db.from('provider_sync_jobs').insert({
      provider_id: provider.id,
      job_type: 'INCREMENTAL',
      status: 'SUCCEEDED',
      started_at: new Date(started).toISOString(),
      finished_at: new Date().toISOString(),
      stats: { candidates: candidates?.length ?? 0, refreshed },
    });
  }

  return new Response(
    JSON.stringify({ candidates: candidates?.length ?? 0, refreshed, details }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
});
