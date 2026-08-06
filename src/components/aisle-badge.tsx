import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The aisle callout — a bold tile showing the aisle code ("G18"). Aisle
 * codes are opaque strings; stores use different naming schemes. Renders a
 * bordered "?" tile when the aisle is unknown.
 */
export function AisleBadge({ aisle, size = 'sm' }: { aisle?: string; size?: 'sm' | 'lg' }) {
  const theme = useTheme();
  const dimension = size === 'lg' ? 84 : 48;
  const known = Boolean(aisle);
  const text = aisle ?? '?';
  const fontSize =
    size === 'lg'
      ? text.length > 3
        ? 24
        : 30
      : text.length > 3
        ? 12
        : 16;

  return (
    <View
      accessibilityLabel={known ? `Aisle ${aisle}` : 'Aisle unknown'}
      style={[
        styles.badge,
        {
          width: dimension,
          height: dimension,
          borderRadius: size === 'lg' ? Radius.xl : Radius.md,
          backgroundColor: known ? theme.tint : theme.backgroundElement,
          borderWidth: known ? 0 : 1.5,
          borderColor: theme.border,
        },
      ]}
    >
      {size === 'lg' && known && (
        <ThemedText type="caption" style={[styles.aisleWord, { color: theme.onTint }]}>
          AISLE
        </ThemedText>
      )}
      <ThemedText
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{
          color: known ? theme.onTint : theme.textSecondary,
          fontSize,
          lineHeight: fontSize + 4,
          fontWeight: 800,
          fontFamily: Fonts.rounded,
        }}
      >
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  aisleWord: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: 700,
    letterSpacing: 1,
  },
});
