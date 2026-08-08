# Overture Maps Places

Verified against release `2026-07-22.0`, schema `v1.18.0`.

## What we use it for, and what we don't

**We do not bulk-import stores from Overture.** It holds ~74M places, and a
naive run would add tens of thousands more directory-only records. The
directory already carries 39,986 stores nobody can search; another 40,000
would make the product worse, not better. Coverage beats count.

What Overture offers that nothing else does is **closure detection**.
OpenStreetMap — our directory backbone — has no reliable "this shut down"
signal, so a closed store simply lingers as a listing forever. Overture
publishes `operating_status`, and in the Chicago bounding box alone it flags
747 permanently-closed shopping places.

That directly serves the product's core promise: never send a shopper to a
store that isn't there.

```bash
npm run overture:audit                 # dry run, national
npm run overture:audit -- --state IL   # one state
npm run overture:audit -- --apply      # record the findings
```

## How a match is decided

A closure is only recorded when **both** hold:

1. **Name relationship** — exact, containment either way, or the retailer's
   name appearing in the Overture name.
2. **Proximity ≤ 120 m.**

Either signal alone produces false positives: chains repeat names across a
city, and unrelated shops share a strip mall. Overture rows below
`confidence >= 0.6` are ignored entirely.

Matches are recorded as `lifecycle = 'PERMANENTLY_CLOSED'` with a
`review_reason`, never deleted — so a wrong match is reversible and a
reopening can be handled.

Illinois, first run: 10 matches at 6–51 m with confidence 0.95–1.00
(Walmart Supercenter ×2, Advance Auto Parts ×5, CVS, True Value, Best Buy).

## Schema constraints that matter

- **Build against `taxonomy`, never `categories`.** The latter is deprecated
  and **removed in the September 2026 release**. Note `taxonomy.alternates` is
  plural where the old `categories.alternate` was singular.
- **`operating_status` is ~92.8% NULL.** NULL does not mean open. Filter
  positively for `'permanently_closed'`; never infer "open" from absence.
- **The documented 0.2 confidence floor is not enforced upstream** — roughly
  3.5% of rows sit below it. Apply your own floor.
- **`addresses[].region` holds bare state codes** (`IL`), not the ISO
  `US-IL` its own schema specifies.
- **Places geometry is always a Point**, so `bbox.xmin` / `bbox.ymin` carry the
  coordinate and the spatial extension is unnecessary.
- **Never hard-code a release.** Discover it from the STAC catalog at
  `https://stac.overturemaps.org/catalog.json` (`latest`). Expect one-time GERS
  id churn across the 2026-06 → 2026-07 boundary; that release re-matched the
  whole corpus.

## Licensing

Places is **CDLA-Permissive-2.0 / Apache-2.0** and contains **no OpenStreetMap
data**, so it carries none of ODbL's share-alike obligations — unlike our OSM
rows.

Two consequences we honour:

1. **Provenance stays per row.** Overture and OSM lineage are never merged.
   Joining CDLA data to OSM can pull ODbL onto a derivative database.
2. **No bulk export endpoint.** ODbL §4.4/§4.6 would be triggered by shipping
   a public dump; serving per-query results is a Produced Work needing only
   attribution.

Attribution shown in-app:

> Places data from Overture Maps Foundation (overturemaps.org),
> CDLA-Permissive-2.0 / Apache-2.0.

## Access

No credentials. DuckDB reads the public S3 parquet directly over HTTPS:

```sql
INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';
SELECT … FROM read_parquet(
  's3://overturemaps-us-west-2/release/<RELEASE>/theme=places/type=place/*.parquet'
) WHERE bbox.xmin BETWEEN … AND list_contains(taxonomy.hierarchy,'shopping')
```

Row-group pruning on `bbox` keeps a metro-scale query around 9 seconds against
the full 11.25 GB corpus. `@duckdb/node-api` is a dev-only dependency; nothing
Overture-related ships in the app bundle.
