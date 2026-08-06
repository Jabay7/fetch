import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FilterChips } from '@/components/filter-chips';
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
import {
  departmentOptions,
  filterHits,
  NO_FILTERS,
  type ResultFilters,
} from '@/data/filters';
import { MIN_SEARCH_LENGTH, normalizeSearchTerm } from '@/data/ranking';
import { storeCapabilities, type ProductHit } from '@/data/types';
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
  const { store, isHydrating } = useSelectedStore();
  const params = useLocalSearchParams<{ q?: string; ts?: string; focus?: string }>();
  const inputRef = useRef<TextInput>(null);
  const [term, setTerm] = useState('');
  const [recents, setRecents] = useState<string[]>([]);
  const networkState = Network.useNetworkState();

  // Home hands off a term (?q=milk&ts=…). Adjust state during render —
  // guarded by the handoff key — instead of a cascading effect.
  const incomingQ = typeof params.q === 'string' && params.q.length > 0 ? params.q : null;
  const handoffKey = incomingQ === null ? null : `${params.ts ?? ''}:${incomingQ}`;
  const [consumedHandoff, setConsumedHandoff] = useState<string | null>(null);
  if (handoffKey !== null && handoffKey !== consumedHandoff) {
    setConsumedHandoff(handoffKey);
    setTerm(incomingQ as string);
  }

  const debounced = useDebouncedValue(term, 300);
  const normalized = normalizeSearchTerm(debounced);
  const canSearch = normalized.length >= MIN_SEARCH_LENGTH;
  const storeId = store?.id;

  // New term or store: start from unfiltered results (same guarded pattern).
  const filterContextKey = `${storeId ?? ''}:${normalized}`;
  const [filterContext, setFilterContext] = useState(filterContextKey);
  const [filters, setFilters] = useState<ResultFilters>(NO_FILTERS);
  if (filterContext !== filterContextKey) {
    setFilterContext(filterContextKey);
    setFilters(NO_FILTERS);
  }

  useEffect(() => {
    getRecentSearches().then(setRecents);
  }, []);

  useEffect(() => {
    if (params.focus) {
      inputRef.current?.focus();
    }
  }, [params.focus]);
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

  if (isHydrating) {
    return null;
  }
  if (!store) {
    return <Redirect href="/" />;
  }

  const capabilities = storeCapabilities(store);
  // Only warn when the platform explicitly reports no connection.
  const isOffline = networkState.isConnected === false;

  const allHits = canSearch && resultsQuery.isSuccess ? resultsQuery.data : [];
  const visibleHits = filterHits(allHits, filters);
  const isFiltered = filters.inStockOnly || filters.department !== null;

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
  } else if (allHits.length === 0) {
    // While a new term is fetching, `keepPreviousData` can hand us the prior
    // term's empty result — show loading, not a wrong "No matches".
    body = resultsQuery.isPlaceholderData ? (
      <LoadingState />
    ) : (
      <CenteredState
        icon="basket-outline"
        title={`No matches for "${normalized}"`}
        body="Check the spelling, or try a more general word like &ldquo;toothpaste&rdquo; or &ldquo;cereal&rdquo;."
      />
    );
  } else if (visibleHits.length === 0) {
    body = (
      <CenteredState
        icon="funnel-outline"
        title="No results match your filters"
        body="Loosen the filters to see everything we found."
        actionLabel="Clear filters"
        onAction={() => setFilters(NO_FILTERS)}
      />
    );
  } else {
    body = (
      <FlatList
        data={visibleHits}
        keyExtractor={(hit) => hit.id}
        renderItem={({ item }) => (
          <ProductCard
            hit={item}
            capabilities={capabilities}
            onPress={() => openProduct(item)}
          />
        )}
        ListHeaderComponent={
          <ThemedText
            type="caption"
            themeColor="textSecondary"
            style={styles.resultCount}
            accessibilityLiveRegion="polite"
          >
            {isFiltered
              ? `${visibleHits.length} of ${allHits.length} results · filtered`
              : `${allHits.length} ${allHits.length === 1 ? 'result' : 'results'} at ${store.name}`}
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
          ref={inputRef}
          value={term}
          onChangeText={setTerm}
          placeholder="Search products, e.g. toothpaste"
          accessibilityLabel={`Search products at ${store.name}`}
          onSubmitEditing={() => {
            if (canSearch) commitSearch(normalized);
          }}
        />
        {isOffline ? <OfflineBanner /> : null}
        {canSearch && allHits.length > 1 ? (
          <FilterChips
            departments={departmentOptions(allHits)}
            filters={filters}
            onChange={setFilters}
            showStockToggle={capabilities.inventory}
          />
        ) : null}
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
    gap: Spacing.two + Spacing.half,
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
    paddingTop: Spacing.two,
    paddingBottom: Spacing.five,
  },
  resultCount: {
    marginBottom: Spacing.one,
  },
  stale: {
    opacity: 0.6,
  },
});
