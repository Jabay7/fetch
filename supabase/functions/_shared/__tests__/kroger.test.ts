import {
  chainToRetailerSlug,
  isZipQuery,
  KrogerClient,
  mapKrogerLocation,
  mapKrogerProduct,
  type KrogerLocation,
  type KrogerProduct,
} from '../kroger';

const LOCATION: KrogerLocation = {
  locationId: '53100504',
  chain: 'MARIANOS',
  name: "Mariano's Schaumburg",
  phone: '8471234567',
  address: {
    addressLine1: '2323 W Schaumburg Rd',
    city: 'Schaumburg',
    state: 'IL',
    zipCode: '60194',
  },
  geolocation: { latitude: 42.02, longitude: -88.12 },
};

const PRODUCT: KrogerProduct = {
  productId: '0001111041600',
  upc: '0001111041600',
  description: 'Kroger 2% Reduced Fat Milk',
  brand: 'Kroger',
  categories: ['Dairy'],
  items: [
    {
      size: '1 gal',
      price: { regular: 3.49, promo: 2.99 },
      inventory: { stockLevel: 'HIGH' },
    },
  ],
  aisleLocations: [
    {
      description: 'DAIRY',
      number: '32',
      side: 'R',
      shelfNumber: '2',
      bayNumber: '5',
    },
  ],
  images: [
    {
      perspective: 'front',
      sizes: [
        { size: 'large', url: 'https://img/large' },
        { size: 'medium', url: 'https://img/medium' },
      ],
    },
  ],
};

describe('chain mapping', () => {
  it("maps Mariano's to its own retailer, everything else to kroger", () => {
    expect(chainToRetailerSlug('MARIANOS')).toBe('marianos');
    expect(chainToRetailerSlug('KROGER')).toBe('kroger');
    expect(chainToRetailerSlug('FRED MEYER')).toBe('kroger');
    expect(chainToRetailerSlug(undefined)).toBe('kroger');
  });
});

describe('mapKrogerLocation', () => {
  it('maps a full location into a store row', () => {
    expect(mapKrogerLocation(LOCATION)).toEqual({
      retailer_slug: 'marianos',
      provider_store_id: '53100504',
      store_number: '53100504',
      name: "Mariano's Schaumburg",
      address_line: '2323 W Schaumburg Rd',
      city: 'Schaumburg',
      state: 'IL',
      zip: '60194',
      phone: '8471234567',
      latitude: 42.02,
      longitude: -88.12,
    });
  });

  it('rejects locations missing identity or address', () => {
    expect(mapKrogerLocation({ ...LOCATION, locationId: '' })).toBeNull();
    expect(mapKrogerLocation({ ...LOCATION, address: { city: 'X' } })).toBeNull();
  });
});

describe('mapKrogerProduct', () => {
  const store = { retailer_slug: 'marianos', provider_store_id: '53100504' };

  it('maps aisle, stock, price, and image verbatim from the API', () => {
    const row = mapKrogerProduct(PRODUCT, store);
    expect(row).toMatchObject({
      retailer_slug: 'marianos',
      provider_store_id: '53100504',
      product: {
        name: 'Kroger 2% Reduced Fat Milk',
        brand: 'Kroger',
        upc: '0001111041600',
        image_url: 'https://img/medium',
      },
      provider_product_id: '0001111041600',
      location: {
        aisle: '32',
        bay: '5',
        shelf: '2',
        display_location: 'DAIRY',
      },
      inventory_status: 'IN_STOCK',
      price: { regular_cents: 349, sale_cents: 299, currency: 'USD' },
      source: 'RETAILER_API',
      source_provider: 'kroger-api',
    });
  });

  it('omits location entirely when the API returns no aisle data — never invents one', () => {
    const row = mapKrogerProduct({ ...PRODUCT, aisleLocations: [] }, store);
    expect(row?.location).toBeUndefined();
    const row2 = mapKrogerProduct({ ...PRODUCT, aisleLocations: undefined }, store);
    expect(row2?.location).toBeUndefined();
  });

  it('maps stock levels conservatively', () => {
    const withStock = (stockLevel?: string) =>
      mapKrogerProduct(
        { ...PRODUCT, items: [{ ...PRODUCT.items![0], inventory: stockLevel ? { stockLevel } : undefined }] },
        store
      );
    expect(withStock('LOW')?.inventory_status).toBe('LOW_STOCK');
    expect(withStock('TEMPORARILY_OUT_OF_STOCK')?.inventory_status).toBe('OUT_OF_STOCK');
    expect(withStock('SOMETHING_NEW')?.inventory_status).toBe('UNKNOWN');
    expect(withStock(undefined)?.inventory_status).toBeUndefined();
  });

  it('omits price when absent or zero', () => {
    const noPrice = mapKrogerProduct(
      { ...PRODUCT, items: [{ size: '1 gal', price: { regular: 0 } }] },
      store
    );
    expect(noPrice?.price).toBeUndefined();
  });

  it('rejects products without a name or id', () => {
    expect(mapKrogerProduct({ ...PRODUCT, description: '  ' }, store)).toBeNull();
    expect(mapKrogerProduct({ ...PRODUCT, productId: undefined }, store)).toBeNull();
  });
});

describe('KrogerClient', () => {
  const tokenResponse = {
    ok: true,
    status: 200,
    json: async () => ({ access_token: 'tok-1', expires_in: 1800 }),
  };

  function fakeFetch(responses: Record<string, unknown>) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const impl = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, init });
      if (u.includes('/connect/oauth2/token')) return tokenResponse;
      for (const [fragment, body] of Object.entries(responses)) {
        if (u.includes(fragment)) {
          return { ok: true, status: 200, json: async () => body };
        }
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }) as unknown as typeof fetch;
    return { impl, calls };
  }

  it('fetches a token once and reuses it until near expiry', async () => {
    let clock = 0;
    const { impl, calls } = fakeFetch({ '/locations': { data: [LOCATION] } });
    const client = new KrogerClient(
      { clientId: 'id', clientSecret: 'secret' },
      { fetchImpl: impl, now: () => clock }
    );
    await client.locationsByZip('60194');
    await client.locationsByZip('60194');
    expect(calls.filter((c) => c.url.includes('oauth2/token'))).toHaveLength(1);

    clock = 1800_000; // past expiry → re-auth
    await client.locationsByZip('60194');
    expect(calls.filter((c) => c.url.includes('oauth2/token'))).toHaveLength(2);
  });

  it('sends client credentials via basic auth and the product scope', async () => {
    const { impl, calls } = fakeFetch({ '/locations': { data: [] } });
    const client = new KrogerClient(
      { clientId: 'my-id', clientSecret: 'my-secret' },
      { fetchImpl: impl }
    );
    await client.locationsByZip('60601');
    const tokenCall = calls.find((c) => c.url.includes('oauth2/token'));
    expect((tokenCall?.init?.headers as Record<string, string>).authorization).toBe(
      `Basic ${Buffer.from('my-id:my-secret').toString('base64')}`
    );
    expect(tokenCall?.init?.body).toContain('product.compact');
  });

  it('throws on API errors instead of returning junk', async () => {
    const { impl } = fakeFetch({});
    const client = new KrogerClient(
      { clientId: 'id', clientSecret: 'secret' },
      { fetchImpl: impl }
    );
    await expect(client.searchProducts('123', 'milk')).rejects.toThrow(/products failed: 404/);
  });

  it('builds product queries with term, location, and clamped limit', async () => {
    const { impl, calls } = fakeFetch({ '/products': { data: [PRODUCT] } });
    const client = new KrogerClient(
      { clientId: 'id', clientSecret: 'secret' },
      { fetchImpl: impl }
    );
    const products = await client.searchProducts('53100504', 'milk', 500);
    expect(products).toHaveLength(1);
    const url = calls.find((c) => c.url.includes('/products'))?.url ?? '';
    expect(url).toContain('filter.term=milk');
    expect(url).toContain('filter.locationId=53100504');
    expect(url).toContain('filter.limit=50');
  });
});

describe('isZipQuery', () => {
  it('accepts exactly 5 digits', () => {
    expect(isZipQuery('60194')).toBe(true);
    expect(isZipQuery(' 60601 ')).toBe(true);
    expect(isZipQuery('6019')).toBe(false);
    expect(isZipQuery('schaumburg')).toBe(false);
    expect(isZipQuery('601941')).toBe(false);
  });
});
