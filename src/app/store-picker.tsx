import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
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
import { useDebouncedValue } from '@/lib/use-debounced-value';

/**
 * Store selection, used both for first-run setup (no current store) and as
 * the change-store screen (opened from the store badge). On first run the
 * selection replaces the navigation stack with search; otherwise it simply
 * returns — every open query re-keys off the new store id automatically.
 */
export default function StorePickerScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { store: currentStore, selectStore } = useSelectedStore();
  const [text, setText] = useState('');
  const debounced = useDebouncedValue(text, 250);

  const storesQuery = useQuery({
    queryKey: ['stores', debounced.trim().toLowerCase()],
    queryFn: () => dataProvider.searchStores(debounced),
  });

  const handleSelect = (store: Store) => {
    const isFirstSelection = currentStore === null;
    selectStore(store);
    if (isFirstSelection) {
      router.replace('/search');
    } else {
      router.back();
    }
  };

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
        placeholder="Store name, city, or ZIP"
        accessibilityLabel="Search stores by name, city, or ZIP code"
      />

      {storesQuery.isPending ? (
        <LoadingState label="Finding stores…" />
      ) : storesQuery.isError ? (
        <ErrorState
          title="Couldn't load stores"
          onRetry={() => storesQuery.refetch()}
        />
      ) : storesQuery.data.length === 0 ? (
        <CenteredState
          icon="storefront-outline"
          title="No stores found"
          body="Try a different name, city, or ZIP code."
        />
      ) : (
        <FlatList
          data={storesQuery.data}
          keyExtractor={(store) => store.id}
          renderItem={({ item }) => (
            <StoreRow
              store={item}
              isSelected={item.id === currentStore?.id}
              onPress={() => handleSelect(item)}
            />
          )}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}
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
