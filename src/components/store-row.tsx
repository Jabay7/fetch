import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { Store } from '@/data/types';
import { useTheme } from '@/hooks/use-theme';

export function StoreRow({
  store,
  isSelected,
  onPress,
}: {
  store: Store;
  isSelected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const address = `${store.addressLine}, ${store.city}, ${store.state} ${store.zip}`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        isSelected
          ? `${store.name}, ${address}. Currently selected store.`
          : `${store.name}, ${address}. Select this store.`
      }
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed
            ? theme.backgroundSelected
            : isSelected
              ? theme.backgroundSelected
              : theme.backgroundElement,
          borderColor: isSelected ? theme.tint : 'transparent',
        },
      ]}
    >
      <View style={styles.body}>
        <ThemedText type="smallBold" style={styles.name}>
          {store.name}
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary">
          {address}
        </ThemedText>
      </View>
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    minHeight: 72,
  },
  body: {
    flex: 1,
    gap: Spacing.half,
  },
  name: {
    fontSize: 16,
    lineHeight: 21,
  },
  current: {
    alignItems: 'center',
    gap: Spacing.half,
  },
});
