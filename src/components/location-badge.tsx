import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing, TypeScale } from '@/constants/theme';
import type { ProductLocation } from '@/data/types';
import { useTheme } from '@/hooks/use-theme';

/**
 * The aisle callout — FetchNFind's signature component and the answer the
 * shopper opened the app for.
 *
 * Visual language is borrowed from transit and airport wayfinding: a printed
 * sign, with a small uppercase label above a large code, in ink that nothing
 * else in the app uses. A gate number works because it is unmistakably a gate
 * number from across a concourse; an aisle number should work the same way
 * from arm's length in a store.
 *
 * PRECISION EARNS PROMINENCE. Only a real aisle gets the sign treatment. A
 * department is a genuinely weaker answer, so it renders as a quiet chip
 * instead — a shopper must never mistake "somewhere in Oral Care" for
 * "Aisle G18", and matching their visual weight would invite exactly that.
 */

export type LocationPrecision = 'EXACT' | 'AISLE' | 'DEPARTMENT' | 'STORE_ONLY' | 'UNKNOWN';

export function locationPrecision(location?: ProductLocation): LocationPrecision {
  if (!location) return 'UNKNOWN';
  if (location.aisle && (location.bay || location.shelf)) return 'EXACT';
  if (location.aisle) return 'AISLE';
  if (location.department || location.section) return 'DEPARTMENT';
  return 'STORE_ONLY';
}

/** What a screen reader should say, as one sentence rather than fragments. */
export function locationSpeech(location?: ProductLocation): string {
  const precision = locationPrecision(location);
  switch (precision) {
    case 'EXACT': {
      const detail = [
        location?.bay ? `bay ${location.bay}` : null,
        location?.shelf ? `shelf ${location.shelf}` : null,
      ]
        .filter(Boolean)
        .join(', ');
      return `Aisle ${location?.aisle}, ${detail}`;
    }
    case 'AISLE':
      return `Aisle ${location?.aisle}`;
    case 'DEPARTMENT':
      return `In ${location?.section ?? location?.department}. Exact aisle not available`;
    case 'STORE_ONLY':
      return 'Carried at this store. Location not available';
    default:
      return 'Location not available';
  }
}

export function LocationBadge({
  location,
  size = 'sm',
}: {
  location?: ProductLocation;
  size?: 'sm' | 'lg';
}) {
  const theme = useTheme();
  const precision = locationPrecision(location);
  const large = size === 'lg';
  const label = locationSpeech(location);

  // Aisle codes are opaque per-store strings ("G18", "12", "A-4"), so the type
  // shrinks to fit rather than truncating a code that must be read exactly.
  if (precision === 'EXACT' || precision === 'AISLE') {
    const code = location?.aisle ?? '';
    const scale = large ? TypeScale.aisleLarge : TypeScale.aisle;
    const fontSize = code.length > 4 ? scale.fontSize * 0.7 : scale.fontSize;
    const detail = [
      location?.bay ? `Bay ${location.bay}` : null,
      location?.shelf ? `Shelf ${location.shelf}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    return (
      <View
        accessible
        accessibilityLabel={label}
        style={[
          styles.sign,
          {
            backgroundColor: theme.signage,
            borderRadius: large ? Radius.lg : Radius.md,
            paddingHorizontal: large ? Spacing.four : Spacing.three,
            paddingVertical: large ? Spacing.three : Spacing.two,
            minWidth: large ? 140 : 76,
          },
        ]}
      >
        <ThemedText style={[TypeScale.overline, styles.overline, { color: theme.onSignage }]}>
          AISLE
        </ThemedText>
        <ThemedText
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{
            color: theme.onSignage,
            fontSize,
            lineHeight: fontSize + 4,
            fontWeight: '800',
            letterSpacing: scale.letterSpacing,
            fontFamily: Fonts.rounded,
          }}
        >
          {code}
        </ThemedText>
        {large && detail ? (
          <ThemedText
            style={[TypeScale.caption, { color: theme.onSignage, opacity: 0.82, marginTop: 2 }]}
          >
            {detail}
          </ThemedText>
        ) : null}
      </View>
    );
  }

  // Everything below is a weaker answer and is styled to look like one.
  const quiet = {
    DEPARTMENT: {
      overline: 'SECTION',
      value: location?.section ?? location?.department ?? '',
      color: theme.text,
      background: theme.backgroundSelected,
      dashed: false,
    },
    STORE_ONLY: {
      overline: 'IN STORE',
      value: 'Carried here',
      color: theme.textSecondary,
      background: theme.backgroundElement,
      dashed: false,
    },
    UNKNOWN: {
      overline: 'AISLE',
      value: 'Unavailable',
      color: theme.textMuted,
      background: 'transparent',
      dashed: true,
    },
  }[precision];

  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[
        styles.sign,
        {
          backgroundColor: quiet.background,
          borderRadius: large ? Radius.lg : Radius.md,
          paddingHorizontal: large ? Spacing.four : Spacing.three,
          paddingVertical: large ? Spacing.three : Spacing.two,
          minWidth: large ? 140 : 76,
          borderWidth: quiet.dashed ? 1 : 0,
          borderColor: theme.border,
          borderStyle: quiet.dashed ? 'dashed' : 'solid',
        },
      ]}
    >
      <ThemedText style={[TypeScale.overline, styles.overline, { color: theme.textMuted }]}>
        {quiet.overline}
      </ThemedText>
      <ThemedText
        numberOfLines={2}
        style={[
          large ? TypeScale.heading : TypeScale.productName,
          { color: quiet.color, textAlign: 'center' },
        ]}
      >
        {quiet.value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  sign: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  overline: {
    opacity: 0.75,
    marginBottom: 1,
  },
});
