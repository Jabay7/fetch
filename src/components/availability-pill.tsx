import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import type { Availability } from '@/data/types';
import { useTheme } from '@/hooks/use-theme';
import { availabilityLabel } from '@/lib/format';

const PALETTE: Record<Availability, { bg: ThemeColor; fg: ThemeColor }> = {
  IN_STOCK: { bg: 'successBg', fg: 'successText' },
  LOW_STOCK: { bg: 'warningBg', fg: 'warningText' },
  OUT_OF_STOCK: { bg: 'dangerBg', fg: 'dangerText' },
  UNKNOWN: { bg: 'neutralBg', fg: 'neutralText' },
};

export function AvailabilityPill({
  availability,
  size = 'sm',
}: {
  availability: Availability;
  size?: 'sm' | 'md';
}) {
  const theme = useTheme();
  const { bg, fg } = PALETTE[availability];
  const label = availabilityLabel(availability);

  return (
    <View
      accessibilityLabel={label}
      style={[
        styles.pill,
        size === 'md' && styles.pillMd,
        { backgroundColor: theme[bg] },
      ]}
    >
      <ThemedText
        type={size === 'md' ? 'smallBold' : 'caption'}
        style={[{ color: theme[fg] }, styles.label]}
      >
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two + Spacing.half,
    paddingVertical: Spacing.one,
    alignSelf: 'flex-start',
  },
  pillMd: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two - Spacing.half,
  },
  label: {
    fontWeight: 600,
  },
});
