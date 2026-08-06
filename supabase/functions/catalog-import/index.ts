// Catalog import Edge Function (Deno).
// Deploy: supabase functions deploy catalog-import
//
// POST { source_kind: 'CSV' | 'JSON', file_name?, csv? | rows?, dry_run?,
//        provider_slug? }
// Auth: an authenticated portal member (platform_admin, retailer_admin, or
// store_manager) — or the service-role key for operational imports. The
// anon key alone is rejected. Parsing/validation happens in the shared
// TypeScript core; the transactional upsert happens in the
// apply_catalog_import RPC. Responses report per-row errors and counts.

import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  parseCatalogCsv,
  parseCatalogJson,
  type ImportParseResult,
} from '../_shared/catalog-import-core.ts';

const ALLOWED_ORIGINS = new Set([
  'https://jabay7.github.io',
  'http://localhost:8081',
  'http://localhost:19006',
]);

const MAX_BODY_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_ROWS_PER_IMPORT = 20_000;

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://jabay7.github.io';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

function json(status: number, body: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json(405, { error: 'POST only' }, origin);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // --- authorization ---------------------------------------------------------
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  let actor = 'service-role';
  if (token !== serviceKey) {
    const { data: userData, error: userError } = await service.auth.getUser(token);
    if (userError || !userData?.user) {
      return json(401, { error: 'Authentication required' }, origin);
    }
    const { data: membership } = await service
      .from('portal_members')
      .select('role')
      .eq('user_id', userData.user.id)
      .in('role', ['platform_admin', 'retailer_admin', 'store_manager']);
    if (!membership || membership.length === 0) {
      return json(403, { error: 'Not authorized to import catalog data' }, origin);
    }
    actor = `portal:${userData.user.id}`;
  }

  // --- request validation ----------------------------------------------------
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json(413, { error: `Import exceeds ${MAX_BODY_BYTES / 1024 / 1024} MB limit` }, origin);
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'Body must be JSON' }, origin);
  }

  const sourceKind = body.source_kind === 'JSON' ? 'JSON' : body.source_kind === 'CSV' ? 'CSV' : null;
  if (!sourceKind) return json(400, { error: "source_kind must be 'CSV' or 'JSON'" }, origin);
  const dryRun = body.dry_run === true;

  let parsed: ImportParseResult;
  if (sourceKind === 'CSV') {
    if (typeof body.csv !== 'string') return json(400, { error: 'csv (string) is required' }, origin);
    parsed = parseCatalogCsv(body.csv);
  } else {
    parsed = parseCatalogJson(body.rows);
  }
  if (parsed.rows.length > MAX_ROWS_PER_IMPORT) {
    return json(413, { error: `Import exceeds ${MAX_ROWS_PER_IMPORT} rows` }, origin);
  }

  // --- provider linkage (optional) -------------------------------------------
  let providerId: string | null = null;
  if (typeof body.provider_slug === 'string') {
    const { data: provider } = await service
      .from('providers').select('id').eq('slug', body.provider_slug).maybeSingle();
    providerId = provider?.id ?? null;
  }

  // --- job + transactional apply ---------------------------------------------
  const { data: job, error: jobError } = await service
    .from('import_jobs')
    .insert({
      provider_id: providerId,
      source_kind: sourceKind,
      file_name: typeof body.file_name === 'string' ? body.file_name : null,
      dry_run: dryRun,
      created_by: actor,
    })
    .select('id')
    .single();
  if (jobError || !job) {
    console.error('[catalog-import] job insert failed', jobError?.message);
    return json(500, { error: 'Could not create import job' }, origin);
  }

  const { data: summary, error: applyError } = await service.rpc('apply_catalog_import', {
    p_job_id: job.id,
    p_rows: parsed.rows,
    p_dry_run: dryRun,
  });
  if (applyError) {
    await service.from('import_jobs').update({ status: 'FAILED' }).eq('id', job.id);
    console.error('[catalog-import] apply failed', applyError.message);
    return json(500, { error: 'Import failed; no rows were applied', job_id: job.id }, origin);
  }

  return json(200, {
    job_id: job.id,
    dry_run: dryRun,
    parse: parsed.stats,
    parse_errors: parsed.errors,
    apply: summary,
  }, origin);
});
