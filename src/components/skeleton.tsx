import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Search-result skeleton rows: instant perceived response while a search is
 * in flight. Gentle opacity pulse only — respects reduced-motion sensibilities
 * by keeping the animation subtle and slow.
 */
export function ResultSkeleton({ rows = 4 }: { rows?: number }) {
  const theme = useTheme();
  // Lazy state (not a ref): stable across renders and readable during render,
  // which the React Compiler lint rules require.
  const [pulse] = useState(() => new Animated.Value(0.45));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.list} accessibilityLabel="Searching…" accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, i) => (
        <Animated.View
          key={i}
          style={[styles.row, { backgroundColor: theme.backgroundElement, opacity: pulse }]}
        >
          <View style={[styles.tile, { backgroundColor: theme.backgroundSelected }]} />
          <View style={styles.body}>
            <View style={[styles.line, styles.lineWide, { backgroundColor: theme.backgroundSelected }]} />
            <View style={[styles.line, styles.lineMid, { backgroundColor: theme.backgroundSelected }]} />
            <View style={[styles.line, styles.lineNarrow, { backgroundColor: theme.backgroundSelected }]} />
          </View>
          <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]} />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two + Spacing.half,
    paddingTop: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
  },
  tile: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
  },
  body: {
    flex: 1,
    gap: Spacing.one + 2,
  },
  line: {
    height: 11,
    borderRadius: Radius.pill,
  },
  lineWide: { width: '85%' },
  lineMid: { width: '55%' },
  lineNarrow: { width: '40%' },
  badge: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
  },
});
