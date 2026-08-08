import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LocationBadge } from '@/components/location-badge';
import { AvailabilityPill } from '@/components/availability-pill';
import { ProductTile } from '@/components/product-tile';
import { CenteredState, ErrorState, LoadingState } from '@/components/state-views';
import { StoreBadge } from '@/components/store-badge';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { dataProvider } from '@/data';
import { storeCapabilities, type ProductDetails } from '@/data/types';
import { useTheme } from '@/hooks/use-theme';
import {
  availabilityLabel,
  trustLabel,
  locationSummary,
  priceLabel,
  relativeDayLabel,
} from '@/lib/format';
import {
  getSavedProducts,
  isProductSaved,
  toggleSavedProduct,
} from '@/lib/saved-products';
import { useSelectedStore } from '@/lib/selected-store';

const SUPPORT_EMAIL = 'yousifjaba@gmail.com';

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
  const toast = useToast();
  const { store, isHydrating } = useSelectedStore();
  const [saved, setSaved] = useState(false);

  const storeId = store?.id;
  const productQuery = useQuery({
    queryKey: ['product', storeId, id],
    queryFn: () => dataProvider.getProduct(storeId as string, String(id)),
    enabled: Boolean(storeId) && Boolean(id),
  });

  // "Find at another store": verified data from other stores only.
  const otherStoresQuery = useQuery({
    queryKey: ['product-elsewhere', id, storeId],
    enabled:
      Boolean(storeId) && Boolean(id) && Boolean(dataProvider.findProductAtStores),
    staleTime: 5 * 60_000,
    queryFn: () =>
      dataProvider.findProductAtStores?.(String(id), storeId as string) ?? [],
  });

  useEffect(() => {
    let cancelled = false;
    getSavedProducts().then((list) => {
      if (!cancelled) setSaved(isProductSaved(list, String(id)));
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (isHydrating) {
    return null;
  }
  if (!store) {
    return <Redirect href="/" />;
  }

  const capabilities = storeCapabilities(store);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/search');
    }
  };

  const handleToggleSave = async (product: ProductDetails) => {
    const result = await toggleSavedProduct({
      id: product.id,
      name: product.name,
      brand: product.brand,
      sizeText: product.sizeText,
      imageUrl: product.imageUrl,
    });
    setSaved(result.saved);
    toast.show(result.saved ? 'Saved for quick access' : 'Removed from Saved');
  };

  const handleShare = (product: ProductDetails) => {
    const parts = [product.name];
    const summary = locationSummary(product.location);
    if (product.location) parts.push(summary);
    parts.push(`at ${store.name}`);
    Share.share({ message: `${parts.join(' — ')} (via Fetch)` }).catch(() => {
      // User dismissed the share sheet; nothing to do.
    });
  };

  const handleReport = (product: ProductDetails) => {
    const subject = `Fetch — incorrect location: ${product.name}`;
    const body = `Product: ${product.name}\nStore: ${store.name}\nShown: ${locationSummary(product.location)}\n\nWhat I found instead: `;
    Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    ).catch(() => toast.show('No email app available'));
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
    const price = capabilities.pricing ? priceLabel(product.priceCents) : null;
    const provenance = [
      trustLabel(location, dataProvider.kind === 'mock'),
      updated ? `Updated ${updated}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    body = (
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <ProductTile
            name={product.name}
            brand={product.brand}
            imageUrl={product.imageUrl}
            thumbnailUrl={product.thumbnailUrl}
            mediumImageUrl={product.mediumImageUrl}
            largeImageUrl={product.largeImageUrl}
            section={product.location?.section}
            department={product.location?.department}
            size={96}
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
          {capabilities.aisleData ? (
            <LocationBadge location={location} size="lg" />
          ) : (
            <View style={[styles.departmentMark, { backgroundColor: theme.backgroundSelected }]}>
              <Ionicons name="grid-outline" size={30} color={theme.textSecondary} />
            </View>
          )}
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
                {capabilities.aisleData && (location.bay || location.shelf) ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {[
                      location.bay ? `Bay ${location.bay}` : null,
                      location.shelf ? `Shelf ${location.shelf}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </ThemedText>
                ) : null}
                {!capabilities.aisleData ? (
                  <ThemedText type="caption" themeColor="textSecondary">
                    This store shares department info only — no aisle numbers yet.
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
          {capabilities.inventory ? (
            <AvailabilityPill availability={product.availability} size="md" />
          ) : null}
          {price ? (
            <ThemedText type="subtitle" style={styles.price}>
              {price}
            </ThemedText>
          ) : null}
        </View>
        {provenance ? (
          <Pressable
            onPress={() =>
              toast.show(
                `Location source: ${
                  trustLabel(location, dataProvider.kind === 'mock') ?? 'Unknown'
                }${product.updatedAt ? ` · Updated ${relativeDayLabel(product.updatedAt)}` : ''}`
              )
            }
            accessibilityRole="button"
            accessibilityLabel={`Data source: ${provenance}. Tap for details.`}
            hitSlop={6}
          >
            <ThemedText type="caption" themeColor="textSecondary">
              {provenance} ⓘ
            </ThemedText>
          </Pressable>
        ) : null}

        <View style={styles.actionRow}>
          <Pressable
            onPress={() => handleToggleSave(product)}
            accessibilityRole="button"
            accessibilityLabel={saved ? 'Remove from saved products' : 'Save this product'}
            style={({ pressed }) => [
              styles.actionButton,
              {
                backgroundColor: saved ? theme.tint : theme.backgroundElement,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Ionicons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={18}
              color={saved ? theme.onTint : theme.text}
            />
            <ThemedText
              type="smallBold"
              style={{ color: saved ? theme.onTint : theme.text }}
            >
              {saved ? 'Saved' : 'Save'}
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => handleShare(product)}
            accessibilityRole="button"
            accessibilityLabel="Share this product's location"
            style={({ pressed }) => [
              styles.actionButton,
              { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Ionicons name="share-outline" size={18} color={theme.text} />
            <ThemedText type="smallBold">Share</ThemedText>
          </Pressable>
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

        {otherStoresQuery.data && otherStoresQuery.data.length > 0 ? (
          <View style={styles.section}>
            <ThemedText type="subtitle" accessibilityRole="header">
              Find at another store
            </ThemedText>
            {otherStoresQuery.data.map((entry) => (
              <View
                key={entry.storeId}
                style={[styles.otherStoreRow, { backgroundColor: theme.backgroundElement }]}
              >
                <View style={styles.otherStoreBody}>
                  <ThemedText type="smallBold">{entry.storeName}</ThemedText>
                  <ThemedText type="caption" themeColor="textSecondary">
                    {[
                      entry.aisle ? `Aisle ${entry.aisle}` : 'Aisle unavailable',
                      availabilityLabel(entry.availability),
                      priceLabel(entry.priceCents),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </ThemedText>
                </View>
                <LocationBadge location={entry.aisle ? { aisle: entry.aisle } : undefined} />
              </View>
            ))}
          </View>
        ) : null}

        <ThemedText type="caption" themeColor="textSecondary">
          Location shown for {store.name} only. Item locations can shift during store
          resets.
        </ThemedText>
        <Pressable
          onPress={() => handleReport(product)}
          accessibilityRole="button"
          accessibilityLabel="Report an incorrect location"
          hitSlop={8}
          style={styles.reportLink}
        >
          <Ionicons name="flag-outline" size={14} color={theme.textSecondary} />
          <ThemedText type="caption" themeColor="textSecondary" style={styles.reportText}>
            Report an incorrect location
          </ThemedText>
        </Pressable>
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
  departmentMark: {
    width: 84,
    height: 84,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
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
  price: {
    fontVariant: ['tabular-nums'],
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.two + Spacing.half,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: MinTouchTarget + 4,
    borderRadius: Radius.md,
  },
  section: {
    gap: Spacing.two,
  },
  otherStoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
  },
  otherStoreBody: {
    flex: 1,
    gap: Spacing.half,
  },
  reportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
    minHeight: MinTouchTarget - 12,
  },
  reportText: {
    textDecorationLine: 'underline',
  },
});
