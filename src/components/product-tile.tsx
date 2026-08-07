import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  categoryArt,
  inferCategory,
  pickImageUrl,
  type ProductCategory,
} from '@/lib/product-imagery';

/**
 * Product thumbnail. Shows the provider's verified image when one exists,
 * otherwise a clean category illustration — never a broken-image icon and
 * never a photo of a product we aren't sure about. Images load lazily,
 * pick the smallest size that covers the render, and fall back to the
 * illustration if the URL fails.
 */
export function ProductTile({
  name,
  brand,
  imageUrl,
  thumbnailUrl,
  mediumImageUrl,
  largeImageUrl,
  section,
  department,
  size = 48,
  category,
}: {
  name: string;
  brand?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  mediumImageUrl?: string;
  largeImageUrl?: string;
  section?: string;
  department?: string;
  size?: number;
  category?: ProductCategory;
}) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);

  const resolved = pickImageUrl(
    { imageUrl, thumbnailUrl, mediumImageUrl, largeImageUrl },
    size
  );

  if (resolved && !failed) {
    return (
      <Image
        source={{ uri: resolved }}
        style={[styles.tile, { width: size, height: size, backgroundColor: theme.backgroundSelected }]}
        contentFit="contain"
        transition={140}
        cachePolicy="memory-disk"
        recyclingKey={resolved}
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
        alt=""
      />
    );
  }

  const art = categoryArt(
    category ?? inferCategory({ section, department, name, brand })
  );

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
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Ionicons name={art.icon} size={size * 0.44} color={art.tint} />
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
