/**
 * Cache-through Kroger product sync, shared by the live search path
 * (product-search-assistant) and the scheduled freshness job
 * (refresh-popular-products). Official API rows are upserted through the
 * audited import pipeline (source RETAILER_API); nothing here fabricates
 * data — a sync failure simply leaves the database as it was.
 *
 * The db parameter is typed structurally so this file typechecks without
 * Deno-style imports.
 */

import { KrogerClient, KROGER_RETAILER_SLUGS, mapKrogerProduct } from './kroger.ts';

export interface SyncDbClient {
  from(table: string): {
    insert(values: Record<string, unknown>): {
      select(columns: string): {
        single(): Promise<{ data: { id: string } | null; error: { message: string } | null }>;
      };
    };
  };
  rpc(
    fn: string,
    params: Record<string, unknown>
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

export interface ProviderIdentity {
  retailerSlug: string | null;
  providerStoreId: string | null;
}

export async function syncKrogerTerm(
  db: SyncDbClient,
  kroger: KrogerClient | null,
  identity: ProviderIdentity,
  term: string,
  limit: number,
  createdBy = 'kroger-live'
): Promise<boolean> {
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

    const { data: job, error: jobError } = await db
      .from('import_jobs')
      .insert({
        source_kind: 'API_RESPONSE',
        file_name: `kroger:${identity.providerStoreId}:${term.slice(0, 40)}`,
        created_by: createdBy,
      })
      .select('id')
      .single();
    if (jobError || !job) return false;

    const { error } = await db.rpc('apply_catalog_import', {
      p_job_id: job.id,
      p_rows: rows,
      p_dry_run: false,
    });
    if (error) {
      console.error('[kroger-sync] upsert failed:', error.message);
      return false;
    }

    // Stamp responsive image variants + provenance, matched by identifier
    // only. Best-effort: an image failure never invalidates the catalog data.
    const imageRows = rows
      .filter((row) => row.product.image_url && (row.product.upc ?? row.product.gtin))
      .map((row) => ({
        upc: row.product.upc,
        gtin: row.product.gtin,
        image_url: row.product.image_url,
        thumbnail_url: row.product.thumbnail_url,
        medium_image_url: row.product.medium_image_url,
        large_image_url: row.product.large_image_url,
        image_source: row.product.image_source,
        image_source_type: row.product.image_source_type,
      }));
    if (imageRows.length > 0) {
      const { error: imageError } = await db.rpc('stamp_product_images', {
        p_rows: imageRows,
      });
      if (imageError) {
        console.warn('[kroger-sync] image stamp failed:', imageError.message);
      }
    }
    return true;
  } catch (error) {
    console.error(
      '[kroger-sync] search failed:',
      error instanceof Error ? error.message : error
    );
    return false;
  }
}
