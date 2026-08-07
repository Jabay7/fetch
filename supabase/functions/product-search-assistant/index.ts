// product-search-assistant Edge Function (Deno).
// Deploy: supabase functions deploy product-search-assistant
// Secrets: supabase secrets set ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=claude-opus-5
//
// POST { store_id: uuid, term: string, limit?: number }
//
// Pipeline (deterministic first, AI last, per docs/API.md):
//   1. validate request + rate limit
//   2. confirm the store exists (get_store)
//   3. exact identifier lookup (UPC/GTIN/EAN/SKU) when the term is code-shaped
//   4. ranked deterministic search (exact/prefix/alias/fts/fuzzy) + DB-driven
//      query expansions (search_aliases) and plural stripping
//   5. only if all of that found nothing: Claude interprets the words into a
//      structured SearchInterpretation (validated, cached), and the VERIFIED
//      DATABASE is searched again with those terms
//   6. results are assembled exclusively from database rows — the AI cannot
//      introduce an aisle, price, or stock status by construction
//
// The frontend calls this over HTTPS with the anon key; ANTHROPIC_API_KEY
// exists only as a server-side secret. Without the secret the function still
// serves deterministic search (ai: "unconfigured").

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

import {
  buildInterpretationPrompt,
  INTERPRETATION_JSON_SCHEMA,
  interpretationToCandidateTerms,
  shouldUseAi,
  validateInterpretation,
  type SearchInterpretation,
} from '../_shared/search-interpretation.ts';
import {
  buildTrustedResult,
  tierFromScore,
  type DbProductRow,
  type DbStoreRow,
} from '../_shared/trusted-results.ts';
import {
  KrogerClient,
  KROGER_RETAILER_SLUGS,
  mapKrogerProduct,
} from '../_shared/kroger.ts';

const ALLOWED_ORIGINS = new Set([
  'https://jabay7.github.io',
  'http://localhost:8081',
  'http://localhost:19006',
]);

const RATE_LIMIT_PER_MINUTE = 30;
const AI_TIMEOUT_MS = 10_000;
const AI_MAX_OUTPUT_TOKENS = 1024;
const AI_CACHE_TTL_HOURS = 24 * 7;
const MAX_TERM_LENGTH = 160;

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://jabay7.github.io';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

function json(status: number, body: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

// --- per-isolate rate limiting + duplicate-request suppression --------------
const requestWindows = new Map<string, { windowStart: number; count: number }>();

function rateLimited(clientKey: string): boolean {
  const now = Date.now();
  const window = requestWindows.get(clientKey);
  if (!window || now - window.windowStart >= 60_000) {
    requestWindows.set(clientKey, { windowStart: now, count: 1 });
    return false;
  }
  window.count += 1;
  return window.count > RATE_LIMIT_PER_MINUTE;
}

const inflight = new Map<string, Promise<Response>>();

// --- Kroger live provider (optional; active when secrets exist) -------------
let krogerClient: KrogerClient | null | undefined;

function getKroger(): KrogerClient | null {
  if (krogerClient !== undefined) return krogerClient;
  const clientId = Deno.env.get('KROGER_CLIENT_ID');
  const clientSecret = Deno.env.get('KROGER_CLIENT_SECRET');
  krogerClient = clientId && clientSecret ? new KrogerClient({ clientId, clientSecret }, { baseUrl: Deno.env.get('KROGER_API_BASE') ?? undefined }) : null;
  return krogerClient;
}

interface ProviderIdentity {
  retailerSlug: string | null;
  providerStoreId: string | null;
}

async function getProviderIdentity(
  db: SupabaseClient,
  storeId: string
): Promise<ProviderIdentity> {
  const { data } = await db
    .from('stores')
    .select('provider_store_id, retailers(slug)')
    .eq('id', storeId)
    .maybeSingle();
  const retailer = data?.retailers as { slug?: string } | { slug?: string }[] | null;
  const slug = Array.isArray(retailer) ? retailer[0]?.slug : retailer?.slug;
  return {
    retailerSlug: slug ?? null,
    providerStoreId: data?.provider_store_id ?? null,
  };
}

/**
 * Live Kroger search with cache-through: official API rows are upserted into
 * the database via the audited import pipeline (source RETAILER_API), then
 * the ranked DB search serves them like any other verified data. Failures
 * degrade to whatever the database already has.
 */
async function syncKrogerProducts(
  db: SupabaseClient,
  identity: ProviderIdentity,
  term: string,
  limit: number
): Promise<boolean> {
  const kroger = getKroger();
  if (!kroger || !identity.providerStoreId || !identity.retailerSlug) return false;
  if (!KROGER_RETAILER_SLUGS.includes(identity.retailerSlug)) return false;
  try {
    const products = await kroger.searchProducts(identity.providerStoreId, term, limit);
    const rows = products
      .map((product) =>
        mapKrogerProduct(product, {
          retailer_slug: identity.retailerSlug as string,
          provider_store_id: identity.providerStoreId as string,
        })
      )
      .filter((row) => row !== null);
    if (rows.length === 0) return false;

    const { data: job } = await db
      .from('import_jobs')
      .insert({
        source_kind: 'API_RESPONSE',
        file_name: `kroger:${identity.providerStoreId}:${term.slice(0, 40)}`,
        created_by: 'kroger-live',
      })
      .select('id')
      .single();
    if (!job) return false;
    const { error } = await db.rpc('apply_catalog_import', {
      p_job_id: job.id,
      p_rows: rows,
      p_dry_run: false,
    });
    if (error) {
      console.error('[product-search-assistant] kroger upsert failed:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error(
      '[product-search-assistant] kroger search failed:',
      error instanceof Error ? error.message : error
    );
    return false;
  }
}

// --- helpers ----------------------------------------------------------------
const normalize = (raw: string) => raw.toLowerCase().trim().replace(/\s+/g, ' ');

function singularize(term: string): string {
  return term
    .split(' ')
    .map((token) => {
      if (token.length > 4 && token.endsWith('ies')) return token.slice(0, -3) + 'y';
      if (token.length > 3 && token.endsWith('es')) return token.slice(0, -2);
      if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
      return token;
    })
    .join(' ');
}

interface SearchOutcome {
  rows: (DbProductRow & { score?: number })[];
  matchedTier: string;
  matchedTerm: string;
}

async function deterministicSearch(
  db: SupabaseClient,
  storeId: string,
  rawTerm: string,
  limit: number
): Promise<SearchOutcome> {
  const term = normalize(rawTerm);

  // Tier 1: exact identifier (UPC / GTIN / EAN / retailer SKU / provider id).
  if (/^[\d\s-]{8,20}$/.test(term)) {
    const { data } = await db.rpc('lookup_store_product', {
      p_store_id: storeId,
      p_code: term.replace(/[\s-]/g, ''),
    });
    if (data && data.length > 0) {
      return { rows: data, matchedTier: 'IDENTIFIER', matchedTerm: term };
    }
  }

  // Tiers 2-8: ranked SQL search over candidate terms (term itself, DB query
  // expansions, singularized form).
  const candidates = new Set<string>([term]);
  const { data: expansions } = await db.rpc('get_search_expansions', { p_term: term });
  for (const row of expansions ?? []) candidates.add(normalize(row.expansion));
  const singular = singularize(term);
  if (singular.length >= 2) {
    candidates.add(singular);
    const { data: singularExpansions } = await db.rpc('get_search_expansions', { p_term: singular });
    for (const row of singularExpansions ?? []) candidates.add(normalize(row.expansion));
  }

  for (const candidate of candidates) {
    const { data, error } = await db.rpc('search_products', {
      p_store_id: storeId,
      p_term: candidate,
      p_limit: limit,
    });
    if (error) throw new Error(`search_products failed: ${error.message}`);
    if (data && data.length > 0) {
      return {
        rows: data,
        matchedTier: tierFromScore(Number(data[0].score ?? 0)),
        matchedTerm: candidate,
      };
    }
  }
  return { rows: [], matchedTier: 'NONE', matchedTerm: term };
}

interface AiStep {
  interpretation: SearchInterpretation | null;
  cached: boolean;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

async function interpretWithClaude(
  db: SupabaseClient,
  normalizedTerm: string
): Promise<AiStep> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return { interpretation: null, cached: false, error: 'unconfigured' };
  const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-opus-5';

  // Interpretation cache: identical queries never pay for a second AI call.
  const { data: cachedRow } = await db
    .from('ai_interpretations')
    .select('id, interpretation, model, hit_count')
    .eq('normalized_term', normalizedTerm)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (cachedRow) {
    const revalidated = validateInterpretation(cachedRow.interpretation);
    if (revalidated) {
      await db
        .from('ai_interpretations')
        .update({ hit_count: (cachedRow.hit_count ?? 0) + 1 })
        .eq('id', cachedRow.id);
      return { interpretation: revalidated, cached: true, model: cachedRow.model };
    }
  }

  const anthropic = new Anthropic({ apiKey, timeout: AI_TIMEOUT_MS, maxRetries: 1 });
  const prompt = buildInterpretationPrompt(normalizedTerm);

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: AI_MAX_OUTPUT_TOKENS,
      system: prompt.system,
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: INTERPRETATION_JSON_SCHEMA,
        },
      },
      messages: [{ role: 'user', content: prompt.user }],
    });

    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
      return { interpretation: null, cached: false, model, error: response.stop_reason };
    }
    const text = response.content.find((block) => block.type === 'text');
    if (!text || text.type !== 'text') {
      return { interpretation: null, cached: false, model, error: 'no_text_output' };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text.text);
    } catch {
      return { interpretation: null, cached: false, model, error: 'unparseable_output' };
    }
    const interpretation = validateInterpretation(parsed);
    if (!interpretation) {
      return { interpretation: null, cached: false, model, error: 'invalid_output' };
    }

    const expiresAt = new Date(Date.now() + AI_CACHE_TTL_HOURS * 3600_000).toISOString();
    await db.from('ai_interpretations').upsert(
      {
        normalized_term: normalizedTerm,
        interpretation,
        model,
        confidence: interpretation.confidence,
        expires_at: expiresAt,
      },
      { onConflict: 'normalized_term' }
    );

    return {
      interpretation,
      cached: false,
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  } catch (error) {
    // Timeouts, rate limits, and API errors all fall back to deterministic
    // behavior — an AI failure must never fail the search.
    const message = error instanceof Error ? error.message : String(error);
    console.error('[product-search-assistant] anthropic call failed:', message);
    return { interpretation: null, cached: false, model, error: 'ai_unavailable' };
  }
}

async function handleSearch(req: Request, origin: string | null): Promise<Response> {
  const started = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // --- request validation ---------------------------------------------------
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Body must be JSON' }, origin);
  }
  const storeId = typeof body.store_id === 'string' ? body.store_id : '';
  const rawTerm = typeof body.term === 'string' ? body.term : '';
  const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 50);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId)) {
    return json(400, { error: 'store_id must be a UUID' }, origin);
  }
  const term = normalize(rawTerm).slice(0, MAX_TERM_LENGTH);
  if (term.length < 2) {
    return json(400, { error: 'term must be at least 2 characters' }, origin);
  }

  // --- store must exist and be active --------------------------------------
  const { data: storeRows, error: storeError } = await db.rpc('get_store', {
    p_store_id: storeId,
  });
  if (storeError) return json(502, { error: 'Store lookup failed' }, origin);
  const store: DbStoreRow | undefined = storeRows?.[0];
  if (!store) return json(404, { error: 'Store not found' }, origin);

  // --- live provider refresh (Kroger-family stores only) --------------------
  const identity = await getProviderIdentity(db, storeId);
  const providerSynced = await syncKrogerProducts(db, identity, term, limit);

  // --- deterministic pipeline ----------------------------------------------
  let outcome: SearchOutcome;
  try {
    outcome = await deterministicSearch(db, storeId, term, limit);
  } catch (error) {
    console.error('[product-search-assistant] deterministic search failed:', error);
    return json(502, { error: 'Search is temporarily unavailable' }, origin);
  }

  let searchMode: 'DETERMINISTIC' | 'AI_ASSISTED' | 'PROVIDER_ASSISTED' = providerSynced
    ? 'PROVIDER_ASSISTED'
    : 'DETERMINISTIC';
  let ai: AiStep | null = null;
  let clarification: string | undefined;

  // --- AI interpretation, only when deterministic search found nothing -----
  if (shouldUseAi(outcome.rows.length, term)) {
    ai = await interpretWithClaude(db, term);
    if (ai.interpretation) {
      const candidates = interpretationToCandidateTerms(ai.interpretation, term);
      // Give the live provider a shot at the AI's best terms too, so a
      // Kroger store can answer "food for my puppy" with real catalog data.
      for (const candidate of candidates.slice(0, 2)) {
        await syncKrogerProducts(db, identity, candidate, limit);
      }
      for (const candidate of candidates) {
        const { data } = await db.rpc('search_products', {
          p_store_id: storeId,
          p_term: candidate,
          p_limit: limit,
        });
        if (data && data.length > 0) {
          searchMode = 'AI_ASSISTED';
          outcome = {
            rows: data,
            matchedTier: 'AI',
            matchedTerm: candidate,
          };
          break;
        }
      }
      if (outcome.rows.length === 0 && ai.interpretation.clarificationNeeded) {
        clarification = ai.interpretation.clarificationQuestion;
      }
    }
  }

  // --- assemble trusted results (database rows only) ------------------------
  const seen = new Set<string>();
  const results = outcome.rows
    .filter((row) => (seen.has(row.product_id) ? false : (seen.add(row.product_id), true)))
    .map((row) => buildTrustedResult(store, row, { provider: 'supabase' }));

  // --- telemetry ------------------------------------------------------------
  const durationMs = Date.now() - started;
  await db.from('search_terms').insert({
    store_id: storeId,
    raw_term: rawTerm.slice(0, MAX_TERM_LENGTH),
    normalized_term: term,
    result_count: results.length,
    search_mode: searchMode,
    matched_tier: outcome.matchedTier,
    ai_model: ai?.model ?? null,
    ai_input_tokens: ai?.inputTokens ?? null,
    ai_output_tokens: ai?.outputTokens ?? null,
    duration_ms: durationMs,
  });

  return json(200, {
    results,
    search: {
      mode: searchMode,
      matched_tier: outcome.matchedTier,
      matched_term: outcome.matchedTerm,
      duration_ms: durationMs,
      ai: ai
        ? {
            used: Boolean(ai.interpretation),
            cached: ai.cached,
            error: ai.error ?? null,
          }
        : { used: false, cached: false, error: null },
      clarification: clarification ?? null,
    },
  }, origin);
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json(405, { error: 'POST only' }, origin);

  const clientKey =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (rateLimited(clientKey)) {
    return json(429, { error: 'Too many searches; slow down a moment.' }, origin);
  }

  // Duplicate-request suppression: identical concurrent searches share one
  // pipeline run.
  const bodyText = await req.text();
  const dedupeKey = `${clientKey}|${bodyText}`;
  const existing = inflight.get(dedupeKey);
  if (existing) {
    const response = await existing;
    return response.clone();
  }

  const promise = handleSearch(
    new Request(req.url, { method: 'POST', headers: req.headers, body: bodyText }),
    origin
  ).finally(() => inflight.delete(dedupeKey));
  inflight.set(dedupeKey, promise);
  const response = await promise;
  return response.clone();
});
