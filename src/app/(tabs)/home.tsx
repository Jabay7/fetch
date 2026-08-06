import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StoreBadge } from '@/components/store-badge';
import { TermChips } from '@/components/term-chips';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { dataProvider } from '@/data';
import { storeCapabilities } from '@/data/types';
import { useTheme } from '@/hooks/use-theme';
import { clearRecentSearches, getRecentSearches } from '@/lib/recents';
import { getSavedProducts, type SavedProduct } from '@/lib/saved-products';
import { useSelectedStore } from '@/lib/selected-store';

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { store } = useSelectedStore();
  const [recents, setRecents] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedProduct[]>([]);

  // Refresh local lists whenever Home regains focus — they change on other tabs.
  useFocusEffect(
    useCallback(() => {
      getRecentSearches().then(setRecents);
      getSavedProducts().then(setSaved);
    }, [])
  );

  const storeId = store?.id;
  const departmentsQuery = useQuery({
    queryKey: ['departments', storeId],
    queryFn: () => dataProvider.getDepartments(storeId as string),
    enabled: Boolean(storeId),
    staleTime: 10 * 60_000,
  });

  if (!store) {
    return <Redirect href="/" />;
  }

  const capabilities = storeCapabilities(store);
  const searchTerm = (term: string) =>
    router.push({ pathname: '/search', params: { q: term, ts: String(Date.now()) } });

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandRow}>
          <View style={[styles.brandMark, { backgroundColor: theme.tint }]}>
            <Ionicons name="search" size={16} color={theme.onTint} />
          </View>
          <ThemedText type="subtitle" accessibilityRole="header">
            Fetch
          </ThemedText>
        </View>

        <StoreBadge storeName={store.name} onPress={() => router.push('/store-picker')} />

        <Pressable
          onPress={() =>
            router.push({ pathname: '/search', params: { focus: String(Date.now()) } })
          }
          accessibilityRole="button"
          accessibilityLabel={`Search products at ${store.name}`}
          style={({ pressed }) => [
            styles.searchEntry,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Ionicons name="search" size={20} color={theme.textSecondary} />
          <ThemedText type="default" themeColor="textSecondary">
            Where is the… toothpaste?
          </ThemedText>
        </Pressable>

        <TermChips
          title="Recent searches"
          terms={recents.slice(0, 6)}
          onSelect={searchTerm}
          onClear={() => {
            clearRecentSearches();
            setRecents([]);
          }}
        />

        {saved.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText type="subtitle" accessibilityRole="header">
                Saved
              </ThemedText>
              <Pressable
                onPress={() => router.push('/saved')}
                accessibilityRole="button"
                accessibilityLabel="See all saved products"
                hitSlop={8}
              >
                <ThemedText type="smallBold" style={{ color: theme.tint }}>
                  See all
                </ThemedText>
              </Pressable>
            </View>
            {saved.slice(0, 3).map((item) => (
              <Pressable
                key={item.id}
                onPress={() =>
                  router.push({ pathname: '/product/[id]', params: { id: item.id } })
                }
                accessibilityRole="button"
                accessibilityLabel={`${item.name}. Open product details.`}
                style={({ pressed }) => [
                  styles.savedRow,
                  {
                    backgroundColor: pressed
                      ? theme.backgroundSelected
                      : theme.backgroundElement,
                  },
                ]}
              >
                <Ionicons name="bookmark" size={16} color={theme.tint} />
                <View style={styles.savedRowText}>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {item.name}
                  </ThemedText>
                  {item.brand ? (
                    <ThemedText type="caption" themeColor="textSecondary">
                      {item.brand}
                    </ThemedText>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {departmentsQuery.data && departmentsQuery.data.length > 0 ? (
          <TermChips
            title="Browse departments"
            terms={departmentsQuery.data.slice(0, 8)}
            onSelect={searchTerm}
          />
        ) : null}

        <ThemedText type="caption" themeColor="textSecondary" style={styles.footnote}>
          {capabilities.aisleData
            ? `Aisle locations shown are specific to ${store.name}.`
            : `${store.name} shares departments only — aisle numbers aren't available yet.`}
        </ThemedText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  brandMark: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 56,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
  },
  section: {
    gap: Spacing.two + Spacing.half,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + Spacing.half,
    padding: Spacing.three,
    borderRadius: Radius.md,
    minHeight: MinTouchTarget + 12,
  },
  savedRowText: {
    flex: 1,
    gap: Spacing.half,
  },
  footnote: {
    textAlign: 'center',
  },
});
