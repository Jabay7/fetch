import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AisleBadge } from '@/components/aisle-badge';
import { AvailabilityPill } from '@/components/availability-pill';
import { DemoDataBadge } from '@/components/demo-data-badge';
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
import { buildShoppingSections } from '@/lib/shopping-list';

/**
 * Saved products as a shopping list: resolved live against the selected
 * store (the same item legitimately shows a different aisle — or "not
 * carried" — after a store switch), grouped by aisle so the list walks the
 * store in order, with tap-to-check-off. Checked state is per-visit;
 * grouping re-resolves automatically when the store changes.
 */
export default function SavedScreen() {
  const router = useRouter();
  const theme = useTheme();
  const toast = useToast();
  const { store, isHydrating } = useSelectedStore();
  const [saved, setSaved] = useState<SavedProduct[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      getSavedProducts().then(setSaved);
    }, [])
  );

  // Different store: previous check-offs no longer apply. Guarded
  // adjust-during-render pattern (see search.tsx) instead of an effect.
  const [checkedStoreId, setCheckedStoreId] = useState(store?.id);
  if (store?.id !== checkedStoreId) {
    setCheckedStoreId(store?.id);
    setChecked(new Set());
  }

  const toggleChecked = (id: string) => {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const aisleDataSupported = store
    ? storeCapabilities(store).aisleData
    : false;
  const sections = useMemo(
    () => buildShoppingSections(saved ?? [], resolveQuery.data, aisleDataSupported),
    [saved, resolveQuery.data, aisleDataSupported]
  );

  if (isHydrating) {
    return null;
  }
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
          Shopping list for {store.name}
          {checked.size > 0 ? ` · ${checked.size} of ${ids.length} done` : ''}
        </ThemedText>
        <DemoDataBadge />
      </View>

      {saved === null ? null : saved.length === 0 ? (
        <CenteredState
          icon="bookmark-outline"
          title="Nothing saved yet"
          body="Tap Save on any product to build a shopping list with today's aisle and availability."
          actionLabel="Search products"
          onAction={() => router.push('/search')}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) =>
            section.title ? (
              <ThemedText
                type="caption"
                themeColor="textSecondary"
                style={styles.sectionTitle}
                accessibilityRole="header"
              >
                {section.title}
              </ThemedText>
            ) : null
          }
          renderItem={({ item }) => {
            const resolved = resolveQuery.data?.get(item.id);
            const isChecked = checked.has(item.id);
            const subtitle = [item.brand, item.sizeText].filter(Boolean).join(' · ');
            const price =
              capabilities.pricing && resolved ? priceLabel(resolved.priceCents) : null;
            return (
              <View
                style={[
                  styles.row,
                  { backgroundColor: theme.backgroundElement },
                  isChecked && styles.rowChecked,
                ]}
              >
                <Pressable
                  onPress={() => toggleChecked(item.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isChecked }}
                  accessibilityLabel={
                    isChecked
                      ? `${item.name}: done. Uncheck to put it back on the list.`
                      : `${item.name}: mark as picked up.`
                  }
                  hitSlop={6}
                  style={styles.checkButton}
                >
                  <Ionicons
                    name={isChecked ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={isChecked ? theme.tint : theme.textSecondary}
                  />
                </Pressable>
                <Pressable
                  onPress={() =>
                    router.push({ pathname: '/product/[id]', params: { id: item.id } })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}. Open product details.`}
                  style={styles.rowBody}
                >
                  <ThemedText
                    type="smallBold"
                    numberOfLines={2}
                    style={[styles.rowName, isChecked && styles.rowNameChecked]}
                  >
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
                      {capabilities.inventory && !isChecked ? (
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
  sectionTitle: {
    marginTop: Spacing.two,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + Spacing.half,
    padding: Spacing.three,
    borderRadius: Radius.lg,
  },
  rowChecked: {
    opacity: 0.55,
  },
  rowBody: {
    flex: 1,
    gap: Spacing.one,
  },
  rowName: {
    fontSize: 16,
    lineHeight: 21,
  },
  rowNameChecked: {
    textDecorationLine: 'line-through',
  },
  checkButton: {
    minWidth: MinTouchTarget - 12,
    minHeight: MinTouchTarget - 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButton: {
    minWidth: MinTouchTarget - 8,
    minHeight: MinTouchTarget - 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
