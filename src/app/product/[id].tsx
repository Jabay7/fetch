import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AisleBadge } from '@/components/aisle-badge';
import { AvailabilityPill } from '@/components/availability-pill';
import { ProductTile } from '@/components/product-tile';
import { CenteredState, ErrorState, LoadingState } from '@/components/state-views';
import { StoreBadge } from '@/components/store-badge';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { dataProvider } from '@/data';
import { useTheme } from '@/hooks/use-theme';
import { relativeDayLabel } from '@/lib/format';
import { useSelectedStore } from '@/lib/selected-store';

/**
 * Product details for the currently selected store. The query is keyed by
 * (storeId, productId), so changing the store from here refetches and can
 * legitimately flip to "not carried at this store" — never showing another
 * store's aisle.
 */
export default function ProductDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { store } = useSelectedStore();

  const storeId = store?.id;
  const productQuery = useQuery({
    queryKey: ['product', storeId, id],
    queryFn: () => dataProvider.getProduct(storeId as string, String(id)),
    enabled: Boolean(storeId) && Boolean(id),
  });

  if (!store) {
    return <Redirect href="/welcome" />;
  }

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/search');
    }
  };

  let body: React.ReactNode;
  if (productQuery.isPending) {
    body = <LoadingState label="Loading product…" />;
  } else if (productQuery.isError) {
    body = (
      <ErrorState
        title="Couldn't load this product"
        onRetry={() => productQuery.refetch()}
      />
    );
  } else if (productQuery.data === null) {
    body = (
      <CenteredState
        icon="storefront-outline"
        title="Not carried at this store"
        body={`${store.name} doesn't stock this item. It may be available at another store.`}
        actionLabel="Change store"
        onAction={() => router.push('/store-picker')}
      />
    );
  } else {
    const product = productQuery.data;
    const subtitle = [product.brand, product.sizeText].filter(Boolean).join(' · ');
    const updated = relativeDayLabel(product.updatedAt);
    const location = product.location;

    body = (
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <ProductTile
            name={product.name}
            brand={product.brand}
            imageUrl={product.imageUrl}
            size={72}
          />
          <View style={styles.heroText}>
            <ThemedText type="title" accessibilityRole="header">
              {product.name}
            </ThemedText>
            {subtitle ? (
              <ThemedText type="small" themeColor="textSecondary">
                {subtitle}
              </ThemedText>
            ) : null}
          </View>
        </View>

        <View style={[styles.locationCard, { backgroundColor: theme.backgroundElement }]}>
          <AisleBadge aisle={location?.aisle} size="lg" />
          <View style={styles.locationText}>
            {location ? (
              <>
                {location.section ? (
                  <ThemedText type="subtitle">{location.section}</ThemedText>
                ) : null}
                {location.department ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {location.department}
                  </ThemedText>
                ) : null}
                {location.bay || location.shelf ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {[
                      location.bay ? `Bay ${location.bay}` : null,
                      location.shelf ? `Shelf ${location.shelf}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </ThemedText>
                ) : null}
              </>
            ) : (
              <>
                <ThemedText type="subtitle">Aisle info unavailable</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Ask a team member — availability below is still tracked for this
                  store.
                </ThemedText>
              </>
            )}
          </View>
        </View>

        <View style={styles.statusRow}>
          <AvailabilityPill availability={product.availability} size="md" />
          {updated ? (
            <ThemedText type="caption" themeColor="textSecondary">
              Updated {updated}
            </ThemedText>
          ) : null}
        </View>

        {product.description ? (
          <View style={styles.section}>
            <ThemedText type="subtitle" accessibilityRole="header">
              About this item
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary">
              {product.description}
            </ThemedText>
          </View>
        ) : null}

        <ThemedText type="caption" themeColor="textSecondary">
          Location shown for {store.name} only. Item locations can shift during store
          resets.
        </ThemedText>
      </ScrollView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Back to search"
          hitSlop={8}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </Pressable>
        <View style={styles.headerBadge}>
          <StoreBadge storeName={store.name} onPress={() => router.push('/store-picker')} />
        </View>
      </View>
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  backButton: {
    minWidth: MinTouchTarget,
    minHeight: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadge: {
    flex: 1,
    alignItems: 'flex-start',
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  hero: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
  },
  heroText: {
    flex: 1,
    gap: Spacing.one,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    padding: Spacing.four,
    borderRadius: Radius.xl,
  },
  locationText: {
    flex: 1,
    gap: Spacing.one,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  section: {
    gap: Spacing.two,
  },
});
