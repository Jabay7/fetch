import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Clean initials avatar for a retailer. We deliberately do not ship retailer
 * logo assets — trademark licensing varies per brand — so every retailer
 * gets a consistent, deterministic-color monogram instead.
 */
const PALETTE = [
  '#0B6B50', // brand green
  '#1D4ED8',
  '#B45309',
  '#9333EA',
  '#BE123C',
  '#0E7490',
  '#4D7C0F',
  '#A21CAF',
];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

function initialsFor(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function RetailerAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const theme = useTheme();
  const background = colorFor(name);
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: Radius.md,
          backgroundColor: background,
        },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <ThemedText
        style={{
          color: theme.onTint,
          fontSize: size * 0.38,
          lineHeight: size * 0.48,
          fontWeight: 700,
        }}
      >
        {initialsFor(name)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
