import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProductCard } from '@/components/product-card';
import { SearchBar } from '@/components/search-bar';
import {
  CenteredState,
  ErrorState,
  LoadingState,
  OfflineBanner,
} from '@/components/state-views';
import { StoreBadge } from '@/components/store-badge';
import { TermChips } from '@/components/term-chips';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { dataProvider } from '@/data';
import { MIN_SEARCH_LENGTH, normalizeSearchTerm } from '@/data/ranking';
import type { ProductHit } from '@/data/types';
import { useTheme } from '@/hooks/use-theme';
import {
  addRecentSearch,
  clearRecentSearches,
  getRecentSearches,
} from '@/lib/recents';
import { useSelectedStore } from '@/lib/selected-store';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const POPULAR_TERMS = ['toothpaste', 'milk', 'eggs', 'paper towels', 'coffee', 'batteries'];

export default function SearchScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { store } = useSelectedStore();
  const [term, setTerm] = useState('');
  const [recents, setRecents] = useState<string[]>([]);
  const networkState = Network.useNetworkState();

  const debounced = useDebouncedValue(term, 300);
  const normalized = normalizeSearchTerm(debounced);
  const canSearch = normalized.length >= MIN_SEARCH_LENGTH;

  useEffect(() => {
    getRecentSearches().then(setRecents);
  }, []);

  const storeId = store?.id;
  const resultsQuery = useQuery({
    queryKey: ['products', storeId, normalized],
    queryFn: () => dataProvider.searchProducts(storeId as string, normalized),
    enabled: Boolean(storeId) && canSearch,
    placeholderData: keepPreviousData,
  });

  const commitSearch = useCallback((committed: string) => {
    addRecentSearch(committed).then(setRecents);
  }, []);

  const openProduct = useCallback(
    (hit: ProductHit) => {
      commitSearch(normalized);
      router.push({ pathname: '/product/[id]', params: { id: hit.id } });
    },
    [commitSearch, normalized, router]
  );

  if (!store) {
    return <Redirect href="/welcome" />;
  }

  // Only warn when the platform explicitly reports no connection.
  const isOffline = networkState.isConnected === false;

  let body: React.ReactNode;
  if (!canSearch) {
    body = (
      <ScrollView
        contentContainerStyle={styles.idle}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <TermChips
          title="Recent searches"
          terms={recents}
          onSelect={setTerm}
          onClear={() => {
            clearRecentSearches();
            setRecents([]);
          }}
        />
        <TermChips title="Popular" terms={POPULAR_TERMS} onSelect={setTerm} />
        {recents.length === 0 ? (
          <CenteredState
            icon="search-outline"
            title="Search anything in the store"
            body={`Try "toothpaste" — you'll get the exact aisle at ${store.name}.`}
          />
        ) : null}
      </ScrollView>
    );
  } else if (resultsQuery.isPending) {
    body = <LoadingState />;
  } else if (resultsQuery.isError) {
    body = (
      <ErrorState
        title="Search isn't available right now"
        body="Please check your connection and try again."
        onRetry={() => resultsQuery.refetch()}
      />
    );
  } else if (resultsQuery.data.length === 0) {
    body = (
      <CenteredState
        icon="basket-outline"
        title={`No matches for "${normalized}"`}
        body="Check the spelling, or try a more general word like &ldquo;toothpaste&rdquo; or &ldquo;cereal&rdquo;."
      />
    );
  } else {
    const count = resultsQuery.data.length;
    body = (
      <FlatList
        data={resultsQuery.data}
        keyExtractor={(hit) => hit.id}
        renderItem={({ item }) => <ProductCard hit={item} onPress={() => openProduct(item)} />}
        ListHeaderComponent={
          <ThemedText
            type="caption"
            themeColor="textSecondary"
            style={styles.resultCount}
            accessibilityLiveRegion="polite"
          >
            {count} {count === 1 ? 'result' : 'results'} at {store.name}
          </ThemedText>
        }
        contentContainerStyle={[
          styles.results,
          resultsQuery.isPlaceholderData && styles.stale,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <StoreBadge storeName={store.name} onPress={() => router.push('/store-picker')} />
        <SearchBar
          value={term}
          onChangeText={setTerm}
          placeholder="Search products, e.g. toothpaste"
          accessibilityLabel={`Search products at ${store.name}`}
          onSubmitEditing={() => {
            if (canSearch) commitSearch(normalized);
          }}
        />
        {isOffline ? <OfflineBanner /> : null}
      </View>
      <View style={styles.body}>{body}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    gap: Spacing.three,
  },
  body: {
    flex: 1,
    paddingHorizontal: Spacing.four,
  },
  idle: {
    gap: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
  },
  results: {
    gap: Spacing.two + Spacing.half,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
  },
  resultCount: {
    marginBottom: Spacing.one,
  },
  stale: {
    opacity: 0.6,
  },
});
