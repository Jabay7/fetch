import { Pressable, StyleSheet, View } from 'react-native';

import { AisleBadge } from '@/components/aisle-badge';
import { AvailabilityPill } from '@/components/availability-pill';
import { ProductTile } from '@/components/product-tile';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { ProductHit } from '@/data/types';
import { useTheme } from '@/hooks/use-theme';
import { availabilityLabel, locationSummary } from '@/lib/format';

export function ProductCard({ hit, onPress }: { hit: ProductHit; onPress: () => void }) {
  const theme = useTheme();
  const subtitle = [hit.brand, hit.sizeText].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${hit.name}. ${locationSummary(hit.location)}. ${availabilityLabel(hit.availability)}.`}
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
        <View style={styles.metaRow}>
          <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1} style={styles.location}>
            {locationSummary(hit.location)}
          </ThemedText>
        </View>
        <AvailabilityPill availability={hit.availability} />
      </View>
      <AisleBadge aisle={hit.location?.aisle} />
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  location: {
    flexShrink: 1,
  },
});
