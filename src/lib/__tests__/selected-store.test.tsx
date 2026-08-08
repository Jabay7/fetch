import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { dataProvider } from '@/data';
import type { Store } from '@/data/types';
import {
  parseStoredStore,
  SELECTED_STORE_KEY,
  SelectedStoreProvider,
  useSelectedStore,
} from '../selected-store';

jest.mock('@/data', () => ({
  dataProvider: { getStore: jest.fn() },
}));

const getStoreMock = dataProvider.getStore as jest.MockedFunction<
  typeof dataProvider.getStore
>;

const schaumburg: Store = {
  id: 'store-1',
  name: 'Schaumburg Main Store',
  addressLine: '601 E Golf Rd',
  city: 'Schaumburg',
  state: 'IL',
  zip: '60173',
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <SelectedStoreProvider>{children}</SelectedStoreProvider>
);

beforeEach(async () => {
  await AsyncStorage.clear();
  // Default: the backend confirms the selection is still the current store.
  getStoreMock.mockReset();
  getStoreMock.mockResolvedValue(schaumburg);
});

describe('parseStoredStore', () => {
  it('rejects corrupt or malformed payloads', () => {
    expect(parseStoredStore(null)).toBeNull();
    expect(parseStoredStore('not json')).toBeNull();
    expect(parseStoredStore('{"id":42}')).toBeNull();
  });

  it('accepts a valid store payload', () => {
    expect(parseStoredStore(JSON.stringify(schaumburg))?.id).toBe('store-1');
  });
});

describe('SelectedStoreProvider', () => {
  it('hydrates with no selection on first launch', async () => {
    const { result } = await renderHook(useSelectedStore, { wrapper });
    await waitFor(() => expect(result.current?.isHydrating).toBe(false));
    expect(result.current?.store).toBeNull();
  });

  it('persists a selection and restores it on the next launch', async () => {
    const first = await renderHook(useSelectedStore, { wrapper });
    await waitFor(() => expect(first.result.current?.isHydrating).toBe(false));

    await act(async () => first.result.current?.selectStore(schaumburg));
    expect(first.result.current?.store?.name).toBe('Schaumburg Main Store');
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(SELECTED_STORE_KEY)).toContain('store-1')
    );
    await first.unmount();

    // Fresh provider simulates an app relaunch.
    const second = await renderHook(useSelectedStore, { wrapper });
    await waitFor(() => expect(second.result.current?.isHydrating).toBe(false));
    expect(second.result.current?.store?.id).toBe('store-1');
  });

  describe('revalidating a persisted selection on launch', () => {
    const relaunch = async () => {
      await AsyncStorage.setItem(SELECTED_STORE_KEY, JSON.stringify(schaumburg));
      const { result } = await renderHook(useSelectedStore, { wrapper });
      await waitFor(() => expect(result.current?.isHydrating).toBe(false));
      return result;
    };

    it('drops a store the backend no longer offers', async () => {
      // Demo data, permanently closed, or quarantined: get_store returns null.
      getStoreMock.mockResolvedValue(null);
      const result = await relaunch();
      await waitFor(() => expect(result.current?.store).toBeNull());
      expect(await AsyncStorage.getItem(SELECTED_STORE_KEY)).toBeNull();
    });

    it('follows a store that was merged into its canonical twin', async () => {
      const survivor: Store = { ...schaumburg, id: 'store-canonical', name: 'Schaumburg Main' };
      getStoreMock.mockResolvedValue(survivor);
      const result = await relaunch();
      await waitFor(() => expect(result.current?.store?.id).toBe('store-canonical'));
      expect(await AsyncStorage.getItem(SELECTED_STORE_KEY)).toContain('store-canonical');
    });

    it('keeps the selection when the backend is unreachable', async () => {
      // Someone standing in the store with no signal must not lose it.
      getStoreMock.mockRejectedValue(new Error('offline'));
      const result = await relaunch();
      expect(result.current?.store?.id).toBe('store-1');
      expect(await AsyncStorage.getItem(SELECTED_STORE_KEY)).toContain('store-1');
    });
  });

  it('clears the selection', async () => {
    const { result } = await renderHook(useSelectedStore, { wrapper });
    await waitFor(() => expect(result.current?.isHydrating).toBe(false));

    await act(async () => result.current?.selectStore(schaumburg));
    await act(async () => result.current?.clearStore());

    expect(result.current?.store).toBeNull();
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(SELECTED_STORE_KEY)).toBeNull()
    );
  });
});
