import { render, screen, userEvent } from '@testing-library/react-native';

import { StoreRow } from '@/components/store-row';
import type { Store } from '@/data/types';

const fullStore: Store = {
  id: 's-1',
  name: 'Marianos Bucktown',
  retailerName: "Mariano's",
  retailerIntegrationStatus: 'live',
  directorySource: 'RETAILER_API',
  addressLine: '2112 N Ashland Ave',
  city: 'Chicago',
  state: 'IL',
  zip: '60614',
  capabilities: {
    aisleData: true,
    inventory: true,
    pricing: true,
    productImages: true,
    storeMap: false,
    realtime: false,
    productSearch: true,
    departmentData: true,
  },
};

const directoryOnlyStore: Store = {
  id: 's-2',
  name: 'Target Lincoln Park',
  retailerName: 'Target',
  retailerIntegrationStatus: 'partnership_required',
  directorySource: 'OSM',
  addressLine: '2650 N Clark St',
  city: 'Chicago',
  state: 'IL',
  zip: '60614',
  capabilities: {
    aisleData: false,
    inventory: false,
    pricing: false,
    productImages: false,
    storeMap: false,
    realtime: false,
    productSearch: false,
    departmentData: false,
  },
};

describe('StoreRow', () => {
  it('shows the supported capabilities of an integrated store', async () => {
    await render(<StoreRow store={fullStore} isSelected={false} onPress={() => {}} />);
    expect(screen.getByText('Marianos Bucktown')).toBeTruthy();
    expect(screen.getByText('Search')).toBeTruthy();
    expect(screen.getByText('Aisles')).toBeTruthy();
    expect(screen.getByText('Prices')).toBeTruthy();
    expect(screen.getByText('Stock')).toBeTruthy();
  });

  it('shows a directory-only store honestly instead of hiding it', async () => {
    await render(
      <StoreRow store={directoryOnlyStore} isSelected={false} onPress={() => {}} />
    );
    expect(screen.getByText('Target Lincoln Park')).toBeTruthy();
    expect(screen.getByText('Directory only')).toBeTruthy();
    expect(screen.queryByText('Aisles')).toBeNull();
    // The honest caveat, not a fake capability.
    expect(screen.getByText(/Retailer partnership required/)).toBeTruthy();
  });

  it('renders distance when the search was geographic', async () => {
    await render(
      <StoreRow
        store={{ ...fullStore, distanceMiles: 1.84 }}
        isSelected={false}
        onPress={() => {}}
      />
    );
    expect(screen.getByText(/1\.8 mi/)).toBeTruthy();
  });

  it('selects on press', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await render(<StoreRow store={fullStore} isSelected={false} onPress={onPress} />);
    await user.press(screen.getByLabelText(/Select this store/));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('exposes the favorite toggle as its own control, not nested in the row', async () => {
    const onToggleFavorite = jest.fn();
    const onPress = jest.fn();
    const user = userEvent.setup();
    await render(
      <StoreRow
        store={fullStore}
        isSelected={false}
        onPress={onPress}
        isFavorite={false}
        onToggleFavorite={onToggleFavorite}
      />
    );
    await user.press(screen.getByLabelText(/Add Marianos Bucktown to favorites/));
    expect(onToggleFavorite).toHaveBeenCalledTimes(1);
    // Pressing the star must not also select the store.
    expect(onPress).not.toHaveBeenCalled();
  });

  it('marks the current store', async () => {
    await render(<StoreRow store={fullStore} isSelected onPress={() => {}} />);
    expect(screen.getByText('Current')).toBeTruthy();
    expect(screen.getByLabelText(/Currently selected store/)).toBeTruthy();
  });
});
