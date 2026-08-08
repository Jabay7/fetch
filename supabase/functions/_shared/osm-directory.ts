/**
 * OpenStreetMap store-directory ingestion: brand registry, Overpass query
 * construction, and element → directory-row mapping.
 *
 * License: OSM data is ODbL. Every imported row carries
 * source='OSM', a stable source id, a source URL, and the attribution
 * string "© OpenStreetMap contributors"; the app surfaces attribution in
 * Settings → About. Directory entries carry MEDIUM confidence and light up
 * as directory-only stores (no product data is ever fabricated for them).
 *
 * Pure TypeScript — used by scripts/import-stores-osm.mjs (Node strips
 * types natively) and testable under Jest.
 */

export interface OsmBrand {
  /** Our retailer slug (must exist in the retailers matrix). */
  slug: string;
  /** Canonical display name. */
  name: string;
  /** Wikidata QID used by OSM's brand tagging, when well-established. */
  wikidata?: string;
  /** Exact `brand` tag spellings to match as a fallback. */
  brandNames: string[];
}

/**
 * Brands to import. Kroger-family banners are deliberately absent — their
 * stores come from the official Kroger API, a better source (the directory
 * import also address-dedupes against them as a second guard).
 */
export const OSM_BRANDS: OsmBrand[] = [
  { slug: 'walmart', name: 'Walmart', wikidata: 'Q483551', brandNames: ['Walmart', 'Walmart Supercenter', 'Walmart Neighborhood Market'] },
  { slug: 'target', name: 'Target', wikidata: 'Q1046951', brandNames: ['Target'] },
  { slug: 'costco', name: 'Costco', wikidata: 'Q715583', brandNames: ['Costco', 'Costco Wholesale'] },
  { slug: 'sams-club', name: "Sam's Club", wikidata: 'Q1972120', brandNames: ["Sam's Club"] },
  { slug: 'walgreens', name: 'Walgreens', wikidata: 'Q1591889', brandNames: ['Walgreens'] },
  { slug: 'cvs', name: 'CVS', wikidata: 'Q2078880', brandNames: ['CVS Pharmacy', 'CVS'] },
  { slug: 'rite-aid', name: 'Rite Aid', wikidata: 'Q3433273', brandNames: ['Rite Aid'] },
  { slug: 'home-depot', name: 'Home Depot', wikidata: 'Q864407', brandNames: ['The Home Depot', 'Home Depot'] },
  { slug: 'lowes', name: "Lowe's", wikidata: 'Q1373493', brandNames: ["Lowe's"] },
  { slug: 'menards', name: 'Menards', wikidata: 'Q1639897', brandNames: ['Menards'] },
  { slug: 'ace-hardware', name: 'Ace Hardware', wikidata: 'Q4672981', brandNames: ['Ace Hardware'] },
  { slug: 'true-value', name: 'True Value', wikidata: 'Q7847545', brandNames: ['True Value'] },
  { slug: 'best-buy', name: 'Best Buy', wikidata: 'Q533415', brandNames: ['Best Buy'] },
  { slug: 'petsmart', name: 'PetSmart', wikidata: 'Q3307147', brandNames: ['PetSmart'] },
  { slug: 'petco', name: 'Petco', wikidata: 'Q7171541', brandNames: ['Petco'] },
  { slug: 'staples', name: 'Staples', wikidata: 'Q785943', brandNames: ['Staples'] },
  { slug: 'office-depot', name: 'Office Depot', wikidata: 'Q1337797', brandNames: ['Office Depot', 'OfficeMax'] },
  { slug: 'meijer', name: 'Meijer', wikidata: 'Q1917753', brandNames: ['Meijer'] },
  { slug: 'aldi', name: 'Aldi', wikidata: 'Q125054', brandNames: ['ALDI', 'Aldi'] },
  { slug: 'whole-foods', name: 'Whole Foods Market', wikidata: 'Q1809448', brandNames: ['Whole Foods Market'] },
  { slug: 'trader-joes', name: "Trader Joe's", wikidata: 'Q688825', brandNames: ["Trader Joe's"] },
  { slug: 'publix', name: 'Publix', wikidata: 'Q672170', brandNames: ['Publix'] },
  { slug: 'heb', name: 'H-E-B', wikidata: 'Q830621', brandNames: ['H-E-B'] },
  { slug: 'wegmans', name: 'Wegmans', wikidata: 'Q11288478', brandNames: ['Wegmans'] },
  { slug: 'food-lion', name: 'Food Lion', wikidata: 'Q1435950', brandNames: ['Food Lion'] },
  // NOT the bare "Giant": that brand tag belongs to the bicycle manufacturer
  // and an unrelated fuel chain, which is how bike shops in Nevada and
  // Arizona ended up in the directory as grocery stores.
  { slug: 'giant-food', name: 'Giant Food', wikidata: 'Q5558332', brandNames: ['Giant Food'] },
  { slug: 'stop-and-shop', name: 'Stop & Shop', wikidata: 'Q3658429', brandNames: ['Stop & Shop'] },
  { slug: 'piggly-wiggly', name: 'Piggly Wiggly', wikidata: 'Q3388303', brandNames: ['Piggly Wiggly'] },
  { slug: 'hy-vee', name: 'Hy-Vee', wikidata: 'Q1639719', brandNames: ['Hy-Vee'] },
  { slug: 'sprouts', name: 'Sprouts Farmers Market', wikidata: 'Q7581369', brandNames: ['Sprouts Farmers Market'] },
  { slug: 'fresh-thyme', name: 'Fresh Thyme', wikidata: 'Q64132791', brandNames: ['Fresh Thyme'] },
  { slug: 'jewel-osco', name: 'Jewel-Osco', wikidata: 'Q3178470', brandNames: ['Jewel-Osco'] },
  { slug: 'albertsons', name: 'Albertsons', wikidata: 'Q4712282', brandNames: ['Albertsons'] },
  { slug: 'safeway', name: 'Safeway', wikidata: 'Q1508234', brandNames: ['Safeway'] },
  { slug: 'vons', name: 'Vons', wikidata: 'Q7941609', brandNames: ['Vons'] },
  { slug: 'acme-markets', name: 'ACME Markets', brandNames: ['ACME Markets', 'ACME'] },
  { slug: 'ulta', name: 'Ulta Beauty', wikidata: 'Q7880076', brandNames: ['Ulta Beauty'] },
  { slug: 'sephora', name: 'Sephora', wikidata: 'Q2408041', brandNames: ['Sephora'] },
  { slug: 'autozone', name: 'AutoZone', wikidata: 'Q4826087', brandNames: ['AutoZone'] },
  { slug: 'oreilly', name: "O'Reilly Auto Parts", brandNames: ["O'Reilly Auto Parts"] },
  { slug: 'advance-auto', name: 'Advance Auto Parts', wikidata: 'Q4686051', brandNames: ['Advance Auto Parts'] },
  { slug: 'napa', name: 'NAPA Auto Parts', brandNames: ['NAPA Auto Parts'] },
  { slug: 'dicks', name: "Dick's Sporting Goods", wikidata: 'Q5272749', brandNames: ["Dick's Sporting Goods"] },
  { slug: 'academy', name: 'Academy Sports + Outdoors', brandNames: ['Academy Sports + Outdoors'] },
  { slug: 'harris-teeter', name: 'Harris Teeter', wikidata: 'Q5665067', brandNames: ['Harris Teeter'] },
];

/** Overpass QL: all US elements for one brand (wikidata id + name spellings). */
export function buildOverpassQuery(brand: OsmBrand, timeoutSeconds = 180): string {
  const clauses: string[] = [];
  if (brand.wikidata) {
    clauses.push(`nwr["brand:wikidata"="${brand.wikidata}"]["name"](area.us);`);
  }
  for (const name of brand.brandNames) {
    const escaped = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    clauses.push(`nwr["brand"="${escaped}"]["shop"](area.us);`);
    clauses.push(`nwr["brand"="${escaped}"]["amenity"](area.us);`);
  }
  return (
    `[out:json][timeout:${timeoutSeconds}];` +
    `area["ISO3166-1"="US"][admin_level=2]->.us;` +
    `(${clauses.join('')});` +
    `out center tags;`
  );
}

/**
 * Minimal query for the largest brands.
 *
 * The full query fans out to seven nationwide clauses. For a retailer the size
 * of Walmart that is heavy enough that Overpass gives up and returns an empty
 * 200 rather than an error — the import then reports "0 elements" and moves on,
 * silently missing ~4,600 stores.
 *
 * The `brand:wikidata` tag is a single authoritative matcher and, measured
 * against the live API, actually yields more elements for Walmart than all the
 * brand-name clauses combined (5,969 vs 4,965). Used as a retry whenever the
 * full query comes back empty.
 */
export function buildOverpassFallbackQuery(
  brand: OsmBrand,
  timeoutSeconds = 300
): string | null {
  if (!brand.wikidata) return null;
  return (
    `[out:json][timeout:${timeoutSeconds}];` +
    `area["ISO3166-1"="US"][admin_level=2]->.us;` +
    `(nwr["brand:wikidata"="${brand.wikidata}"]["name"](area.us););` +
    `out center tags;`
  );
}

// --- ZIP prefix → state (USPS 3-digit prefix ranges) ------------------------

const ZIP_RANGES: [number, number, string][] = [
  [5, 5, 'NY'], [6, 9, 'PR'], [10, 27, 'MA'], [28, 29, 'RI'], [30, 38, 'NH'],
  [39, 49, 'ME'], [50, 59, 'VT'], [60, 69, 'CT'], [70, 89, 'NJ'],
  [100, 149, 'NY'], [150, 196, 'PA'], [197, 199, 'DE'], [200, 205, 'DC'],
  [206, 219, 'MD'], [220, 246, 'VA'], [247, 268, 'WV'], [270, 289, 'NC'],
  [290, 299, 'SC'], [300, 319, 'GA'], [320, 349, 'FL'], [350, 369, 'AL'],
  [370, 385, 'TN'], [386, 397, 'MS'], [398, 399, 'GA'], [400, 427, 'KY'],
  [430, 459, 'OH'], [460, 479, 'IN'], [480, 499, 'MI'], [500, 528, 'IA'],
  [530, 549, 'WI'], [550, 567, 'MN'], [570, 577, 'SD'], [580, 588, 'ND'],
  [590, 599, 'MT'], [600, 629, 'IL'], [630, 658, 'MO'], [660, 679, 'KS'],
  [680, 693, 'NE'], [700, 714, 'LA'], [716, 729, 'AR'], [730, 749, 'OK'],
  [750, 799, 'TX'], [800, 816, 'CO'], [820, 831, 'WY'], [832, 838, 'ID'],
  [840, 847, 'UT'], [850, 865, 'AZ'], [870, 884, 'NM'], [885, 885, 'TX'],
  [889, 898, 'NV'], [900, 961, 'CA'], [967, 968, 'HI'], [970, 979, 'OR'],
  [980, 994, 'WA'], [995, 999, 'AK'],
];

export function zipToState(zip: string): string | null {
  const match = zip.trim().match(/^(\d{5})/);
  if (!match) return null;
  const prefix = parseInt(match[1].slice(0, 3), 10);
  for (const [lo, hi, state] of ZIP_RANGES) {
    if (prefix >= lo && prefix <= hi) return state;
  }
  return null;
}

// --- element mapping --------------------------------------------------------

export interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface DirectoryRow {
  retailer_slug: string;
  name: string;
  /** The provider's raw name tag, used to grade brand consistency. */
  source_name: string | null;
  chain: string;
  address_line: string;
  city: string;
  state: string;
  zip: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  source: 'OSM';
  source_id: string;
  source_url: string;
  source_attribution: string;
  data_confidence: 'MEDIUM';
}

const clean = (v: string | undefined) =>
  v?.trim().replace(/\s+/g, ' ') || undefined;

/**
 * OSM element → directory row. Requires enough address to be useful
 * (street + ZIP + city); state derives from the ZIP so partial tagging
 * still imports. Returns null for elements below that bar — a directory
 * entry with no usable address helps no one.
 */
export function mapOsmElement(element: OsmElement, brand: OsmBrand): DirectoryRow | null {
  const tags = element.tags ?? {};
  const street = clean(tags['addr:street']);
  const houseNumber = clean(tags['addr:housenumber']);
  const city = clean(tags['addr:city']);
  const zipRaw = clean(tags['addr:postcode']);
  if (!street || !city || !zipRaw) return null;
  const zipMatch = zipRaw.match(/^\d{5}/);
  if (!zipMatch) return null;
  const zip = zipMatch[0];
  const state = clean(tags['addr:state'])?.toUpperCase() ?? zipToState(zip);
  if (!state || state.length !== 2) return null;

  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;

  const branch = clean(tags.branch);
  const baseName = clean(tags.name) ?? brand.name;
  const name = branch && !baseName.toLowerCase().includes(branch.toLowerCase())
    ? `${brand.name} — ${branch}`
    : baseName;

  return {
    retailer_slug: brand.slug,
    name,
    // The provider's own name, kept separately from the display name above.
    // Ingestion grades brand consistency against THIS, because the display
    // name is partly synthesized from our brand and would otherwise launder a
    // mis-tagged POI straight past the check.
    source_name: clean(tags.name) ?? null,
    chain: brand.name,
    address_line: houseNumber ? `${houseNumber} ${street}` : street,
    city,
    state,
    zip,
    latitude: lat,
    longitude: lon,
    phone: clean(tags.phone ?? tags['contact:phone']),
    source: 'OSM',
    source_id: `${element.type}/${element.id}`,
    source_url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    source_attribution: '© OpenStreetMap contributors (ODbL)',
    data_confidence: 'MEDIUM',
  };
}

/** Map + dedupe (union queries can return an element twice). */
export function mapOsmElements(elements: OsmElement[], brand: OsmBrand): DirectoryRow[] {
  const seen = new Set<string>();
  const rows: DirectoryRow[] = [];
  for (const element of elements) {
    const row = mapOsmElement(element, brand);
    if (!row || seen.has(row.source_id)) continue;
    seen.add(row.source_id);
    rows.push(row);
  }
  return rows;
}
