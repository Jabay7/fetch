import { Pressable, StyleSheet, View } from 'react-native';

import { AvailabilityPill } from '@/components/availability-pill';
import { LocationBadge, locationSpeech } from '@/components/location-badge';
import { ProductTile } from '@/components/product-tile';
import { ThemedText } from '@/components/themed-text';
import { Elevation, Radius, Spacing, TypeScale } from '@/constants/theme';
import {
  LEGACY_CAPABILITIES,
  type ProductHit,
  type StoreCapabilities,
} from '@/data/types';
import { useTheme } from '@/hooks/use-theme';
import { availabilityLabel, priceLabel } from '@/lib/format';

/**
 * One search result.
 *
 * The layout answers the shopper's question in the order they ask it: what is
 * it, then where is it, then can I buy it. The location badge sits on its own
 * row at full prominence rather than being squeezed into a trailing column
 * beside the price — finding is the product's purpose, and the previous
 * layout ranked a $4.49 the same as the aisle that saves a lap of the store.
 *
 * Nothing is invented: each row renders only what this store's integration
 * actually provides.
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
  const showLocation = capabilities.aisleData || Boolean(hit.location?.section);

  // Spoken as one sentence: "Colgate Total Whitening. Aisle G18. In stock.
  // $4.49." rather than a stream of disconnected labels.
  const a11yParts = [hit.name, locationSpeech(hit.location)];
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
        Elevation.card,
        {
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElevated,
          borderColor: theme.border,
        },
      ]}
    >
      <View style={styles.topRow}>
        <ProductTile
          name={hit.name}
          brand={hit.brand}
          imageUrl={hit.imageUrl}
          thumbnailUrl={hit.thumbnailUrl}
          mediumImageUrl={hit.mediumImageUrl}
          largeImageUrl={hit.largeImageUrl}
          section={hit.location?.section}
          department={hit.location?.department}
          size={64}
        />
        <View style={styles.body}>
          <ThemedText numberOfLines={2} style={[TypeScale.productName, { color: theme.text }]}>
            {hit.name}
          </ThemedText>
          {subtitle ? (
            <ThemedText
              numberOfLines={1}
              style={[TypeScale.caption, { color: theme.textSecondary }]}
            >
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
        {price ? (
          <ThemedText style={[TypeScale.heading, styles.price, { color: theme.text }]}>
            {price}
          </ThemedText>
        ) : null}
      </View>

      {showLocation ? (
        <View style={[styles.locationRow, { borderTopColor: theme.border }]}>
          <LocationBadge location={hit.location} />
          <View style={styles.locationMeta}>
            {hit.location?.section ? (
              <ThemedText
                numberOfLines={1}
                style={[TypeScale.small, { color: theme.textSecondary }]}
              >
                {hit.location.section}
              </ThemedText>
            ) : null}
            {capabilities.inventory ? (
              <AvailabilityPill availability={hit.availability} />
            ) : null}
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  body: {
    flex: 1,
    gap: Spacing.half,
  },
  price: {
    fontVariant: ['tabular-nums'],
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  locationMeta: {
    flex: 1,
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
});
