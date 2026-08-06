import type { ProductDetails } from '@/data/types';
import { integrationStatusLabel, trustLabel } from '@/lib/format';
import type { SavedProduct } from '@/lib/saved-products';
import { buildShoppingSections } from '@/lib/shopping-list';

const item = (id: string, name = id): SavedProduct => ({
  id,
  name,
  savedAt: '2026-08-01T00:00:00Z',
});

const details = (aisle?: string): ProductDetails => ({
  id: 'x',
  name: 'x',
  availability: 'IN_STOCK',
  location: aisle ? { aisle } : undefined,
});

describe('buildShoppingSections', () => {
  const savedItems = [item('colgate'), item('milk'), item('bounty'), item('ghost')];

  it('groups items by aisle in natural aisle order', () => {
    const resolved = new Map<string, ProductDetails | null>([
      ['colgate', details('G18')],
      ['milk', details('2')],
      ['bounty', details('12')],
      ['ghost', details('2')],
    ]);
    const sections = buildShoppingSections(savedItems, resolved, true);
    expect(sections.map((s) => s.title)).toEqual(['Aisle 2', 'Aisle 12', 'Aisle G18']);
    expect(sections[0].data.map((i) => i.id)).toEqual(['milk', 'ghost']);
  });

  it('puts unknown-aisle items after aisles and not-carried items last', () => {
    const resolved = new Map<string, ProductDetails | null>([
      ['colgate', details('G18')],
      ['milk', details(undefined)],
      ['bounty', details(undefined)],
      ['ghost', null],
    ]);
    const sections = buildShoppingSections(savedItems, resolved, true);
    expect(sections.map((s) => s.title)).toEqual([
      'Aisle G18',
      'Aisle unavailable',
      'Not carried here',
    ]);
    expect(sections[1].data.map((i) => i.id)).toEqual(['milk', 'bounty']);
    expect(sections[2].data.map((i) => i.id)).toEqual(['ghost']);
  });

  it('falls back to one flat section while resolution is loading', () => {
    const sections = buildShoppingSections(savedItems, undefined, true);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('');
    expect(sections[0].data).toHaveLength(4);
  });

  it('does not group at departments-only stores (no aisle capability)', () => {
    const resolved = new Map<string, ProductDetails | null>([['colgate', details('G18')]]);
    const sections = buildShoppingSections(savedItems, resolved, false);
    expect(sections).toHaveLength(1);
    expect(sections[0].data).toHaveLength(4);
  });

  it('returns no sections for an empty list', () => {
    expect(buildShoppingSections([], new Map(), true)).toEqual([]);
  });
});

describe('trustLabel', () => {
  it('always labels demo data as demo data', () => {
    expect(trustLabel({ aisle: 'G18', dataSource: 'RETAILER_API' }, true)).toBe('Demo data');
    expect(trustLabel(undefined, true)).toBe('Demo data');
  });

  it('labels verified and sourced locations honestly', () => {
    expect(trustLabel({ aisle: '1', dataSource: 'RETAILER_API' }, false)).toBe(
      'Official retailer data'
    );
    expect(trustLabel({ aisle: '1', dataSource: 'AUTHORIZED_FEED' }, false)).toBe(
      'Authorized feed'
    );
    expect(trustLabel({ aisle: '1', dataSource: 'STORE_MANAGED' }, false)).toBe(
      'Store-provided data'
    );
    expect(
      trustLabel(
        { aisle: '1', dataSource: 'STORE_MANAGED', verificationStatus: 'VERIFIED' },
        false
      )
    ).toBe('Verified database data');
    expect(trustLabel({ aisle: '1', dataSource: 'COMMUNITY_VERIFIED' }, false)).toBe(
      'Community-verified'
    );
  });

  it('returns null when there is nothing trustworthy to say', () => {
    expect(trustLabel(undefined, false)).toBeNull();
    expect(trustLabel({ aisle: '1' }, false)).toBeNull();
  });
});

describe('integrationStatusLabel', () => {
  it('describes non-integrated retailers honestly and stays quiet otherwise', () => {
    expect(integrationStatusLabel('partnership_required')).toBe(
      'Retailer partnership required'
    );
    expect(integrationStatusLabel('unsupported')).toBe('Retailer integration unavailable');
    expect(integrationStatusLabel('directory_only')).toBe('Store directory only');
    expect(integrationStatusLabel('live')).toBeNull();
    expect(integrationStatusLabel('import_supported')).toBeNull();
    expect(integrationStatusLabel(undefined)).toBeNull();
  });
});
