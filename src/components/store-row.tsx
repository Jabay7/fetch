import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { CapabilityChips } from '@/components/capability-chips';
import { RetailerLogo } from '@/components/retailer-logo';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { type Store } from '@/data/types';
import { useTheme } from '@/hooks/use-theme';
import { integrationStatusLabel } from '@/lib/format';

/**
 * One store in the picker. The favorite star is a *sibling* of the select
 * pressable rather than a child: nesting interactive controls produces
 * invalid HTML on web and confuses screen readers and keyboard traversal.
 */
export function StoreRow({
  store,
  isSelected,
  onPress,
  isFavorite,
  onToggleFavorite,
}: {
  store: Store;
  isSelected: boolean;
  onPress: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}) {
  const theme = useTheme();
  const address = `${store.addressLine}, ${store.city}, ${store.state} ${store.zip}`;
  const statusCaveat = integrationStatusLabel(store.retailerIntegrationStatus);
  const distance =
    store.distanceMiles !== undefined ? `${store.distanceMiles.toFixed(1)} mi` : null;
  const metaLine = [distance, statusCaveat].filter(Boolean).join(' · ');

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: isSelected ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: isSelected ? theme.tint : 'transparent',
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={
          isSelected
            ? `${store.name}, ${address}. Currently selected store.`
            : `${store.name}, ${address}. Select this store.`
        }
        style={({ pressed }) => [styles.main, pressed && { opacity: 0.7 }]}
      >
        <RetailerLogo
          name={store.retailerName ?? store.chain ?? store.name}
          slug={store.retailerSlug}
        />
        <View style={styles.body}>
          <ThemedText type="smallBold" style={styles.name}>
            {store.name}
          </ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            {address}
          </ThemedText>
          {metaLine ? (
            <ThemedText type="caption" themeColor="textSecondary">
              {metaLine}
            </ThemedText>
          ) : null}
          <CapabilityChips store={store} />
        </View>
      </Pressable>

      {onToggleFavorite ? (
        <Pressable
          onPress={onToggleFavorite}
          accessibilityRole="button"
          accessibilityLabel={
            isFavorite
              ? `Remove ${store.name} from favorites`
              : `Add ${store.name} to favorites`
          }
          hitSlop={6}
          style={styles.star}
        >
          <Ionicons
            name={isFavorite ? 'star' : 'star-outline'}
            size={20}
            color={isFavorite ? theme.warningText : theme.textSecondary}
          />
        </Pressable>
      ) : null}

      {isSelected ? (
        <View style={styles.current}>
          <Ionicons name="checkmark-circle" size={22} color={theme.tint} />
          <ThemedText type="caption" style={{ color: theme.tint, fontWeight: 600 }}>
            Current
          </ThemedText>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    minHeight: 76,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  body: {
    flex: 1,
    gap: Spacing.half,
  },
  name: {
    fontSize: 16,
    lineHeight: 21,
  },
  star: {
    minWidth: MinTouchTarget - 8,
    minHeight: MinTouchTarget - 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  current: {
    alignItems: 'center',
    gap: Spacing.half,
  },
});
