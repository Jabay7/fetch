import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The FetchNFind mark.
 *
 * An "F" built from shelf rows: a vertical stem with two horizontal bars, so
 * it reads as the letter and as a run of store shelving at the same time. The
 * dot at the end of the top bar is the locator — the thing the app actually
 * gives you, sitting where the product is.
 *
 * Deliberately not a magnifying glass over a shopping cart. That combination
 * is the default for every product-search app and says "search" rather than
 * "we know where it is", which is the whole difference here.
 *
 * Drawn from primitives rather than an SVG asset so it stays crisp at any
 * size, recolours with the theme, needs no native dependency, and cannot 404.
 */
export function BrandMark({
  size = 32,
  tone = 'brand',
}: {
  size?: number;
  /** `brand` draws the indigo tile; `mono` inherits the current text colour. */
  tone?: 'brand' | 'mono';
}) {
  const theme = useTheme();
  const mono = tone === 'mono';
  const ink = mono ? theme.text : theme.onTint;

  // Proportions are expressed as fractions of the tile so the mark stays
  // optically identical from a 16px favicon to a 1024px app icon.
  const unit = size / 32;
  const stroke = Math.max(1.5, 4 * unit);
  const inset = 8 * unit;
  const stemHeight = size - inset * 2;
  const dot = Math.max(2.5, 5 * unit);

  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: Math.max(4, size * 0.26),
          backgroundColor: mono ? 'transparent' : theme.tint,
        },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {/* Stem */}
      <View
        style={{
          position: 'absolute',
          left: inset,
          top: inset,
          width: stroke,
          height: stemHeight,
          borderRadius: stroke / 2,
          backgroundColor: ink,
        }}
      />
      {/* Top shelf — the long one, carrying the locator dot */}
      <View
        style={{
          position: 'absolute',
          left: inset,
          top: inset,
          // Leave a clear gap before the locator dot: at favicon sizes a
          // tighter gap merges the two into one blunt bar and the mark stops
          // reading as "a point on a shelf".
          width: size - inset * 2 - dot * 2.4,
          height: stroke,
          borderRadius: stroke / 2,
          backgroundColor: ink,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: inset,
          top: inset + stroke / 2 - dot / 2,
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          backgroundColor: ink,
        }}
      />
      {/* Middle shelf */}
      <View
        style={{
          position: 'absolute',
          left: inset,
          top: inset + stemHeight * 0.42,
          width: (size - inset * 2) * 0.6,
          height: stroke,
          borderRadius: stroke / 2,
          backgroundColor: ink,
        }}
      />
    </View>
  );
}

/** Mark plus wordmark, for headers and the launch screen. */
export function BrandLockup({ size = 30 }: { size?: number }) {
  const theme = useTheme();
  return (
    <View style={styles.lockup} accessibilityRole="header" accessibilityLabel="FetchNFind">
      <BrandMark size={size} />
      <ThemedText style={[TypeScale.heading, { color: theme.text }]}>
        Fetch<ThemedText style={[TypeScale.heading, { color: theme.tint }]}>N</ThemedText>Find
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    overflow: 'hidden',
  },
  lockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
