import { rowToStore, type StoreDbRow } from '../supabase/mappers';
import { storeCapabilityModel, type Store } from '../types';

const baseRow: StoreDbRow = {
  id: 's-1',
  name: 'Marianos Bucktown',
  chain: "Mariano's",
  retailer_id: 'r-1',
  retailer_name: "Mariano's",
  retailer_slug: 'marianos',
  retailer_integration_status: 'live',
  retailer_website_url: 'https://www.marianos.com',
  address_line: '2112 N Ashland Ave',
  city: 'Chicago',
  state: 'IL',
  zip: '60614',
  source: 'RETAILER_API',
  cap_aisle_data: true,
  cap_inventory: true,
  cap_pricing: true,
  cap_product_images: true,
  cap_store_map: false,
  cap_realtime: false,
  cap_product_search: true,
  cap_department_data: true,
  cap_last_synced_at: '2026-08-07T10:00:00Z',
  cap_last_verified_at: null,
};

describe('rowToStore with directory provenance', () => {
  it('carries retailer website, directory source, and distance', () => {
    const store = rowToStore({ ...baseRow, distance_miles: 1.84 });
    expect(store).toMatchObject({
      retailerWebsiteUrl: 'https://www.marianos.com',
      directorySource: 'RETAILER_API',
      distanceMiles: 1.84,
    });
  });

  it('ignores unknown source values rather than trusting them', () => {
    const store = rowToStore({ ...baseRow, source: 'SOMETHING_ELSE' });
    expect(store.directorySource).toBeUndefined();
  });

  it('maps OSM directory entries', () => {
    const store = rowToStore({ ...baseRow, source: 'OSM' });
    expect(store.directorySource).toBe('OSM');
  });
});

describe('storeCapabilityModel', () => {
  it('reports a fully integrated store honestly', () => {
    const store = rowToStore(baseRow);
    expect(storeCapabilityModel(store)).toEqual({
      directory: true,
      productSearch: true,
      aisleLocation: true,
      departmentLocation: true,
      inventory: true,
      pricing: true,
      productImages: true,
      storeMap: false,
      barcodeLookup: true,
      officialIntegration: true,
    });
  });

  it('reports a directory-only store with everything off but directory', () => {
    const store = rowToStore({
      ...baseRow,
      source: 'OSM',
      retailer_integration_status: 'directory_only',
      cap_aisle_data: false,
      cap_inventory: false,
      cap_pricing: false,
      cap_product_images: false,
      cap_product_search: false,
      cap_department_data: false,
    });
    const model = storeCapabilityModel(store);
    expect(model.directory).toBe(true);
    expect(model.productSearch).toBe(false);
    expect(model.aisleLocation).toBe(false);
    expect(model.officialIntegration).toBe(false);
  });

  it('treats legacy stores (no capability row) as searchable', () => {
    const legacy: Store = {
      id: 's-legacy',
      name: 'Old Store',
      addressLine: '1 Main St',
      city: 'Springfield',
      state: 'IL',
      zip: '62701',
    };
    const model = storeCapabilityModel(legacy);
    expect(model.directory).toBe(true);
    expect(model.productSearch).toBe(true);
    expect(model.officialIntegration).toBe(false);
  });

  it('marks only retailer-API stores as official integrations', () => {
    expect(storeCapabilityModel(rowToStore({ ...baseRow, source: 'OSM' })).officialIntegration).toBe(false);
    expect(storeCapabilityModel(rowToStore({ ...baseRow, source: 'STORE_MANAGED' })).officialIntegration).toBe(false);
    expect(storeCapabilityModel(rowToStore(baseRow)).officialIntegration).toBe(true);
  });
});
