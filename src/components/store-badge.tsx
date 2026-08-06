import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The always-visible current-store chip. Tapping it opens the store picker,
 * satisfying "the store can be changed at any time".
 */
export function StoreBadge({ storeName, onPress }: { storeName: string; onPress: () => void }) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Current store: ${storeName}. Change store.`}
      style={({ pressed }) => [
        styles.badge,
        {
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: theme.border,
        },
      ]}
    >
      <Ionicons name="location" size={16} color={theme.tint} />
      <ThemedText type="smallBold" numberOfLines={1} style={styles.name}>
        {storeName}
      </ThemedText>
      <ThemedText type="caption" style={{ color: theme.tint, fontWeight: 600 }}>
        Change
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    minHeight: MinTouchTarget,
  },
  name: {
    flexShrink: 1,
  },
});
