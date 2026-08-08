/**
 * Contrast guardrails. Locks in the WCAG ratios the design depends on, so a
 * future palette tweak can't silently ship unreadable text or invisible
 * icons in either theme.
 */

import { RETAILER_SLUGS, retailerColor } from '@/components/retailer-logo';
import { Colors } from '@/constants/theme';
import { categoryArt, type ProductCategory } from '@/lib/product-imagery';

function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Hue angle in degrees, 0-360. */
function hue(hex: string): number {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  return (h * 60 + 360) % 360;
}

/** Shortest angular distance between two hues, 0-180. */
function hueDistance(a: string, b: string): number {
  const diff = Math.abs(hue(a) - hue(b)) % 360;
  return diff > 180 ? 360 - diff : diff;
}

// Every retailer brand colour must carry white initials legibly. Imported
// rather than duplicated, so adding a retailer cannot skip this check.
const AVATAR_PALETTE = Array.from(
  new Set(RETAILER_SLUGS.map((slug) => retailerColor(slug)))
);

const CATEGORIES: ProductCategory[] = [
  'produce',
  'dairy',
  'meat',
  'frozen',
  'bakery',
  'pantry',
  'snacks',
  'drinks',
  'household',
  'cleaning',
  'pharmacy',
  'personal-care',
  'pet',
  'baby',
  'hardware',
  'electronics',
  'other',
];

describe('contrast: core text tokens', () => {
  it.each(['light', 'dark'] as const)('%s theme body text meets AA (4.5:1)', (scheme) => {
    const c = Colors[scheme];
    expect(contrast(c.text, c.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.text, c.backgroundElement)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.textSecondary, c.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.textSecondary, c.backgroundElement)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['light', 'dark'] as const)('%s theme tint pairs meet AA', (scheme) => {
    const c = Colors[scheme];
    expect(contrast(c.onTint, c.tint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.successText, c.successBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.warningText, c.warningBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.dangerText, c.dangerBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.neutralText, c.neutralBg)).toBeGreaterThanOrEqual(4.5);
  });

  // The aisle badge is the whole point of the product; it must be the most
  // legible thing on screen, not merely adequate.
  it.each(['light', 'dark'] as const)('%s theme aisle signage exceeds AAA (7:1)', (scheme) => {
    const c = Colors[scheme];
    expect(contrast(c.onSignage, c.signage)).toBeGreaterThanOrEqual(7);
  });

  it.each(['light', 'dark'] as const)('%s theme signage separates from the page', (scheme) => {
    const c = Colors[scheme];
    // A sign that blends into the surface behind it is not a sign.
    expect(contrast(c.signage, c.background)).toBeGreaterThanOrEqual(3);
    expect(contrast(c.signage, c.backgroundElement)).toBeGreaterThanOrEqual(3);
  });

  it.each(['light', 'dark'] as const)('%s theme muted text meets AA', (scheme) => {
    const c = Colors[scheme];
    expect(contrast(c.textMuted, c.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.textMuted, c.backgroundElement)).toBeGreaterThanOrEqual(4.5);
  });

  // Provenance colours carry meaning, so they must be readable — and distinct
  // from each other, or "official" and "community" become the same signal.
  it.each(['light', 'dark'] as const)('%s theme provenance colours are readable', (scheme) => {
    const c = Colors[scheme];
    for (const token of [c.dataOfficial, c.dataCommunity, c.dataDemo]) {
      expect(contrast(token, c.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token, c.backgroundElement)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(['light', 'dark'] as const)('%s theme brand never doubles as status', (scheme) => {
    const c = Colors[scheme];
    // Brand and status must be separable by hue, not merely by lightness — a
    // shopper has to tell "in stock" from "this is tappable" at a glance, and
    // two colours of similar hue read as the same signal however dark one is.
    // Contrast ratio is the wrong tool here: it only measures lightness.
    for (const status of [c.successText, c.warningText, c.dangerText]) {
      expect(hueDistance(c.tint, status)).toBeGreaterThanOrEqual(45);
    }
  });
});

describe('contrast: retailer avatars', () => {
  it.each(AVATAR_PALETTE)('white initials on %s meet AA', (background) => {
    expect(contrast('#FFFFFF', background)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('contrast: category illustrations', () => {
  it.each(CATEGORIES)('%s glyph is visible on the light surface (3:1)', (category) => {
    const art = categoryArt(category);
    expect(contrast(art.tint, Colors.light.backgroundSelected)).toBeGreaterThanOrEqual(3);
  });

  it.each(CATEGORIES)('%s glyph is visible on the dark surface (3:1)', (category) => {
    const art = categoryArt(category);
    expect(contrast(art.tintDark, Colors.dark.backgroundSelected)).toBeGreaterThanOrEqual(3);
  });
});
