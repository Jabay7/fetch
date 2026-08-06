import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Product thumbnail: the image when one exists, otherwise a monogram tile
 * from the brand or product name. Keeps rows scannable without shipping
 * placeholder photography.
 */
export function ProductTile({
  name,
  brand,
  imageUrl,
  size = 48,
}: {
  name: string;
  brand?: string;
  imageUrl?: string;
  size?: number;
}) {
  const theme = useTheme();
  const initial = (brand ?? name).trim().charAt(0).toUpperCase() || '?';

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[styles.tile, { width: size, height: size }]}
        contentFit="cover"
        accessibilityIgnoresInvertColors
        alt=""
      />
    );
  }

  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          backgroundColor: theme.backgroundSelected,
        },
      ]}
    >
      <ThemedText
        themeColor="textSecondary"
        style={{ fontSize: size * 0.42, lineHeight: size * 0.52, fontWeight: 700 }}
      >
        {initial}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
