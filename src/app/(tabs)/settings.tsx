import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { storeCapabilities, type Store } from '@/data/types';
import { useTheme } from '@/hooks/use-theme';
import { clearRecentSearches } from '@/lib/recents';
import { clearSavedProducts } from '@/lib/saved-products';
import { useSelectedStore } from '@/lib/selected-store';
import { getFavoriteStores, getRecentStores } from '@/lib/store-history';

const SUPPORT_EMAIL = 'yousifjaba@gmail.com';

type IoniconName = keyof typeof Ionicons.glyphMap;

function SettingsRow({
  icon,
  label,
  detail,
  onPress,
}: {
  icon: IoniconName;
  label: string;
  detail?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
        },
      ]}
    >
      <Ionicons name={icon} size={20} color={theme.textSecondary} />
      <View style={styles.rowText}>
        <ThemedText type="smallBold">{label}</ThemedText>
        {detail ? (
          <ThemedText type="caption" themeColor="textSecondary">
            {detail}
          </ThemedText>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const toast = useToast();
  const { store, selectStore, isHydrating } = useSelectedStore();
  const [favorites, setFavorites] = useState<Store[]>([]);
  const [recents, setRecents] = useState<Store[]>([]);

  useFocusEffect(
    useCallback(() => {
      getFavoriteStores().then(setFavorites);
      getRecentStores().then(setRecents);
    }, [])
  );

  if (isHydrating) {
    return null;
  }
  if (!store) {
    return <Redirect href="/" />;
  }

  const capabilities = storeCapabilities(store);
  const capabilitySummary = [
    capabilities.aisleData ? 'Aisle data' : 'Departments only',
    capabilities.inventory ? 'Stock levels' : null,
    capabilities.pricing ? 'Prices' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const quickSwitch = (target: Store) => {
    if (target.id === store.id) return;
    selectStore(target);
    toast.show(`Store changed to ${target.name}`);
  };

  const email = (subject: string) =>
    Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`
    ).catch(() => toast.show('No email app available'));

  const otherRecents = recents.filter(
    (recent) => recent.id !== store.id && !favorites.some((f) => f.id === recent.id)
  );
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="title" accessibilityRole="header">
          Settings
        </ThemedText>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary" accessibilityRole="header">
            Your store
          </ThemedText>
          <View style={[styles.storeCard, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="subtitle">{store.name}</ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              {store.addressLine}, {store.city}, {store.state} {store.zip}
            </ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              {[store.retailerName, capabilitySummary].filter(Boolean).join(' · ')}
            </ThemedText>
          </View>
          <SettingsRow
            icon="storefront-outline"
            label="Change store"
            detail="Your selection is remembered until you change it"
            onPress={() => router.push('/store-picker')}
          />
          {favorites.length > 0 ? (
            <View style={styles.subSection}>
              <ThemedText type="caption" themeColor="textSecondary">
                FAVORITES
              </ThemedText>
              {favorites.map((favorite) => (
                <SettingsRow
                  key={favorite.id}
                  icon={favorite.id === store.id ? 'checkmark-circle' : 'star'}
                  label={favorite.name}
                  detail={favorite.id === store.id ? 'Current store' : 'Tap to switch'}
                  onPress={() => quickSwitch(favorite)}
                />
              ))}
            </View>
          ) : null}
          {otherRecents.length > 0 ? (
            <View style={styles.subSection}>
              <ThemedText type="caption" themeColor="textSecondary">
                RECENT STORES
              </ThemedText>
              {otherRecents.map((recent) => (
                <SettingsRow
                  key={recent.id}
                  icon="time-outline"
                  label={recent.name}
                  detail="Tap to switch"
                  onPress={() => quickSwitch(recent)}
                />
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary" accessibilityRole="header">
            Your data
          </ThemedText>
          <SettingsRow
            icon="time-outline"
            label="Clear recent searches"
            onPress={() => {
              clearRecentSearches();
              toast.show('Recent searches cleared');
            }}
          />
          <SettingsRow
            icon="bookmark-outline"
            label="Clear saved products"
            onPress={() => {
              clearSavedProducts();
              toast.show('Saved products cleared');
            }}
          />
          <ThemedText type="caption" themeColor="textSecondary">
            Everything stays on this device. Fetch has no accounts and collects no
            personal data.
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary" accessibilityRole="header">
            About
          </ThemedText>
          <View style={[styles.storeCard, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">How location data works</ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              Aisle locations come from retailer feeds, store-managed catalogs, or
              shopper reports that store staff verified — each result says which.
              Fetch never guesses an aisle number.
            </ThemedText>
          </View>
          <SettingsRow
            icon="add-circle-outline"
            label="Request a store"
            detail="Ask us to add a retailer or location"
            onPress={() => email('Fetch — store request')}
          />
          <SettingsRow
            icon="flag-outline"
            label="Report a problem"
            onPress={() => email('Fetch — problem report')}
          />
          <ThemedText type="caption" themeColor="textSecondary">
            Fetch v{version}
          </ThemedText>
        </View>
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
  section: {
    gap: Spacing.two + Spacing.half,
  },
  subSection: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  storeCard: {
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.md,
    minHeight: MinTouchTarget + 8,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
});
