import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { storeCapabilityModel, type Store } from '@/data/types';
import { useTheme } from '@/hooks/use-theme';

/**
 * Compact capability summary for a store row: what this store's data can
 * actually do. Directory-only stores show an honest "Directory only" chip
 * instead of a wall of missing features.
 */
export function CapabilityChips({ store }: { store: Store }) {
  const theme = useTheme();
  const model = storeCapabilityModel(store);

  const supported: string[] = [];
  if (model.productSearch) supported.push('Search');
  if (model.aisleLocation) supported.push('Aisles');
  if (model.pricing) supported.push('Prices');
  if (model.inventory) supported.push('Stock');

  // Community-mapped stores are labelled as such rather than borrowing the
  // language of retailer data — a shopper deserves to know which is which.
  if (store.coverage?.tier === 'COMMUNITY') {
    const mapped = store.coverage.communityLocationCount;
    return (
      <View
        style={styles.row}
        accessibilityLabel={`Community mapped. ${mapped} product locations contributed by shoppers.`}
      >
        <View style={[styles.chip, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons name="people-outline" size={11} color={theme.tint} />
          <ThemedText type="caption" themeColor="textSecondary">
            {mapped > 0 ? `${mapped} community-mapped` : 'Community mapped'}
          </ThemedText>
        </View>
      </View>
    );
  }

  if (supported.length === 0) {
    return (
      <View
        style={styles.row}
        accessibilityLabel="Product search is not available at this store yet."
      >
        <View style={[styles.chip, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons name="time-outline" size={11} color={theme.textSecondary} />
          <ThemedText type="caption" themeColor="textSecondary">
            Coming soon
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.row} accessibilityLabel={`Supports: ${supported.join(', ')}.`}>
      {supported.map((label) => (
        <View key={label} style={[styles.chip, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons name="checkmark" size={11} color={theme.tint} />
          <ThemedText type="caption" themeColor="textSecondary">
            {label}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.one + 2,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
});
