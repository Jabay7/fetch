import { departmentOptions, filterHits, NO_FILTERS } from '../filters';
import type { ProductHit } from '../types';

const hits: ProductHit[] = [
  {
    id: 'a',
    name: 'Colgate Total Toothpaste',
    availability: 'IN_STOCK',
    location: { aisle: 'G18', section: 'Oral Care' },
  },
  {
    id: 'b',
    name: 'Sensodyne Toothpaste',
    availability: 'LOW_STOCK',
    location: { aisle: 'G18', section: 'Oral Care' },
  },
  {
    id: 'c',
    name: 'Pantene Shampoo',
    availability: 'OUT_OF_STOCK',
    location: { aisle: 'G12', section: 'Hair Care' },
  },
  {
    id: 'd',
    name: 'Bounty Paper Towels',
    availability: 'IN_STOCK',
    // No location at all — must survive filters that don't apply.
  },
  {
    id: 'e',
    name: 'Advil',
    availability: 'IN_STOCK',
    location: { department: 'Pharmacy' },
  },
];

describe('filterHits', () => {
  it('passes everything through with no filters', () => {
    expect(filterHits(hits, NO_FILTERS)).toHaveLength(5);
  });

  it('filters to in-stock only', () => {
    const filtered = filterHits(hits, { inStockOnly: true, department: null });
    expect(filtered.map((h) => h.id)).toEqual(['a', 'd', 'e']);
  });

  it('filters by department label, using section first then department', () => {
    expect(
      filterHits(hits, { inStockOnly: false, department: 'Oral Care' }).map((h) => h.id)
    ).toEqual(['a', 'b']);
    expect(
      filterHits(hits, { inStockOnly: false, department: 'Pharmacy' }).map((h) => h.id)
    ).toEqual(['e']);
  });

  it('combines filters', () => {
    const filtered = filterHits(hits, { inStockOnly: true, department: 'Oral Care' });
    expect(filtered.map((h) => h.id)).toEqual(['a']);
  });
});

describe('departmentOptions', () => {
  it('lists distinct labels by frequency then name, skipping location-less hits', () => {
    expect(departmentOptions(hits)).toEqual(['Oral Care', 'Hair Care', 'Pharmacy']);
  });

  it('caps the list', () => {
    expect(departmentOptions(hits, 1)).toEqual(['Oral Care']);
  });
});
