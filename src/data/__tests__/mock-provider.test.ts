import {
  STORE_EVANSTON,
  STORE_LAKEVIEW,
  STORE_NAPERVILLE,
  STORE_SCHAUMBURG,
} from '../mock/data';
import { mockProvider } from '../mock/mock-provider';

describe('mockProvider.searchStores', () => {
  it('returns all stores without a query', async () => {
    await expect(mockProvider.searchStores()).resolves.toHaveLength(4);
  });

  it('finds stores by retailer name', async () => {
    const stores = await mockProvider.searchStores('lakeview');
    expect(stores.map((s) => s.name)).toEqual(['Lakeview Drug Co — Clark St']);
  });

  it('filters by name, city, or ZIP', async () => {
    const byName = await mockProvider.searchStores('schaum');
    expect(byName.map((s) => s.name)).toEqual(['Schaumburg Main Store']);

    const byZip = await mockProvider.searchStores('60563');
    expect(byZip.map((s) => s.name)).toEqual(['Naperville West Store']);
  });
});

describe('mockProvider.searchProducts — required demo scenarios', () => {
  it('"toothpaste" at Schaumburg returns Colgate Total first: Aisle G18, Oral Care, in stock', async () => {
    const hits = await mockProvider.searchProducts(STORE_SCHAUMBURG, 'toothpaste');
    expect(hits.length).toBeGreaterThanOrEqual(4);
    const [first] = hits;
    expect(first.name).toBe('Colgate Total Toothpaste');
    expect(first.location?.aisle).toBe('G18');
    expect(first.location?.section).toBe('Oral Care');
    expect(first.availability).toBe('IN_STOCK');
  });

  it('handles the misspelling "toothpast"', async () => {
    const hits = await mockProvider.searchProducts(STORE_SCHAUMBURG, 'toothpast');
    expect(hits.map((h) => h.name)).toContain('Colgate Total Toothpaste');
  });

  it('returns nothing for a product no store carries', async () => {
    await expect(
      mockProvider.searchProducts(STORE_SCHAUMBURG, 'quinoa flakes')
    ).resolves.toEqual([]);
  });

  it('never leaks another store\'s catalog: charcoal toothpaste only exists at Naperville', async () => {
    const schaumburg = await mockProvider.searchProducts(STORE_SCHAUMBURG, 'charcoal');
    expect(schaumburg).toEqual([]);

    const naperville = await mockProvider.searchProducts(STORE_NAPERVILLE, 'charcoal');
    expect(naperville.map((h) => h.name)).toContain('Hello Activated Charcoal Toothpaste');
  });

  it('surfaces out-of-stock products with their location', async () => {
    const hits = await mockProvider.searchProducts(STORE_SCHAUMBURG, 'shampoo');
    const pantene = hits.find((h) => h.id === 'p-pantene-shampoo');
    expect(pantene?.availability).toBe('OUT_OF_STOCK');
    expect(pantene?.location?.aisle).toBe('G12');
  });

  it('returns products that have availability but no aisle information', async () => {
    const hits = await mockProvider.searchProducts(STORE_SCHAUMBURG, 'paper towels');
    const bounty = hits.find((h) => h.id === 'p-bounty-towels');
    expect(bounty?.availability).toBe('IN_STOCK');
    expect(bounty?.location).toBeUndefined();
  });

  it('rejects terms shorter than the minimum length', async () => {
    await expect(mockProvider.searchProducts(STORE_SCHAUMBURG, 'a')).resolves.toEqual([]);
  });
});

describe('mockProvider.getProduct — store scoping', () => {
  it('returns a different aisle for the same product at each store', async () => {
    const schaumburg = await mockProvider.getProduct(STORE_SCHAUMBURG, 'p-colgate-total');
    const naperville = await mockProvider.getProduct(STORE_NAPERVILLE, 'p-colgate-total');
    const evanston = await mockProvider.getProduct(STORE_EVANSTON, 'p-colgate-total');
    expect(schaumburg?.location?.aisle).toBe('G18');
    expect(naperville?.location?.aisle).toBe('12');
    expect(evanston?.location?.aisle).toBe('B7');
  });

  it('returns null for a product the selected store does not carry', async () => {
    await expect(
      mockProvider.getProduct(STORE_SCHAUMBURG, 'p-hello-charcoal')
    ).resolves.toBeNull();
  });

  it('includes details fields', async () => {
    const details = await mockProvider.getProduct(STORE_SCHAUMBURG, 'p-colgate-total');
    expect(details?.description).toBeTruthy();
    expect(details?.upc).toBeTruthy();
    expect(details?.updatedAt).toBeTruthy();
  });
});

describe('mockProvider — capability-scoped data (v2)', () => {
  it('returns prices at Fetch Market stores, different per store', async () => {
    const schaumburg = await mockProvider.getProduct(STORE_SCHAUMBURG, 'p-colgate-total');
    const naperville = await mockProvider.getProduct(STORE_NAPERVILLE, 'p-colgate-total');
    expect(schaumburg?.priceCents).toBe(449);
    expect(naperville?.priceCents).toBe(439);
  });

  it('labels location provenance, including community-verified records', async () => {
    const schaumburg = await mockProvider.getProduct(STORE_SCHAUMBURG, 'p-colgate-total');
    const evanston = await mockProvider.getProduct(STORE_EVANSTON, 'p-colgate-total');
    expect(schaumburg?.location?.dataSource).toBe('STORE_MANAGED');
    expect(evanston?.location?.dataSource).toBe('COMMUNITY_VERIFIED');
  });

  it('serves the departments-only store: sections but no aisle, price, or stock', async () => {
    const hits = await mockProvider.searchProducts(STORE_LAKEVIEW, 'toothpaste');
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit.location?.aisle).toBeUndefined();
      expect(hit.location?.section).toBeTruthy();
      expect(hit.priceCents).toBeUndefined();
      expect(hit.availability).toBe('UNKNOWN');
    }
  });

  it('lists distinct departments for a store', async () => {
    const departments = await mockProvider.getDepartments(STORE_SCHAUMBURG);
    expect(departments).toContain('Oral Care');
    expect(departments).toContain('Dairy');
    expect(new Set(departments).size).toBe(departments.length);
  });
});
