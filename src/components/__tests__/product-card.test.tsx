import { render, screen, userEvent } from '@testing-library/react-native';

import { ProductCard } from '@/components/product-card';
import { ProductTile } from '@/components/product-tile';
import type { ProductHit, StoreCapabilities } from '@/data/types';

const fullCaps: StoreCapabilities = {
  aisleData: true,
  inventory: true,
  pricing: true,
  productImages: true,
  storeMap: false,
  realtime: false,
  productSearch: true,
  departmentData: true,
};

const departmentsOnlyCaps: StoreCapabilities = {
  ...fullCaps,
  aisleData: false,
  inventory: false,
  pricing: false,
};

const colgate: ProductHit = {
  id: 'p-1',
  name: 'Colgate Total Toothpaste',
  brand: 'Colgate',
  sizeText: '4.8 oz',
  availability: 'IN_STOCK',
  priceCents: 449,
  location: {
    aisle: 'G18',
    section: 'Oral Care',
    department: 'Health & Beauty',
    dataSource: 'RETAILER_API',
  },
};

describe('ProductCard', () => {
  it('leads with the aisle and shows verified facts', async () => {
    await render(<ProductCard hit={colgate} capabilities={fullCaps} onPress={() => {}} />);
    expect(screen.getByText('Colgate Total Toothpaste')).toBeTruthy();
    expect(screen.getByText('Colgate · 4.8 oz')).toBeTruthy();
    expect(screen.getByText('Aisle G18 · Oral Care')).toBeTruthy();
    expect(screen.getByText('In stock')).toBeTruthy();
    expect(screen.getByText('$4.49')).toBeTruthy();
  });

  it('renders nothing the store cannot back up', async () => {
    await render(
      <ProductCard
        hit={{ ...colgate, location: { section: 'Oral Care', department: 'Health & Beauty' } }}
        capabilities={departmentsOnlyCaps}
        onPress={() => {}}
      />
    );
    expect(screen.queryByText('$4.49')).toBeNull();
    expect(screen.queryByText('In stock')).toBeNull();
    expect(screen.getByText('Oral Care')).toBeTruthy();
  });

  it('says "Aisle info unavailable" rather than inventing one', async () => {
    await render(
      <ProductCard
        hit={{ ...colgate, location: undefined }}
        capabilities={fullCaps}
        onPress={() => {}}
      />
    );
    expect(screen.getByText('Aisle info unavailable')).toBeTruthy();
  });

  it('opens details on press with a descriptive accessible name', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await render(<ProductCard hit={colgate} capabilities={fullCaps} onPress={onPress} />);
    await user.press(screen.getByLabelText(/Colgate Total Toothpaste.*Aisle G18.*In stock.*\$4\.49/s));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('ProductTile', () => {
  const treeText = (view: { toJSON: () => unknown }) => JSON.stringify(view.toJSON());

  it('renders the verified image when the provider supplied one', async () => {
    const view = await render(
      <ProductTile name="Colgate Total" brand="Colgate" imageUrl="https://img/colgate" />
    );
    expect(treeText(view)).toContain('https://img/colgate');
  });

  it('prefers the thumbnail for small tiles and the large image for heroes', async () => {
    const small = await render(
      <ProductTile
        name="Colgate Total"
        thumbnailUrl="https://img/thumb"
        largeImageUrl="https://img/large"
        size={48}
      />
    );
    expect(treeText(small)).toContain('https://img/thumb');

    const hero = await render(
      <ProductTile
        name="Colgate Total"
        thumbnailUrl="https://img/thumb"
        largeImageUrl="https://img/large"
        size={240}
      />
    );
    expect(treeText(hero)).toContain('https://img/large');
  });

  it('falls back to a category illustration rather than a broken image', async () => {
    const view = await render(
      <ProductTile name="Colgate Total" brand="Colgate" section="Oral Care" />
    );
    const json = treeText(view);
    expect(json).not.toContain('uri');
    // The illustration path renders an icon glyph instead.
    expect(json.length).toBeGreaterThan(0);
  });
});
