import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';

/**
 * Retailer identity mark.
 *
 * We do not ship retailer logo artwork. Trademark licensing differs per brand
 * and we will not bundle assets whose usage rights we have not verified, so
 * the component renders a verified logo only when one has been supplied for
 * that retailer (`logoUrl`, sourced from the database alongside its usage
 * basis) and otherwise draws a monogram.
 *
 * The monogram uses the retailer's own brand colour rather than a colour
 * hashed from its name. That was the previous behaviour and it actively
 * worked against recognition — Target rendered teal, Walmart magenta — when
 * the entire job of this component is to let someone spot their store in a
 * list without reading. Colour alone is not a trademark and identifying a
 * retailer by its known colour is ordinary nominative use; we still never
 * reproduce a logo, wordmark or any styling that could imply endorsement.
 */

/**
 * Primary brand colours, for identification only. Chosen so white text clears
 * 4.5:1 on each — enforced by the contrast test, which fails the build if a
 * future addition is too light.
 */
const BRAND_COLORS: Record<string, string> = {
  target: '#CC0000',
  walmart: '#005CB9',
  kroger: '#0B4EA2',
  marianos: '#00653A',
  ralphs: '#C8102E',
  'king-soopers': '#0B4EA2',
  'fred-meyer': '#C8102E',
  'harris-teeter': '#00703C',
  qfc: '#00653A',
  smiths: '#C8102E',
  'food-4-less': '#C8102E',
  dillons: '#0B4EA2',
  'frys-food': '#C8102E',
  'city-market': '#00703C',
  walgreens: '#C8102E',
  cvs: '#CC0000',
  'rite-aid': '#00529B',
  'best-buy': '#00397C',
  costco: '#005DAA',
  'sams-club': '#0067A0',
  'home-depot': '#C25400',
  lowes: '#004990',
  menards: '#00693E',
  'ace-hardware': '#C8102E',
  'true-value': '#B01F24',
  publix: '#00703C',
  aldi: '#00447C',
  'whole-foods': '#00674B',
  'trader-joes': '#B8261C',
  safeway: '#C8102E',
  albertsons: '#00529B',
  'jewel-osco': '#C8102E',
  meijer: '#B8121B',
  heb: '#B8121B',
  wegmans: '#00653A',
  'hy-vee': '#C8102E',
  sprouts: '#00703C',
  petsmart: '#00529B',
  petco: '#00447C',
  staples: '#B8121B',
  'office-depot': '#C8102E',
  autozone: '#C8102E',
  oreilly: '#00529B',
  'advance-auto': '#B8121B',
  dicks: '#00693E',
  ulta: '#B8121B',
  sephora: '#2B2B2B',
};

/** Every slug we carry a brand colour for. Exported so tests can hold all of
 *  them to the same contrast bar. */
export const RETAILER_SLUGS = Object.keys(BRAND_COLORS);

/** Fallback for retailers we have no brand colour for — deliberately neutral. */
const NEUTRAL = '#4B4B5F';

export function retailerColor(slug?: string, name?: string): string {
  if (slug && BRAND_COLORS[slug]) return BRAND_COLORS[slug];
  // Try a loose match on the name, so a banner we know by a different slug
  // still gets its colour rather than falling straight to grey.
  const key = (name ?? '').toLowerCase().replace(/[^a-z]/g, '');
  for (const [candidate, color] of Object.entries(BRAND_COLORS)) {
    if (key && candidate.replace(/[^a-z]/g, '') === key) return color;
  }
  return NEUTRAL;
}

export function retailerInitials(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function RetailerLogo({
  name,
  slug,
  logoUrl,
  size = 44,
}: {
  name: string;
  slug?: string;
  /** A logo whose usage rights have been verified and recorded. */
  logoUrl?: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const background = retailerColor(slug, name);

  if (logoUrl && !failed) {
    return (
      <View
        style={[styles.mark, styles.logoPlate, { width: size, height: size }]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        <Image
          source={{ uri: logoUrl }}
          style={{ width: size * 0.78, height: size * 0.78 }}
          contentFit="contain"
          transition={120}
          cachePolicy="memory-disk"
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
          alt=""
        />
      </View>
    );
  }

  return (
    <View
      style={[styles.mark, { width: size, height: size, backgroundColor: background }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <ThemedText
        style={{
          color: '#FFFFFF',
          fontSize: size * 0.36,
          lineHeight: size * 0.46,
          fontWeight: '700',
          letterSpacing: -0.3,
        }}
      >
        {retailerInitials(name)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  // Real logos are drawn on white so brand artwork reads correctly in dark
  // mode instead of vanishing into the page.
  logoPlate: {
    backgroundColor: '#FFFFFF',
  },
});
