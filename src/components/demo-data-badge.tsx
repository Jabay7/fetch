import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { dataProvider } from '@/data';
import { useTheme } from '@/hooks/use-theme';

/**
 * Discreet but explicit label shown whenever the app is running on the
 * bundled demo catalog (mock provider). Mock data must never be mistaken
 * for live inventory.
 */
export function DemoDataBadge() {
  const theme = useTheme();
  if (dataProvider.kind !== 'mock') return null;
  return (
    <View
      style={[styles.badge, { backgroundColor: theme.backgroundElement }]}
      accessibilityLabel="Demo product data. This app is showing a bundled demo catalog, not live store inventory."
    >
      <Ionicons name="flask-outline" size={12} color={theme.textSecondary} />
      <ThemedText type="caption" themeColor="textSecondary">
        Demo product data
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half + 2,
    borderRadius: Radius.pill,
  },
});
