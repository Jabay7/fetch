import {
  rowToProductDetails,
  rowToProductHit,
  rowToStore,
  toAvailability,
  toDataSource,
  toIntegrationStatus,
  toVerificationStatus,
  trustedResultToHit,
  type ProductDetailsRow,
  type ProductSearchRow,
  type StoreDbRow,
  type TrustedResultDto,
} from '../supabase/mappers';

const baseRow: ProductSearchRow = {
  product_id: 'p-colgate-total',
  name: 'Colgate Total Toothpaste',
  brand: 'Colgate',
  size_text: '4.8 oz',
  image_url: null,
  availability: 'IN_STOCK',
  price_cents: 449,
  aisle: 'G18',
  bay: '3',
  shelf: '2',
  section: 'Oral Care',
  department: 'Health & Beauty',
  data_source: 'STORE_MANAGED',
  updated_at: '2026-08-04T09:15:00Z',
};

const baseStoreRow: StoreDbRow = {
  id: 's-1',
  name: 'Schaumburg Main Store',
  chain: 'Fetch Market',
  retailer_id: 'r-1',
  retailer_name: 'Fetch Market',
  address_line: '601 E Golf Rd',
  city: 'Schaumburg',
  state: 'IL',
  zip: '60173',
  cap_aisle_data: true,
  cap_inventory: true,
  cap_pricing: true,
  cap_product_images: false,
  cap_store_map: false,
  cap_realtime: false,
  cap_last_synced_at: '2026-08-05T22:00:00Z',
};

describe('toAvailability', () => {
  it('passes through valid values and degrades unknown strings safely', () => {
    expect(toAvailability('IN_STOCK')).toBe('IN_STOCK');
    expect(toAvailability('OUT_OF_STOCK')).toBe('OUT_OF_STOCK');
    expect(toAvailability('SOMETHING_NEW')).toBe('UNKNOWN');
    expect(toAvailability(null)).toBe('UNKNOWN');
  });
});

describe('toDataSource', () => {
  it('maps valid sources, degrades junk to UNKNOWN, and passes null through', () => {
    expect(toDataSource('STORE_MANAGED')).toBe('STORE_MANAGED');
    expect(toDataSource('COMMUNITY_VERIFIED')).toBe('COMMUNITY_VERIFIED');
    expect(toDataSource('junk')).toBe('UNKNOWN');
    expect(toDataSource(null)).toBeUndefined();
  });
});

describe('rowToProductHit', () => {
  it('maps a full row including price and data source', () => {
    const hit = rowToProductHit(baseRow);
    expect(hit).toMatchObject({
      id: 'p-colgate-total',
      name: 'Colgate Total Toothpaste',
      brand: 'Colgate',
      availability: 'IN_STOCK',
      priceCents: 449,
      location: {
        aisle: 'G18',
        bay: '3',
        shelf: '2',
        section: 'Oral Care',
        department: 'Health & Beauty',
        dataSource: 'STORE_MANAGED',
      },
    });
  });

  it('omits price when null and location when every location field is null', () => {
    const hit = rowToProductHit({
      ...baseRow,
      price_cents: null,
      aisle: null,
      bay: null,
      shelf: null,
      section: null,
      department: null,
      data_source: null,
    });
    expect(hit.priceCents).toBeUndefined();
    expect(hit.location).toBeUndefined();
  });
});

describe('rowToProductDetails', () => {
  it('adds description and UPC', () => {
    const row: ProductDetailsRow = {
      ...baseRow,
      description: 'Whole-mouth clean.',
      upc: '0003500046013',
    };
    const details = rowToProductDetails(row);
    expect(details.description).toBe('Whole-mouth clean.');
    expect(details.upc).toBe('0003500046013');
  });
});

describe('rowToStore', () => {
  it('maps snake_case columns, retailer info, and capabilities', () => {
    const store = rowToStore(baseStoreRow);
    expect(store.addressLine).toBe('601 E Golf Rd');
    expect(store.retailerName).toBe('Fetch Market');
    expect(store.capabilities).toEqual({
      aisleData: true,
      inventory: true,
      pricing: true,
      productImages: false,
      storeMap: false,
      realtime: false,
      productSearch: true,
      departmentData: true,
      lastSyncedAt: '2026-08-05T22:00:00Z',
      lastVerifiedAt: undefined,
    });
  });

  it('defaults null capability flags to false', () => {
    const store = rowToStore({
      ...baseStoreRow,
      cap_aisle_data: null,
      cap_pricing: null,
      cap_last_synced_at: null,
    });
    expect(store.capabilities?.aisleData).toBe(false);
    expect(store.capabilities?.pricing).toBe(false);
    expect(store.capabilities?.lastSyncedAt).toBeUndefined();
  });
});

describe('v3 provenance mapping', () => {
  it('maps verification status and rejects junk values', () => {
    expect(toVerificationStatus('VERIFIED')).toBe('VERIFIED');
    expect(toVerificationStatus('COMMUNITY_VERIFIED')).toBe('COMMUNITY_VERIFIED');
    expect(toVerificationStatus('MADE_UP')).toBeUndefined();
    expect(toVerificationStatus(null)).toBeUndefined();
  });

  it('maps retailer integration statuses and rejects junk values', () => {
    expect(toIntegrationStatus('partnership_required')).toBe('partnership_required');
    expect(toIntegrationStatus('live')).toBe('live');
    expect(toIntegrationStatus('who knows')).toBeUndefined();
  });

  it('accepts AUTHORIZED_FEED as a data source', () => {
    expect(toDataSource('AUTHORIZED_FEED')).toBe('AUTHORIZED_FEED');
  });
});

describe('trustedResultToHit (Edge Function response mapping)', () => {
  const dto: TrustedResultDto = {
    product: { id: 'p-1', name: 'Colgate Total Toothpaste', brand: 'Colgate', size: '4.8 oz' },
    location: { aisle: 'G18', bay: '3', shelf: '2', section: 'Oral Care', department: 'Health & Beauty' },
    inventory: { status: 'in_stock' },
    price: { regular: 4.49, currency: 'USD' },
    source: { type: 'store_import', verified: false, updatedAt: '2026-08-04T09:15:00Z' },
  };

  it('maps a full trusted result into a ProductHit', () => {
    const hit = trustedResultToHit(dto);
    expect(hit).toMatchObject({
      id: 'p-1',
      availability: 'IN_STOCK',
      priceCents: 449,
      location: { aisle: 'G18', dataSource: 'STORE_MANAGED' },
      updatedAt: '2026-08-04T09:15:00Z',
    });
  });

  it('keeps a null location as undefined — aisle unavailable, never guessed', () => {
    const hit = trustedResultToHit({ ...dto, location: null });
    expect(hit.location).toBeUndefined();
  });

  it('maps source labels onto provenance + verification', () => {
    expect(
      trustedResultToHit({ ...dto, source: { type: 'community_verified', verified: true } })
        .location?.verificationStatus
    ).toBe('COMMUNITY_VERIFIED');
    expect(
      trustedResultToHit({ ...dto, source: { type: 'official_retailer_api', verified: true } })
        .location?.dataSource
    ).toBe('RETAILER_API');
    expect(
      trustedResultToHit({ ...dto, source: { type: 'verified_database', verified: true } })
        .location?.verificationStatus
    ).toBe('VERIFIED');
  });

  it('degrades unknown inventory statuses to UNKNOWN', () => {
    const hit = trustedResultToHit({ ...dto, inventory: { status: 'plenty' } });
    expect(hit.availability).toBe('UNKNOWN');
  });

  it('converts dollar prices to integer cents', () => {
    const hit = trustedResultToHit({
      ...dto,
      price: { regular: 18.49, sale: 15.99, currency: 'USD' },
    });
    expect(hit.priceCents).toBe(1849);
    expect(hit.salePriceCents).toBe(1599);
  });

  it('omits price entirely when the store provides none', () => {
    const hit = trustedResultToHit({ ...dto, price: undefined });
    expect(hit.priceCents).toBeUndefined();
  });
});
