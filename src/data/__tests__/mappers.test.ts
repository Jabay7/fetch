import {
  rowToProductDetails,
  rowToProductHit,
  rowToStore,
  toAvailability,
  type ProductDetailsRow,
  type ProductSearchRow,
} from '../supabase/mappers';

const baseRow: ProductSearchRow = {
  product_id: 'p-colgate-total',
  name: 'Colgate Total Toothpaste',
  brand: 'Colgate',
  size_text: '4.8 oz',
  image_url: null,
  availability: 'IN_STOCK',
  aisle: 'G18',
  bay: '3',
  shelf: '2',
  section: 'Oral Care',
  department: 'Health & Beauty',
  updated_at: '2026-08-04T09:15:00Z',
};

describe('toAvailability', () => {
  it('passes through valid values and degrades unknown strings safely', () => {
    expect(toAvailability('IN_STOCK')).toBe('IN_STOCK');
    expect(toAvailability('OUT_OF_STOCK')).toBe('OUT_OF_STOCK');
    expect(toAvailability('SOMETHING_NEW')).toBe('UNKNOWN');
    expect(toAvailability(null)).toBe('UNKNOWN');
  });
});

describe('rowToProductHit', () => {
  it('maps a full row', () => {
    const hit = rowToProductHit(baseRow);
    expect(hit).toMatchObject({
      id: 'p-colgate-total',
      name: 'Colgate Total Toothpaste',
      brand: 'Colgate',
      availability: 'IN_STOCK',
      location: {
        aisle: 'G18',
        bay: '3',
        shelf: '2',
        section: 'Oral Care',
        department: 'Health & Beauty',
      },
    });
  });

  it('omits the location when every location field is null', () => {
    const hit = rowToProductHit({
      ...baseRow,
      aisle: null,
      bay: null,
      shelf: null,
      section: null,
      department: null,
    });
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
  it('maps snake_case columns to the domain shape', () => {
    const store = rowToStore({
      id: 's-1',
      name: 'Schaumburg Main Store',
      chain: 'Fetch Market',
      address_line: '601 E Golf Rd',
      city: 'Schaumburg',
      state: 'IL',
      zip: '60173',
    });
    expect(store.addressLine).toBe('601 E Golf Rd');
    expect(store.chain).toBe('Fetch Market');
  });
});
