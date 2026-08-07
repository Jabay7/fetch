/**
 * Coverage audit: store directory + product images.
 *
 *   node scripts/coverage-report.mjs           # human-readable
 *   node scripts/coverage-report.mjs --json    # machine-readable
 *
 * Reads the live database through the management API (SUPABASE_ACCESS_TOKEN
 * + SUPABASE_PROJECT_REF in .env). Reports only what is actually in the
 * database — no projections, no estimates.
 */

import { readFile } from 'node:fs/promises';

const asJson = process.argv.includes('--json');

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
    throw new Error(`query failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
  }
  return response.json();
}

const [storeCoverage] = await query(`
  select
    (select count(*) from retailers) as retailers,
    (select count(*) from retailers where integration_status in ('live','development')) as integrated_retailers,
    (select count(*) from stores where active) as stores,
    (select count(*) from stores s join store_capabilities c on c.store_id = s.id
      where s.active and c.product_search) as product_supported,
    (select count(*) from stores s join store_capabilities c on c.store_id = s.id
      where s.active and c.aisle_data) as aisle_supported,
    (select count(*) from stores s join store_capabilities c on c.store_id = s.id
      where s.active and c.inventory) as inventory_supported,
    (select count(*) from stores s join store_capabilities c on c.store_id = s.id
      where s.active and c.pricing) as pricing_supported,
    (select count(*) from stores where active and source = 'RETAILER_API') as official_api_stores,
    (select count(*) from stores where active and source = 'OSM') as directory_stores,
    (select count(*) from stores where active and source = 'STORE_MANAGED') as import_stores,
    (select count(*) from stores where active and source = 'COMMUNITY') as community_stores,
    (select count(*) from stores where active and source = 'SEED') as demo_stores
`);

const [productCoverage] = await query(`
  select
    (select count(*) from products) as products,
    (select count(*) from product_variants) as variants,
    (select count(*) from products where image_url is not null) as with_image,
    (select count(*) from products where image_verified) as verified_image,
    (select count(*) from products where image_url is null) as missing_image,
    (select count(*) from store_products where active) as store_products,
    (select count(*) from product_locations pl
      where pl.aisle_id is not null
        and pl.verification_status not in ('EXPIRED','DISPUTED')) as aisle_records,
    (select count(distinct image_url) from products where image_url is not null) as distinct_images
`);

const bySource = await query(`
  select coalesce(image_source_type, 'NONE') as source_type, count(*)::int as count
  from products group by 1 order by 2 desc
`);

const topRetailers = await query(`
  select r.name, r.integration_status, count(s.id)::int as stores
  from retailers r
  left join stores s on s.retailer_id = r.id and s.active
  group by r.name, r.integration_status
  having count(s.id) > 0
  order by count(s.id) desc
  limit 15
`);

const [searchAnalytics] = await query(`
  select
    (select count(*) from search_terms) as searches,
    (select count(*) from search_terms where result_count = 0) as no_result_searches,
    (select count(*) from search_terms where search_mode = 'AI_ASSISTED') as ai_assisted,
    (select count(*) from search_terms where search_mode = 'PROVIDER_ASSISTED') as provider_assisted,
    (select round(avg(duration_ms)) from search_terms) as avg_latency_ms,
    (select round(avg(duration_ms)) from search_terms where search_mode = 'DETERMINISTIC') as avg_deterministic_ms,
    (select round(avg(duration_ms)) from search_terms where search_mode = 'AI_ASSISTED') as avg_ai_ms
`);

const pct = (n, d) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : 'n/a');

const report = {
  generated_at: new Date().toISOString(),
  stores: {
    ...storeCoverage,
    directory_supported: storeCoverage.stores,
    aisle_coverage_pct: pct(storeCoverage.aisle_supported, storeCoverage.stores),
  },
  products: {
    ...productCoverage,
    image_coverage_pct: pct(productCoverage.with_image, productCoverage.products),
    verified_image_pct: pct(productCoverage.verified_image, productCoverage.products),
  },
  image_sources: bySource,
  retailers_with_stores: topRetailers,
  search: {
    ...searchAnalytics,
    no_result_rate: pct(searchAnalytics.no_result_searches, searchAnalytics.searches),
    ai_assist_rate: pct(searchAnalytics.ai_assisted, searchAnalytics.searches),
  },
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('=== STORE COVERAGE ===');
  console.log(`Retailers                 ${report.stores.retailers} (${report.stores.integrated_retailers} integrated)`);
  console.log(`Store locations           ${report.stores.stores}`);
  console.log(`  directory-supported     ${report.stores.directory_supported} (100% by definition)`);
  console.log(`  product-search          ${report.stores.product_supported}`);
  console.log(`  aisle data              ${report.stores.aisle_supported}  (${report.stores.aisle_coverage_pct})`);
  console.log(`  inventory               ${report.stores.inventory_supported}`);
  console.log(`  pricing                 ${report.stores.pricing_supported}`);
  console.log(`By source: official API ${report.stores.official_api_stores} · open directory ${report.stores.directory_stores} · imports ${report.stores.import_stores} · community ${report.stores.community_stores} · demo ${report.stores.demo_stores}`);

  console.log('\n=== PRODUCT COVERAGE ===');
  console.log(`Products                  ${report.products.products}`);
  console.log(`Variants                  ${report.products.variants}`);
  console.log(`Store-product records     ${report.products.store_products}`);
  console.log(`Verified aisle records    ${report.products.aisle_records}`);
  console.log(`With image                ${report.products.with_image}  (${report.products.image_coverage_pct})`);
  console.log(`  provider-verified       ${report.products.verified_image}  (${report.products.verified_image_pct})`);
  console.log(`Missing image (fallback)  ${report.products.missing_image}`);
  console.log(`Distinct image URLs       ${report.products.distinct_images}`);
  console.log('Image sources:');
  for (const row of report.image_sources) {
    console.log(`  ${String(row.source_type).padEnd(16)} ${row.count}`);
  }

  console.log('\n=== RETAILERS WITH STORES ===');
  for (const row of report.retailers_with_stores) {
    console.log(`  ${String(row.name).padEnd(24)} ${String(row.stores).padStart(5)}  ${row.integration_status}`);
  }

  console.log('\n=== SEARCH ANALYTICS (privacy-safe aggregates) ===');
  console.log(`Searches logged           ${report.search.searches}`);
  console.log(`No-result rate            ${report.search.no_result_rate}`);
  console.log(`AI-assisted rate          ${report.search.ai_assist_rate}`);
  console.log(`Provider-assisted         ${report.search.provider_assisted}`);
  console.log(`Avg latency               ${report.search.avg_latency_ms ?? 'n/a'} ms  (deterministic ${report.search.avg_deterministic_ms ?? 'n/a'} ms · AI ${report.search.avg_ai_ms ?? 'n/a'} ms)`);
}
