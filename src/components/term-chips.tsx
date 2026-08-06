import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A titled group of tappable search-term chips (recents, popular terms). */
export function TermChips({
  title,
  terms,
  onSelect,
  onClear,
}: {
  title: string;
  terms: string[];
  onSelect: (term: string) => void;
  onClear?: () => void;
}) {
  const theme = useTheme();
  if (terms.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <ThemedText type="smallBold" themeColor="textSecondary" accessibilityRole="header">
          {title}
        </ThemedText>
        {onClear ? (
          <Pressable
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel={`Clear ${title.toLowerCase()}`}
            hitSlop={8}
          >
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              Clear
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.chips}>
        {terms.map((term) => (
          <Pressable
            key={term}
            onPress={() => onSelect(term)}
            accessibilityRole="button"
            accessibilityLabel={`Search for ${term}`}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          >
            <ThemedText type="small">{term}</ThemedText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two + Spacing.half,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    minHeight: MinTouchTarget - 8,
    justifyContent: 'center',
  },
});
