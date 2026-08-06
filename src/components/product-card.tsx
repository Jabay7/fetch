import { Pressable, StyleSheet, View } from 'react-native';

import { AisleBadge } from '@/components/aisle-badge';
import { AvailabilityPill } from '@/components/availability-pill';
import { ProductTile } from '@/components/product-tile';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import {
  LEGACY_CAPABILITIES,
  type ProductHit,
  type StoreCapabilities,
} from '@/data/types';
import { useTheme } from '@/hooks/use-theme';
import { availabilityLabel, locationSummary, priceLabel } from '@/lib/format';

/**
 * One search result. Renders only what the store's integration supports:
 * no aisle badge without aisle data, no stock pill without inventory, no
 * price without pricing.
 */
export function ProductCard({
  hit,
  onPress,
  capabilities = LEGACY_CAPABILITIES,
}: {
  hit: ProductHit;
  onPress: () => void;
  capabilities?: StoreCapabilities;
}) {
  const theme = useTheme();
  const subtitle = [hit.brand, hit.sizeText].filter(Boolean).join(' · ');
  const price = capabilities.pricing ? priceLabel(hit.priceCents) : null;

  const a11yParts = [hit.name, locationSummary(hit.location)];
  if (capabilities.inventory) a11yParts.push(availabilityLabel(hit.availability));
  if (price) a11yParts.push(price);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${a11yParts.join('. ')}.`}
      accessibilityHint="Opens product details"
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
        },
      ]}
    >
      <ProductTile name={hit.name} brand={hit.brand} imageUrl={hit.imageUrl} />
      <View style={styles.body}>
        <ThemedText type="smallBold" numberOfLines={2} style={styles.name}>
          {hit.name}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
        <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
          {locationSummary(hit.location)}
        </ThemedText>
        {capabilities.inventory ? (
          <AvailabilityPill availability={hit.availability} />
        ) : null}
      </View>
      <View style={styles.trailing}>
        {capabilities.aisleData ? <AisleBadge aisle={hit.location?.aisle} /> : null}
        {price ? (
          <ThemedText type="smallBold" style={styles.price}>
            {price}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
  },
  body: {
    flex: 1,
    gap: Spacing.one,
  },
  name: {
    fontSize: 16,
    lineHeight: 21,
  },
  trailing: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  price: {
    fontVariant: ['tabular-nums'],
  },
});
