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
import type { Store, StoreTierFilter } from '@/data/types';
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
  // Default to stores that can actually answer a search. Directory records
  // stay one tap away rather than padding the primary list.
  const [tab, setTab] = useState<StoreTierFilter>('SUPPORTED');
  const [favorites, setFavorites] = useState<Store[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const debounced = useDebouncedValue(text, 250);
  const isSearching = debounced.trim().length > 0;
  const nearbySupported = Boolean(dataProvider.searchStoresNearby);

  useEffect(() => {
    getFavoriteStores().then(setFavorites);
  }, []);

  const storesQuery = useQuery({
    queryKey: [
      'stores',
      tab,
      debounced.trim().toLowerCase(),
      isSearching ? null : coords?.lat,
      isSearching ? null : coords?.lon,
    ],
    queryFn: () => {
      if (!isSearching && coords && dataProvider.searchStoresNearby) {
        return dataProvider.searchStoresNearby(coords.lat, coords.lon, tab);
      }
      return dataProvider.searchStores(debounced, tab);
    },
  });

  // How many stores sit behind the second tab, so the label can be honest
  // about what is there rather than implying a dead end.
  const comingSoonQuery = useQuery({
    queryKey: ['stores-coming-soon-count', debounced.trim().toLowerCase()],
    queryFn: () => dataProvider.searchStores(debounced, 'COMING_SOON'),
    enabled: tab === 'SUPPORTED',
  });

  const useMyLocation = () => {
    setLocationError(null);
    if (!navigator?.geolocation) {
      setLocationError('Location is not available on this device.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setText('');
        setCoords({ lat: position.coords.latitude, lon: position.coords.longitude });
      },
      () => {
        setLocating(false);
        setLocationError('Could not get your location. Search by ZIP instead.');
      },
      { timeout: 10_000, maximumAge: 5 * 60_000 }
    );
  };

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
    const comingSoonCount = comingSoonQuery.data?.length ?? 0;
    body =
      tab === 'SUPPORTED' && comingSoonCount > 0 ? (
        <CenteredState
          icon="time-outline"
          title="No searchable stores here yet"
          body={
            `We know of ${comingSoonCount === 60 ? '60+' : comingSoonCount} ` +
            `${comingSoonCount === 1 ? 'store' : 'stores'} nearby, but none can answer ` +
            'a product search yet. Check Coming soon to ask for one, or help map it.'
          }
        />
      ) : (
        <CenteredState
          icon="storefront-outline"
          title="No stores found"
          body="Try a different name, city, ZIP code, or retailer."
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

      {/* Stores that can answer a search come first. The rest are honestly
          labelled rather than mixed in and discovered only after a failed
          search. */}
      <View style={styles.tabs} accessibilityRole="tablist">
        {(
          [
            { key: 'SUPPORTED' as const, label: 'Supported' },
            { key: 'COMING_SOON' as const, label: 'Coming soon' },
          ]
        ).map(({ key, label }) => {
          const active = tab === key;
          return (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={
                key === 'SUPPORTED'
                  ? 'Stores where you can search products'
                  : 'Stores we know of but cannot search yet'
              }
              style={({ pressed }) => [
                styles.tab,
                {
                  backgroundColor: active
                    ? theme.tint
                    : pressed
                      ? theme.backgroundSelected
                      : theme.backgroundElement,
                },
              ]}
            >
              <ThemedText
                type="smallBold"
                style={{ color: active ? theme.onTint : theme.textSecondary }}
              >
                {label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {nearbySupported ? (
        <Pressable
          onPress={useMyLocation}
          disabled={locating}
          accessibilityRole="button"
          accessibilityLabel="Find stores near my current location"
          style={({ pressed }) => [
            styles.locationButton,
            { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
          ]}
        >
          <Ionicons
            name={coords ? 'navigate' : 'navigate-outline'}
            size={16}
            color={theme.tint}
          />
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            {locating ? 'Finding you…' : coords ? 'Near you' : 'Use my location'}
          </ThemedText>
          {coords ? (
            <ThemedText type="caption" themeColor="textSecondary">
              · sorted by distance
            </ThemedText>
          ) : null}
        </Pressable>
      ) : null}
      {locationError ? (
        <ThemedText type="caption" themeColor="textSecondary">
          {locationError}
        </ThemedText>
      ) : null}

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
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    minHeight: MinTouchTarget - 4,
    borderRadius: 999,
  },
  tabs: {
    flexDirection: 'row',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  tab: {
    paddingHorizontal: Spacing.three,
    minHeight: MinTouchTarget - 8,
    justifyContent: 'center',
    borderRadius: 999,
  },
});
