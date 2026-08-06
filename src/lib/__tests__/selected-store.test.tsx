import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { Store } from '@/data/types';
import {
  parseStoredStore,
  SELECTED_STORE_KEY,
  SelectedStoreProvider,
  useSelectedStore,
} from '../selected-store';

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
