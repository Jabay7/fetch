import {
  hasValidCheckDigit,
  isValidEan,
  isValidGtin,
  isValidUpc,
  normalizeIdentifier,
  normalizeRecord,
  parseCatalogCsv,
  parseCatalogJson,
  parseCsv,
  parsePriceCents,
} from '../catalog-import-core';

const HEADER =
  'retailer,store_number,store_name,product_name,brand,category,variant,size,upc,gtin,retailer_sku,department,aisle,bay,shelf,section,inventory_status,price,image_url,source,updated_at';

describe('parseCsv', () => {
  it('parses quoted fields, embedded commas, and doubled quotes', () => {
    const grid = parseCsv('a,"b,c","say ""hi"""\r\nd,e,f\n');
    expect(grid).toEqual([
      ['a', 'b,c', 'say "hi"'],
      ['d', 'e', 'f'],
    ]);
  });

  it('handles newlines inside quoted fields', () => {
    const grid = parseCsv('name,note\nColgate,"line1\nline2"');
    expect(grid[1][1]).toBe('line1\nline2');
  });

  it('drops fully empty trailing lines', () => {
    expect(parseCsv('a,b\n1,2\n\n\n')).toHaveLength(2);
  });
});

describe('identifier validation', () => {
  it('accepts valid UPC-A check digits', () => {
    expect(isValidUpc('036000291452')).toBe(true); // canonical GS1 example
    expect(isValidUpc('012345678905')).toBe(true);
  });

  it('rejects wrong check digit, wrong length, non-digits', () => {
    expect(isValidUpc('036000291453')).toBe(false);
    expect(isValidUpc('12345')).toBe(false);
    expect(isValidUpc('03600029145X')).toBe(false);
  });

  it('validates GTIN-8/13/14 and EAN-13', () => {
    expect(isValidGtin('96385074')).toBe(true);
    expect(isValidGtin('00036000291452')).toBe(true);
    expect(isValidEan('4006381333931')).toBe(true);
    expect(isValidEan('4006381333932')).toBe(false);
  });

  it('normalizes dashes/spaces and unpacks EAN-13-wrapped UPC-A', () => {
    expect(normalizeIdentifier('0 3600-0291452')).toBe('036000291452');
    expect(normalizeIdentifier('0036000291452')).toBe('036000291452');
    expect(hasValidCheckDigit('036000291452')).toBe(true);
  });
});

describe('parsePriceCents', () => {
  it.each([
    ['$4.49', 449],
    ['4.49', 449],
    ['18', 1800],
    ['1,299.00', 129900],
  ])('parses %s → %d cents', (raw, cents) => {
    expect(parsePriceCents(raw)).toBe(cents);
  });

  it('rejects nonsense', () => {
    expect(parsePriceCents('four dollars')).toBeNull();
    expect(parsePriceCents('4.499')).toBeNull();
  });
});

describe('normalizeRecord', () => {
  const base = {
    retailer: 'Fetch Market',
    store_number: '22',
    product_name: 'Colgate Total Toothpaste',
    source: 'store_managed',
  };

  it('requires retailer, a store identifier, and a product name', () => {
    expect(normalizeRecord({ ...base, retailer: '' }, 1)).toMatchObject({
      error: { code: 'MISSING_RETAILER' },
    });
    expect(
      normalizeRecord({ ...base, store_number: undefined }, 1)
    ).toMatchObject({ error: { code: 'MISSING_STORE' } });
    expect(normalizeRecord({ ...base, product_name: ' ' }, 1)).toMatchObject({
      error: { code: 'MISSING_PRODUCT_NAME' },
    });
  });

  it('slugifies the retailer and trims whitespace', () => {
    const result = normalizeRecord({ ...base, retailer: "  Mariano's  " }, 1);
    expect(result).toMatchObject({ row: { retailer_slug: 'marianos' } });
  });

  it('rejects invalid UPCs instead of importing them', () => {
    expect(normalizeRecord({ ...base, upc: '036000291453' }, 3)).toMatchObject({
      error: { code: 'INVALID_UPC', row: 3 },
    });
  });

  it('maps loose inventory statuses and rejects unknown ones', () => {
    expect(normalizeRecord({ ...base, inventory_status: 'In Stock' }, 1)).toMatchObject({
      row: { inventory_status: 'IN_STOCK' },
    });
    expect(normalizeRecord({ ...base, inventory_status: 'maybe' }, 1)).toMatchObject({
      error: { code: 'INVALID_STATUS' },
    });
  });

  it('maps sources and rejects unknown ones', () => {
    expect(normalizeRecord({ ...base, source: 'official_retailer_api' }, 1)).toMatchObject({
      row: { source: 'RETAILER_API' },
    });
    expect(normalizeRecord({ ...base, source: 'my blog' }, 1)).toMatchObject({
      error: { code: 'INVALID_SOURCE' },
    });
  });

  it('omits location entirely when no location field is present', () => {
    const result = normalizeRecord(base, 1);
    expect(result).toMatchObject({ row: { location: undefined } });
  });

  it('never invents fields: absent price/status stay absent', () => {
    const result = normalizeRecord(base, 1);
    if (!('row' in result)) throw new Error('expected row');
    expect(result.row.price).toBeUndefined();
    expect(result.row.inventory_status).toBeUndefined();
  });
});

describe('parseCatalogCsv', () => {
  it('imports a valid CSV with mixed columns', () => {
    const csv = [
      HEADER,
      'Fetch Market,22,Schaumburg Main Store,Colgate Total Toothpaste,Colgate,Oral Care,,4.8 oz,036000291452,,SKU-1,Health & Beauty,G18,3,2,Oral Care,in stock,$4.49,,store_managed,2026-08-01',
      'Fetch Market,22,,Bounty Paper Towels,Bounty,Paper Goods,,,,,SKU-2,,,,,,in stock,18.99,,store_managed,',
    ].join('\n');
    const result = parseCatalogCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.stats).toMatchObject({
      total_rows: 2,
      valid_rows: 2,
      invalid_rows: 0,
      duplicate_rows: 0,
      rows_without_location: 1,
    });
    expect(result.rows[0]).toMatchObject({
      retailer_slug: 'fetch-market',
      store_number: '22',
      product: { name: 'Colgate Total Toothpaste', upc: '036000291452' },
      location: { aisle: 'G18', bay: '3', shelf: '2' },
      inventory_status: 'IN_STOCK',
      price: { regular_cents: 449, currency: 'USD' },
      source: 'STORE_MANAGED',
    });
    expect(result.rows[1].location).toBeUndefined();
  });

  it('reports invalid rows without failing the import', () => {
    const csv = [
      HEADER,
      'Fetch Market,22,,Good Product,,,,,,,,,,,,,,,,store_managed,',
      ',22,,No Retailer,,,,,,,,,,,,,,,,store_managed,',
      'Fetch Market,22,,Bad UPC,,,,,123,,,,,,,,,,,store_managed,',
    ].join('\n');
    const result = parseCatalogCsv(csv);
    expect(result.stats.valid_rows).toBe(1);
    expect(result.stats.invalid_rows).toBe(2);
    expect(result.errors.map((e) => e.code)).toEqual(['MISSING_RETAILER', 'INVALID_UPC']);
  });

  it('detects duplicates by store + product identity (first wins)', () => {
    const csv = [
      HEADER,
      'Fetch Market,22,,Colgate Total Toothpaste,Colgate,,,,036000291452,,,,G18,,,,,,,store_managed,',
      'Fetch Market,22,,Colgate Total Toothpaste RENAMED,Colgate,,,,036000291452,,,,G19,,,,,,,store_managed,',
      'Fetch Market,44,,Colgate Total Toothpaste,Colgate,,,,036000291452,,,,12,,,,,,,store_managed,',
    ].join('\n');
    const result = parseCatalogCsv(csv);
    expect(result.stats.duplicate_rows).toBe(1);
    // Different store is NOT a duplicate.
    expect(result.stats.valid_rows).toBe(2);
    expect(result.rows[0].location?.aisle).toBe('G18');
  });

  it('accepts header alias spellings', () => {
    const csv = ['Chain,Store #,Item,Aisle #,Stock,source', 'Fetch Market,22,Milk,D2,low,csv'].join('\n');
    const result = parseCatalogCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      product: { name: 'Milk' },
      location: { aisle: 'D2' },
      inventory_status: 'LOW_STOCK',
      source: 'STORE_MANAGED',
    });
  });

  it('rejects a file with no data rows', () => {
    const result = parseCatalogCsv(HEADER);
    expect(result.errors[0].code).toBe('MALFORMED_ROW');
    expect(result.rows).toHaveLength(0);
  });
});

describe('parseCatalogJson', () => {
  it('imports an array of records', () => {
    const result = parseCatalogJson([
      {
        retailer: 'fetch-market',
        provider_store_id: 'prov-1',
        product_name: 'Cheerios Cereal',
        aisle: 'A6',
        source: 'authorized_feed',
        source_provider: 'demo-feed',
      },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      provider_store_id: 'prov-1',
      location: { aisle: 'A6' },
      source: 'AUTHORIZED_FEED',
    });
  });

  it('rejects non-array payloads and non-object records', () => {
    expect(parseCatalogJson({ not: 'array' }).errors[0].code).toBe('MALFORMED_ROW');
    const mixed = parseCatalogJson([null, { retailer: 'x', store_name: 's', product_name: 'p', source: 'csv' }]);
    expect(mixed.stats.valid_rows).toBe(1);
    expect(mixed.errors[0].code).toBe('MALFORMED_ROW');
  });
});
