/**
 * Catalog import core: parsing, column mapping, validation, normalization,
 * and duplicate detection for CSV/JSON catalog imports.
 *
 * Pure TypeScript with no Deno/Node/browser APIs so the same code runs in
 * the catalog-import Edge Function and under Jest. The transactional half
 * (store matching, upserts, audit, revert) is SQL: apply_catalog_import in
 * supabase/migrations/20260806000005_import_pipeline.sql.
 */

export type ImportSource = 'RETAILER_API' | 'AUTHORIZED_FEED' | 'STORE_MANAGED';

export interface NormalizedImportRow {
  retailer_slug: string;
  store_number?: string;
  provider_store_id?: string;
  store_name?: string;
  product: {
    name: string;
    brand?: string;
    category?: string;
    size?: string;
    description?: string;
    upc?: string;
    gtin?: string;
    ean?: string;
    image_url?: string;
  };
  variant?: {
    name: string;
    size?: string;
    color?: string;
    flavor?: string;
    pack_count?: number;
    upc?: string;
    gtin?: string;
  };
  retailer_sku?: string;
  provider_product_id?: string;
  location?: {
    department?: string;
    aisle?: string;
    bay?: string;
    shelf?: string;
    section?: string;
    display_location?: string;
  };
  inventory_status?: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN';
  price?: { regular_cents: number; sale_cents?: number; currency: string };
  source: ImportSource;
  source_provider?: string;
  updated_at?: string;
}

export interface ImportRowError {
  /** 1-based data-row number (header excluded for CSV). */
  row: number;
  code:
    | 'MISSING_RETAILER'
    | 'MISSING_STORE'
    | 'MISSING_PRODUCT_NAME'
    | 'INVALID_UPC'
    | 'INVALID_GTIN'
    | 'INVALID_EAN'
    | 'INVALID_PRICE'
    | 'INVALID_STATUS'
    | 'INVALID_SOURCE'
    | 'DUPLICATE_ROW'
    | 'MALFORMED_ROW';
  message: string;
}

export interface ImportParseResult {
  rows: NormalizedImportRow[];
  errors: ImportRowError[];
  stats: {
    total_rows: number;
    valid_rows: number;
    invalid_rows: number;
    duplicate_rows: number;
    rows_without_location: number;
  };
}

/** Canonical import columns and the header spellings we accept for each. */
const COLUMN_ALIASES: Record<string, string[]> = {
  retailer: ['retailer', 'retailer_slug', 'chain'],
  store_number: ['store_number', 'store_no', 'store_id', 'store #', 'store num'],
  provider_store_id: ['provider_store_id'],
  store_name: ['store_name', 'store', 'location_name'],
  store_address: ['store_address', 'address'],
  product_name: ['product_name', 'product', 'name', 'item', 'item_name', 'description of item'],
  brand: ['brand', 'manufacturer'],
  category: ['category', 'product_category'],
  variant: ['variant', 'variant_name'],
  size: ['size', 'size_text', 'package_size'],
  pack_count: ['pack_count', 'pack', 'count'],
  upc: ['upc', 'upc_a', 'upc-a', 'barcode'],
  gtin: ['gtin', 'gtin14', 'gtin-14'],
  ean: ['ean', 'ean13', 'ean-13'],
  retailer_sku: ['retailer_sku', 'sku'],
  provider_product_id: ['provider_product_id', 'product_id'],
  department: ['department', 'dept'],
  aisle: ['aisle', 'aisle_number', 'aisle #'],
  bay: ['bay'],
  shelf: ['shelf'],
  section: ['section'],
  display_location: ['display_location', 'location_text'],
  inventory_status: ['inventory_status', 'availability', 'stock_status', 'stock'],
  inventory_quantity: ['inventory_quantity', 'quantity', 'qty', 'on_hand'],
  price: ['price', 'regular_price', 'price_usd'],
  sale_price: ['sale_price', 'promo_price'],
  currency: ['currency'],
  image_url: ['image_url', 'image'],
  description: ['product_description', 'long_description'],
  source: ['source', 'source_type', 'data_source'],
  source_provider: ['source_provider', 'provider'],
  updated_at: ['updated_at', 'as_of', 'last_updated'],
};

const HEADER_LOOKUP: Map<string, string> = new Map();
for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
  for (const alias of aliases) HEADER_LOOKUP.set(alias, canonical);
}

function normalizeHeader(raw: string): string | null {
  const key = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  return HEADER_LOOKUP.get(key) ?? HEADER_LOOKUP.get(key.replace(/ /g, '_')) ?? null;
}

/** RFC 4180-style CSV parser: quoted fields, doubled quotes, CR/LF/CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-empty trailing lines.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const clean = (value: unknown): string | undefined => {
  if (value == null) return undefined;
  const s = String(value).trim().replace(/\s+/g, ' ');
  return s === '' ? undefined : s;
};

/** GS1 mod-10 check digit over an all-numeric code (UPC-A/EAN/GTIN). */
export function hasValidCheckDigit(code: string): boolean {
  if (!/^\d+$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop() as number;
  let sum = 0;
  // Weights 3/1 alternating from the rightmost payload digit.
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = 4 - w) {
    sum += digits[i] * w;
  }
  return (10 - (sum % 10)) % 10 === check;
}

export function isValidUpc(code: string): boolean {
  return /^\d{12}$/.test(code) && hasValidCheckDigit(code);
}

export function isValidGtin(code: string): boolean {
  return /^\d{8}$|^\d{12,14}$/.test(code) && hasValidCheckDigit(code);
}

export function isValidEan(code: string): boolean {
  return /^\d{13}$/.test(code) && hasValidCheckDigit(code);
}

/**
 * Identifier normalization: strip spaces/dashes. 13-digit codes with a
 * leading zero are UPC-A packed as EAN-13 — unpack them so identity
 * matching is stable across feeds.
 */
export function normalizeIdentifier(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const code = raw.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(code)) return code;
  if (code.length === 13 && code.startsWith('0')) return code.slice(1);
  return code;
}

const STATUS_MAP: Record<string, NormalizedImportRow['inventory_status']> = {
  in_stock: 'IN_STOCK',
  'in stock': 'IN_STOCK',
  instock: 'IN_STOCK',
  available: 'IN_STOCK',
  yes: 'IN_STOCK',
  high: 'IN_STOCK',
  low_stock: 'LOW_STOCK',
  'low stock': 'LOW_STOCK',
  low: 'LOW_STOCK',
  limited: 'LOW_STOCK',
  out_of_stock: 'OUT_OF_STOCK',
  'out of stock': 'OUT_OF_STOCK',
  oos: 'OUT_OF_STOCK',
  no: 'OUT_OF_STOCK',
  unavailable: 'OUT_OF_STOCK',
  unknown: 'UNKNOWN',
  '': 'UNKNOWN',
};

const SOURCE_MAP: Record<string, ImportSource> = {
  retailer_api: 'RETAILER_API',
  official_retailer_api: 'RETAILER_API',
  authorized_feed: 'AUTHORIZED_FEED',
  partner_feed: 'AUTHORIZED_FEED',
  feed: 'AUTHORIZED_FEED',
  store_managed: 'STORE_MANAGED',
  store_import: 'STORE_MANAGED',
  store: 'STORE_MANAGED',
  csv: 'STORE_MANAGED',
  '': 'STORE_MANAGED',
};

/** "$4.49", "4.49", "449¢"-style money → integer cents; null on nonsense. */
export function parsePriceCents(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Normalize one record (CSV row already mapped to canonical keys, or a JSON
 * object). Returns the normalized row or a row error.
 */
export function normalizeRecord(
  record: Record<string, unknown>,
  rowNumber: number
): { row: NormalizedImportRow } | { error: ImportRowError } {
  const err = (code: ImportRowError['code'], message: string) => ({
    error: { row: rowNumber, code, message },
  });

  const retailer = clean(record.retailer);
  if (!retailer) return err('MISSING_RETAILER', 'retailer is required');

  const storeNumber = clean(record.store_number);
  const providerStoreId = clean(record.provider_store_id);
  const storeName = clean(record.store_name);
  if (!storeNumber && !providerStoreId && !storeName) {
    return err('MISSING_STORE', 'one of store_number, provider_store_id, or store_name is required');
  }

  const productName = clean(record.product_name);
  if (!productName) return err('MISSING_PRODUCT_NAME', 'product_name is required');

  const upc = normalizeIdentifier(clean(record.upc));
  if (upc && !isValidUpc(upc)) {
    return err('INVALID_UPC', `"${upc}" is not a valid UPC-A (12 digits + check digit)`);
  }
  const gtin = normalizeIdentifier(clean(record.gtin));
  if (gtin && !isValidGtin(gtin)) {
    return err('INVALID_GTIN', `"${gtin}" is not a valid GTIN`);
  }
  const ean = clean(record.ean)?.replace(/[\s-]/g, '');
  if (ean && !isValidEan(ean)) {
    return err('INVALID_EAN', `"${ean}" is not a valid EAN-13`);
  }

  const statusRaw = clean(record.inventory_status)?.toLowerCase() ?? '';
  const status = STATUS_MAP[statusRaw];
  if (status === undefined && statusRaw !== '') {
    return err('INVALID_STATUS', `unrecognized inventory_status "${record.inventory_status}"`);
  }

  const sourceRaw = clean(record.source)?.toLowerCase() ?? '';
  const source = SOURCE_MAP[sourceRaw];
  if (source === undefined) {
    return err('INVALID_SOURCE', `unrecognized source "${record.source}" (expected retailer_api, authorized_feed, or store_managed)`);
  }

  let price: NormalizedImportRow['price'];
  const priceRaw = clean(record.price);
  if (priceRaw) {
    const cents = parsePriceCents(priceRaw);
    if (cents == null) return err('INVALID_PRICE', `unparseable price "${priceRaw}"`);
    const saleRaw = clean(record.sale_price);
    const saleCents = saleRaw ? parsePriceCents(saleRaw) : undefined;
    if (saleRaw && saleCents == null) {
      return err('INVALID_PRICE', `unparseable sale_price "${saleRaw}"`);
    }
    price = {
      regular_cents: cents,
      sale_cents: saleCents ?? undefined,
      currency: clean(record.currency) ?? 'USD',
    };
  }

  const location: NormalizedImportRow['location'] = {
    department: clean(record.department),
    aisle: clean(record.aisle),
    bay: clean(record.bay),
    shelf: clean(record.shelf),
    section: clean(record.section),
    display_location: clean(record.display_location),
  };
  const hasLocation = Object.values(location).some((v) => v !== undefined);

  const variantName = clean(record.variant);
  const packRaw = clean(record.pack_count);
  const packCount = packRaw && /^\d+$/.test(packRaw) ? parseInt(packRaw, 10) : undefined;

  const row: NormalizedImportRow = {
    retailer_slug: slugify(retailer),
    store_number: storeNumber,
    provider_store_id: providerStoreId,
    store_name: storeName,
    product: {
      name: productName,
      brand: clean(record.brand),
      category: clean(record.category),
      size: clean(record.size),
      description: clean(record.description),
      upc,
      gtin,
      ean,
      image_url: clean(record.image_url),
    },
    variant: variantName
      ? { name: variantName, size: clean(record.size), pack_count: packCount }
      : undefined,
    retailer_sku: clean(record.retailer_sku),
    provider_product_id: clean(record.provider_product_id),
    location: hasLocation ? location : undefined,
    inventory_status: statusRaw === '' ? undefined : status,
    price,
    source,
    source_provider: clean(record.source_provider),
    updated_at: clean(record.updated_at),
  };
  return { row };
}

function dedupeKey(row: NormalizedImportRow): string {
  const store = row.store_number ?? row.provider_store_id ?? row.store_name ?? '';
  const product =
    row.product.upc ??
    row.product.gtin ??
    row.product.ean ??
    `${(row.product.brand ?? '').toLowerCase()}~${row.product.name.toLowerCase()}`;
  return `${row.retailer_slug}|${store.toLowerCase()}|${product}`;
}

function finalize(
  rows: NormalizedImportRow[],
  errors: ImportRowError[],
  totalRows: number
): ImportParseResult {
  const seen = new Set<string>();
  const unique: NormalizedImportRow[] = [];
  let duplicates = 0;
  for (const [i, row] of rows.entries()) {
    const key = dedupeKey(row);
    if (seen.has(key)) {
      duplicates++;
      errors.push({
        row: i + 1,
        code: 'DUPLICATE_ROW',
        message: `duplicate of an earlier row for the same store + product (${key})`,
      });
    } else {
      seen.add(key);
      unique.push(row);
    }
  }
  return {
    rows: unique,
    errors,
    stats: {
      total_rows: totalRows,
      valid_rows: unique.length,
      invalid_rows: errors.filter((e) => e.code !== 'DUPLICATE_ROW').length,
      duplicate_rows: duplicates,
      rows_without_location: unique.filter((r) => !r.location).length,
    },
  };
}

/** Parse + validate + normalize a CSV import file. */
export function parseCatalogCsv(text: string): ImportParseResult {
  const grid = parseCsv(text);
  if (grid.length < 2) {
    return finalize([], [{ row: 0, code: 'MALFORMED_ROW', message: 'CSV needs a header row and at least one data row' }], 0);
  }

  const headers = grid[0].map(normalizeHeader);
  const rows: NormalizedImportRow[] = [];
  const errors: ImportRowError[] = [];

  for (let i = 1; i < grid.length; i++) {
    const cells = grid[i];
    const record: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (key && cells[c] !== undefined) record[key] = cells[c];
    }
    const result = normalizeRecord(record, i);
    if ('row' in result) rows.push(result.row);
    else errors.push(result.error);
  }
  return finalize(rows, errors, grid.length - 1);
}

/** Parse + validate + normalize a JSON import (array of records). */
export function parseCatalogJson(payload: unknown): ImportParseResult {
  if (!Array.isArray(payload)) {
    return finalize([], [{ row: 0, code: 'MALFORMED_ROW', message: 'JSON import must be an array of records' }], 0);
  }
  const rows: NormalizedImportRow[] = [];
  const errors: ImportRowError[] = [];
  payload.forEach((entry, i) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      errors.push({ row: i + 1, code: 'MALFORMED_ROW', message: 'record must be an object' });
      return;
    }
    const result = normalizeRecord(entry as Record<string, unknown>, i + 1);
    if ('row' in result) rows.push(result.row);
    else errors.push(result.error);
  });
  return finalize(rows, errors, payload.length);
}
