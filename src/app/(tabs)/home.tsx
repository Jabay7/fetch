import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLockup } from '@/components/brand-mark';
import { RetailerLogo } from '@/components/retailer-logo';
import { TermChips } from '@/components/term-chips';
import { ThemedText } from '@/components/themed-text';
import { Elevation, MinTouchTarget, Radius, Spacing, TypeScale } from '@/constants/theme';
import { dataProvider } from '@/data';
import { storeCapabilities } from '@/data/types';
import { useTheme } from '@/hooks/use-theme';
import { clearRecentSearches, getRecentSearches } from '@/lib/recents';
import { getSavedProducts, type SavedProduct } from '@/lib/saved-products';
import { useSelectedStore } from '@/lib/selected-store';

/**
 * Concrete examples rather than a generic prompt — they teach the range of
 * what can be searched (a brand, a category, a part) in less space than any
 * explanation would take. Chosen per mount, not animated: a field that
 * rewrites itself while you are reading it is a distraction, not a feature.
 */
const PLACEHOLDERS = [
  'Search toothpaste, batteries, dog food…',
  'Search milk, HDMI cable, paper towels…',
  'Search shampoo, light bulbs, coffee…',
];

const QUICK_ACTIONS = [
  {
    icon: 'list-outline' as const,
    label: 'My list',
    a11y: 'Open your shopping list',
    href: '/saved' as const,
  },
  {
    icon: 'navigate-outline' as const,
    label: 'Nearby',
    a11y: 'Find nearby stores',
    href: '/store-picker' as const,
  },
  {
    icon: 'storefront-outline' as const,
    label: 'Change store',
    a11y: 'Change your selected store',
    href: '/store-picker' as const,
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { store, isHydrating } = useSelectedStore();
  const [recents, setRecents] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedProduct[]>([]);
  // Lazy initialiser: picked once per mount, so it never changes under the
  // reader mid-sentence.
  const [placeholder] = useState(
    () => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]
  );

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

  // Wait for the persisted selection before redirecting, so refreshes and
  // deep links on web don't bounce to the launch gate.
  if (isHydrating) {
    return null;
  }
  if (!store) {
    return <Redirect href="/" />;
  }

  const capabilities = storeCapabilities(store);
  const searchTerm = (term: string) =>
    router.push({ pathname: '/search', params: { q: term, ts: String(Date.now()) } });

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <BrandLockup />

        <ThemedText style={[TypeScale.display, styles.tagline, { color: theme.text }]}>
          Find it.{'\n'}Don&rsquo;t hunt for it.
        </ThemedText>

        {/* Store context: which store these answers are for. Logo first, so
            it is recognised before it is read. */}
        <Pressable
          onPress={() => router.push('/store-picker')}
          accessibilityRole="button"
          accessibilityLabel={`Shopping at ${store.name}. Change store.`}
          style={({ pressed }) => [
            styles.storeCard,
            {
              backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}
        >
          <RetailerLogo
            name={store.retailerName ?? store.chain ?? store.name}
            slug={store.retailerSlug}
            size={40}
          />
          <View style={styles.storeCardText}>
            <ThemedText style={[TypeScale.overline, { color: theme.textMuted }]}>
              SHOPPING AT
            </ThemedText>
            <ThemedText numberOfLines={1} style={[TypeScale.productName, { color: theme.text }]}>
              {store.name}
            </ThemedText>
          </View>
          <ThemedText style={[TypeScale.caption, { color: theme.tint }]}>Change</ThemedText>
        </Pressable>

        {/* The search field dominates: it is the only thing most sessions
            need, and everything below is a shortcut into it. */}
        <Pressable
          onPress={() =>
            router.push({ pathname: '/search', params: { focus: String(Date.now()) } })
          }
          accessibilityRole="button"
          accessibilityLabel={`Search products at ${store.name}`}
          style={({ pressed }) => [
            styles.searchEntry,
            Elevation.card,
            {
              backgroundColor: theme.backgroundElevated,
              borderColor: pressed ? theme.tint : theme.border,
            },
          ]}
        >
          <Ionicons name="search" size={22} color={theme.tint} />
          <ThemedText style={[TypeScale.body, { color: theme.textSecondary, flex: 1 }]}>
            {placeholder}
          </ThemedText>
        </Pressable>

        <View style={styles.quickActions}>
          {QUICK_ACTIONS.map(({ icon, label, a11y, href }) => (
            <Pressable
              key={label}
              onPress={() => router.push(href)}
              accessibilityRole="button"
              accessibilityLabel={a11y}
              style={({ pressed }) => [
                styles.quickAction,
                {
                  backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
            >
              <Ionicons name={icon} size={20} color={theme.tint} />
              <ThemedText style={[TypeScale.caption, { color: theme.text }]}>{label}</ThemedText>
            </Pressable>
          ))}
        </View>

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
  tagline: {
    marginTop: -Spacing.two,
  },
  quickActions: {
    flexDirection: 'row',
    gap: Spacing.two + Spacing.half,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    minHeight: 64,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  storeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two + Spacing.half,
    paddingRight: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  storeCardText: {
    flex: 1,
    gap: 1,
  },
  searchEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + Spacing.half,
    minHeight: 62,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
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
