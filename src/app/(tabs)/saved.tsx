import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AisleBadge } from '@/components/aisle-badge';
import { AvailabilityPill } from '@/components/availability-pill';
import { CenteredState } from '@/components/state-views';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { dataProvider } from '@/data';
import { storeCapabilities, type ProductDetails } from '@/data/types';
import { useTheme } from '@/hooks/use-theme';
import { locationSummary, priceLabel } from '@/lib/format';
import {
  getSavedProducts,
  removeSavedProduct,
  type SavedProduct,
} from '@/lib/saved-products';
import { useSelectedStore } from '@/lib/selected-store';

/**
 * Saved products, resolved live against the selected store — the same item
 * legitimately shows a different aisle (or "not carried") after a store
 * switch, never stale data from the previous store.
 */
export default function SavedScreen() {
  const router = useRouter();
  const theme = useTheme();
  const toast = useToast();
  const { store } = useSelectedStore();
  const [saved, setSaved] = useState<SavedProduct[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      getSavedProducts().then(setSaved);
    }, [])
  );

  const storeId = store?.id;
  const ids = (saved ?? []).map((item) => item.id);
  const resolveQuery = useQuery({
    queryKey: ['saved-resolve', storeId, ids.join(',')],
    enabled: Boolean(storeId) && ids.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        ids.map((id) => dataProvider.getProduct(storeId as string, id))
      );
      return new Map<string, ProductDetails | null>(
        ids.map((id, index) => [id, results[index]])
      );
    },
  });

  if (!store) {
    return <Redirect href="/" />;
  }

  const capabilities = storeCapabilities(store);

  const remove = async (item: SavedProduct) => {
    const list = await removeSavedProduct(item.id);
    setSaved(list);
    toast.show('Removed from Saved');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <ThemedText type="title" accessibilityRole="header">
          Saved
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Locations shown for {store.name}
        </ThemedText>
      </View>

      {saved === null ? null : saved.length === 0 ? (
        <CenteredState
          icon="bookmark-outline"
          title="Nothing saved yet"
          body="Tap Save on any product to keep it one tap away, with today's aisle and availability."
          actionLabel="Search products"
          onAction={() => router.push('/search')}
        />
      ) : (
        <FlatList
          data={saved}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const resolved = resolveQuery.data?.get(item.id);
            const subtitle = [item.brand, item.sizeText].filter(Boolean).join(' · ');
            const price =
              capabilities.pricing && resolved ? priceLabel(resolved.priceCents) : null;
            return (
              <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
                <Pressable
                  onPress={() =>
                    router.push({ pathname: '/product/[id]', params: { id: item.id } })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}. Open product details.`}
                  style={styles.rowBody}
                >
                  <ThemedText type="smallBold" numberOfLines={2} style={styles.rowName}>
                    {item.name}
                  </ThemedText>
                  {subtitle ? (
                    <ThemedText type="caption" themeColor="textSecondary">
                      {subtitle}
                    </ThemedText>
                  ) : null}
                  {resolveQuery.isPending && ids.length > 0 ? (
                    <ThemedText type="caption" themeColor="textSecondary">
                      Checking this store…
                    </ThemedText>
                  ) : resolved === null ? (
                    <ThemedText type="caption" themeColor="textSecondary">
                      Not carried at {store.name}
                    </ThemedText>
                  ) : resolved ? (
                    <>
                      <ThemedText type="caption" themeColor="textSecondary">
                        {[locationSummary(resolved.location), price]
                          .filter(Boolean)
                          .join(' · ')}
                      </ThemedText>
                      {capabilities.inventory ? (
                        <AvailabilityPill availability={resolved.availability} />
                      ) : null}
                    </>
                  ) : null}
                </Pressable>
                {capabilities.aisleData && resolved ? (
                  <AisleBadge aisle={resolved.location?.aisle} />
                ) : null}
                <Pressable
                  onPress={() => remove(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.name} from saved products`}
                  hitSlop={6}
                  style={styles.removeButton}
                >
                  <Ionicons name="bookmark" size={20} color={theme.tint} />
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    padding: Spacing.four,
    paddingBottom: Spacing.three,
    gap: Spacing.one,
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.two + Spacing.half,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
  },
  rowBody: {
    flex: 1,
    gap: Spacing.one,
  },
  rowName: {
    fontSize: 16,
    lineHeight: 21,
  },
  removeButton: {
    minWidth: MinTouchTarget - 8,
    minHeight: MinTouchTarget - 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
