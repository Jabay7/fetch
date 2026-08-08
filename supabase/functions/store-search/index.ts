// store-search Edge Function (Deno).
// Deploy: supabase functions deploy store-search
// Secrets (optional): KROGER_CLIENT_ID, KROGER_CLIENT_SECRET
//
// POST { term?: string }
//
// Merges the database store directory with live Kroger-family store
// discovery: when the query is a US ZIP and Kroger credentials are
// configured, nearby real stores (Kroger, Mariano's, …) are fetched from the
// official Locations API, upserted into `stores` with full capability flags,
// and returned through the same search_stores RPC as everything else. No
// credentials → database-only, unchanged behavior.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  isZipQuery,
  KrogerClient,
  mapKrogerLocation,
  KROGER_RETAILER_SLUGS,
} from '../_shared/kroger.ts';

const ALLOWED_ORIGINS = new Set([
  'https://jabay7.github.io',
  'https://fetchnfind.app',
  'https://www.fetchnfind.app',
  'http://localhost:8081',
  'http://localhost:19006',
]);

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

let krogerClient: KrogerClient | null | undefined;

function getKroger(): KrogerClient | null {
  if (krogerClient !== undefined) return krogerClient;
  const clientId = Deno.env.get('KROGER_CLIENT_ID');
  const clientSecret = Deno.env.get('KROGER_CLIENT_SECRET');
  krogerClient = clientId && clientSecret ? new KrogerClient({ clientId, clientSecret }, { baseUrl: Deno.env.get('KROGER_API_BASE') ?? undefined }) : null;
  return krogerClient;
}

async function upsertKrogerStores(db: SupabaseClient, zip: string): Promise<string[]> {
  const kroger = getKroger();
  if (!kroger) return [];

  const locations = await kroger.locationsByZip(zip, 10);
  if (locations.length === 0) return [];

  const { data: retailers } = await db
    .from('retailers')
    .select('id, slug')
    .in('slug', KROGER_RETAILER_SLUGS);
  const retailerBySlug = new Map((retailers ?? []).map((r) => [r.slug, r.id]));

  const storeIds: string[] = [];
  for (const location of locations) {
    const mapped = mapKrogerLocation(location);
    if (!mapped) continue;
    const retailerId = retailerBySlug.get(mapped.retailer_slug);
    if (!retailerId) continue;

    const { data: existing } = await db
      .from('stores')
      .select('id')
      .eq('retailer_id', retailerId)
      .eq('provider_store_id', mapped.provider_store_id)
      .maybeSingle();

    let storeId = existing?.id;
    if (existing?.id) {
      // Keep the display fields fresh (also repairs earlier raw names).
      await db
        .from('stores')
        .update({ name: mapped.name, city: mapped.city, zip: mapped.zip })
        .eq('id', existing.id);
    }
    if (!storeId) {
      const { data: inserted, error } = await db
        .from('stores')
        .insert({
          retailer_id: retailerId,
          provider_store_id: mapped.provider_store_id,
          store_number: mapped.store_number,
          name: mapped.name,
          chain: mapped.retailer_slug === 'marianos' ? "Mariano's" : 'Kroger',
          address_line: mapped.address_line,
          city: mapped.city,
          state: mapped.state,
          zip: mapped.zip,
          phone: mapped.phone ?? null,
          latitude: mapped.latitude ?? null,
          longitude: mapped.longitude ?? null,
          active: true,
        })
        .select('id')
        .single();
      if (error) {
        console.error('[store-search] store insert failed:', error.message);
        continue;
      }
      storeId = inserted.id;
    }

    // Capability profile of the Kroger Products API: aisles, stock, prices,
    // images — per docs/RETAILER-INTEGRATIONS.md.
    await db.from('store_capabilities').upsert(
      {
        store_id: storeId,
        aisle_data: true,
        inventory: true,
        pricing: true,
        product_images: true,
        store_map: false,
        realtime: false,
        product_search: true,
        department_data: true,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'store_id' }
    );
    storeIds.push(storeId);
  }

  if (storeIds.length > 0) {
    // The integration is demonstrably live now — reflect that honestly.
    await db
      .from('retailers')
      .update({ integration_status: 'live' })
      .in('slug', KROGER_RETAILER_SLUGS)
      .neq('integration_status', 'live');
  }
  return storeIds;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json(405, { error: 'POST only' }, origin);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const term = typeof body.term === 'string' ? body.term.trim().slice(0, 80) : '';

  // Geographic mode: nearest stores to a coordinate, distance included.
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
    const { data, error } = await db.rpc('search_stores_near', {
      p_lat: lat,
      p_lon: lon,
      p_radius_miles: Math.min(Math.max(Number(body.radius) || 30, 1), 100),
    });
    if (error) return json(502, { error: 'Nearby search failed' }, origin);
    return json(200, { stores: data ?? [], discovered: 0 }, origin);
  }

  // Live discovery first (so the merged directory below includes new stores).
  let discoveredIds: string[] = [];
  if (isZipQuery(term)) {
    try {
      discoveredIds = await upsertKrogerStores(db, term.trim());
    } catch (error) {
      // Provider failure must not break store search.
      console.error(
        '[store-search] kroger discovery failed:',
        error instanceof Error ? error.message : error
      );
    }
  }

  const { data, error } = await db.rpc('search_stores', { p_term: term });
  if (error) return json(502, { error: 'Store search failed' }, origin);
  let stores = (data ?? []) as { id: string }[];

  // Discovered stores are *near* the searched ZIP but usually carry their
  // own ZIP codes, so the text match above misses them — merge explicitly,
  // nearest (Kroger's ordering) first.
  if (discoveredIds.length > 0) {
    const { data: all } = await db.rpc('search_stores', { p_term: '' });
    const byId = new Map(((all ?? []) as { id: string }[]).map((s) => [s.id, s]));
    const merged = new Map<string, { id: string }>();
    for (const id of discoveredIds) {
      const store = byId.get(id);
      if (store) merged.set(id, store);
    }
    for (const store of stores) merged.set(store.id, store);
    stores = [...merged.values()];
  }

  return json(200, { stores, discovered: discoveredIds.length }, origin);
});
