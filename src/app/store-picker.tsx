import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SearchBar } from '@/components/search-bar';
import { CenteredState, ErrorState, LoadingState } from '@/components/state-views';
import { StoreRow } from '@/components/store-row';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { dataProvider } from '@/data';
import type { Store } from '@/data/types';
import { useTheme } from '@/hooks/use-theme';
import { useSelectedStore } from '@/lib/selected-store';
import {
  getFavoriteStores,
  isFavoriteStore,
  toggleFavoriteStore,
} from '@/lib/store-history';
import { useDebouncedValue } from '@/lib/use-debounced-value';

/**
 * Store selection, used both for first-run setup (no current store) and as
 * the change-store screen. Favorites are pinned above the full list; the
 * search box filters by name, city, ZIP, or retailer. Selection is always
 * explicit — the app never switches stores on its own.
 */
export default function StorePickerScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { store: currentStore, selectStore } = useSelectedStore();
  const [text, setText] = useState('');
  const [favorites, setFavorites] = useState<Store[]>([]);
  const debounced = useDebouncedValue(text, 250);
  const isSearching = debounced.trim().length > 0;

  useEffect(() => {
    getFavoriteStores().then(setFavorites);
  }, []);

  const storesQuery = useQuery({
    queryKey: ['stores', debounced.trim().toLowerCase()],
    queryFn: () => dataProvider.searchStores(debounced),
  });

  const handleSelect = (store: Store) => {
    const isFirstSelection = currentStore === null;
    if (currentStore?.id === store.id) {
      router.back();
      return;
    }
    selectStore(store);
    if (isFirstSelection) {
      router.replace('/home');
    } else {
      router.back();
    }
  };

  const handleToggleFavorite = async (store: Store) => {
    const { list } = await toggleFavoriteStore(store);
    setFavorites(list);
  };

  const renderRow = (store: Store) => (
    <StoreRow
      key={store.id}
      store={store}
      isSelected={store.id === currentStore?.id}
      isFavorite={isFavoriteStore(favorites, store.id)}
      onToggleFavorite={() => handleToggleFavorite(store)}
      onPress={() => handleSelect(store)}
    />
  );

  let body: React.ReactNode;
  if (storesQuery.isPending) {
    body = <LoadingState label="Finding stores…" />;
  } else if (storesQuery.isError) {
    body = (
      <ErrorState title="Couldn't load stores" onRetry={() => storesQuery.refetch()} />
    );
  } else if (storesQuery.data.length === 0) {
    body = (
      <CenteredState
        icon="storefront-outline"
        title="No stores found"
        body="Try a different name, city, ZIP code, or retailer. Missing your store? Request it from Settings."
      />
    );
  } else {
    const results = storesQuery.data;
    const favoriteRows = isSearching
      ? []
      : results.filter((store) => isFavoriteStore(favorites, store.id));
    const restRows = isSearching
      ? results
      : results.filter((store) => !isFavoriteStore(favorites, store.id));
    body = (
      <ScrollView
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {favoriteRows.length > 0 ? (
          <>
            <ThemedText type="caption" themeColor="textSecondary">
              FAVORITES
            </ThemedText>
            {favoriteRows.map(renderRow)}
          </>
        ) : null}
        {restRows.length > 0 ? (
          <>
            {!isSearching ? (
              <ThemedText type="caption" themeColor="textSecondary">
                {favoriteRows.length > 0 ? 'ALL STORES' : 'STORES'}
              </ThemedText>
            ) : null}
            {restRows.map(renderRow)}
          </>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <ThemedText type="title" accessibilityRole="header">
            {currentStore ? 'Change store' : 'Choose your store'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {currentStore
              ? `Currently shopping at ${currentStore.name}`
              : 'Aisle locations are specific to each store.'}
          </ThemedText>
        </View>
        {currentStore ? (
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close without changing store"
            hitSlop={8}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={26} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      <SearchBar
        value={text}
        onChangeText={setText}
        placeholder="Store name, city, ZIP, or retailer"
        accessibilityLabel="Search stores by name, city, ZIP code, or retailer"
      />

      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  headerText: {
    flex: 1,
    gap: Spacing.one,
  },
  closeButton: {
    minWidth: MinTouchTarget,
    minHeight: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    gap: Spacing.two + Spacing.half,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.four,
  },
});
