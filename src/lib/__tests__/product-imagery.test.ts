import {
  categoryArt,
  categoryForHit,
  inferCategory,
  pickImageUrl,
} from '../product-imagery';

describe('inferCategory', () => {
  it('prefers the store-verified section over the product name', () => {
    // Verified data says Oral Care; the name mentions "milk" (of magnesia).
    expect(
      inferCategory({ section: 'Oral Care', name: 'Milk of Magnesia Mint' })
    ).toBe('personal-care');
  });

  it('falls back to department when there is no section', () => {
    expect(inferCategory({ department: 'Pharmacy' })).toBe('pharmacy');
    expect(inferCategory({ department: 'Meat & Seafood' })).toBe('meat');
  });

  it.each([
    ['Fresh Produce', 'produce'],
    ['Dairy', 'dairy'],
    ['Frozen Foods', 'frozen'],
    ['Bread & Bakery', 'bakery'],
    ['Paper Goods', 'cleaning'],
    ['Laundry & Cleaning', 'cleaning'],
    ['Hardware & Batteries', 'hardware'],
    ['Dog Food & Supplies', 'pet'],
    ['Cereal & Breakfast', 'pantry'],
    ['Coffee & Tea', 'drinks'],
    ['First Aid', 'pharmacy'],
    ['Hair Care', 'personal-care'],
  ])('maps section %s → %s', (section, expected) => {
    expect(inferCategory({ section })).toBe(expected);
  });

  it('uses the product name only as a weak fallback', () => {
    expect(inferCategory({ name: 'Bounty Paper Towels' })).toBe('cleaning');
    expect(inferCategory({ name: 'Purina ONE Dry Dog Food' })).toBe('pet');
  });

  it('returns "other" rather than guessing', () => {
    expect(inferCategory({ name: 'Zorblat 3000' })).toBe('other');
    expect(inferCategory({})).toBe('other');
  });
});

describe('categoryArt', () => {
  it('provides an icon and tint for every category, including other', () => {
    expect(categoryArt('produce')).toMatchObject({ icon: 'leaf-outline' });
    expect(categoryArt('other')).toMatchObject({ icon: 'cube-outline' });
  });
});

describe('categoryForHit', () => {
  it('reads the hit location for its verified category', () => {
    expect(
      categoryForHit({
        name: 'Colgate Total',
        brand: 'Colgate',
        location: { section: 'Oral Care', department: 'Health & Beauty' },
      })
    ).toBe('personal-care');
  });

  it('handles hits with no location at all', () => {
    expect(categoryForHit({ name: 'Bounty Paper Towels', brand: 'Bounty' })).toBe(
      'cleaning'
    );
  });
});

describe('pickImageUrl', () => {
  const all = {
    thumbnailUrl: 'https://img/thumb',
    mediumImageUrl: 'https://img/medium',
    largeImageUrl: 'https://img/large',
    imageUrl: 'https://img/default',
  };

  it('uses the smallest sufficient size for small tiles', () => {
    expect(pickImageUrl(all, 48)).toBe('https://img/thumb');
  });

  it('steps up for mid-size and hero renders', () => {
    expect(pickImageUrl(all, 96)).toBe('https://img/medium');
    expect(pickImageUrl(all, 240)).toBe('https://img/large');
  });

  it('falls back through whatever the provider actually gave us', () => {
    expect(pickImageUrl({ imageUrl: 'https://img/only' }, 48)).toBe('https://img/only');
    expect(pickImageUrl({ largeImageUrl: 'https://img/big' }, 48)).toBe('https://img/big');
  });

  it('returns undefined when there is no image at all', () => {
    expect(pickImageUrl({}, 48)).toBeUndefined();
  });
});
