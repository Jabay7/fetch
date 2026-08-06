import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import type { ResultFilters } from '@/data/filters';
import { useTheme } from '@/hooks/use-theme';

/**
 * Result filters: an in-stock toggle plus a single-select department row.
 * Filtering is client-side over the fetched results, so chips respond
 * instantly and work offline.
 */
export function FilterChips({
  departments,
  filters,
  onChange,
  showStockToggle,
}: {
  departments: string[];
  filters: ResultFilters;
  onChange: (filters: ResultFilters) => void;
  showStockToggle: boolean;
}) {
  const theme = useTheme();
  if (!showStockToggle && departments.length < 2) return null;

  const chipStyle = (selected: boolean) => [
    styles.chip,
    {
      backgroundColor: selected ? theme.tint : theme.backgroundElement,
      borderColor: selected ? theme.tint : theme.border,
    },
  ];
  const chipTextColor = (selected: boolean) => ({
    color: selected ? theme.onTint : theme.text,
  });

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel="Filter results"
    >
      {showStockToggle ? (
        <Pressable
          onPress={() => onChange({ ...filters, inStockOnly: !filters.inStockOnly })}
          accessibilityRole="button"
          accessibilityState={{ selected: filters.inStockOnly }}
          accessibilityLabel="Only show in-stock products"
          style={chipStyle(filters.inStockOnly)}
        >
          {filters.inStockOnly ? (
            <Ionicons name="checkmark" size={14} color={theme.onTint} />
          ) : null}
          <ThemedText type="smallBold" style={chipTextColor(filters.inStockOnly)}>
            In stock
          </ThemedText>
        </Pressable>
      ) : null}
      {departments.map((department) => {
        const selected = filters.department === department;
        return (
          <Pressable
            key={department}
            onPress={() =>
              onChange({ ...filters, department: selected ? null : department })
            }
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`Filter by ${department}`}
            style={chipStyle(selected)}
          >
            <ThemedText type="smallBold" style={chipTextColor(selected)}>
              {department}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.two,
    paddingVertical: Spacing.half,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    minHeight: MinTouchTarget - 10,
    justifyContent: 'center',
  },
});
