/**
 * Contrast guardrails. Locks in the WCAG ratios the design depends on, so a
 * future palette tweak can't silently ship unreadable text or invisible
 * icons in either theme.
 */

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

// Kept in sync with src/components/retailer-avatar.tsx.
const AVATAR_PALETTE = [
  '#0B6B50',
  '#1D4ED8',
  '#B45309',
  '#9333EA',
  '#BE123C',
  '#0E7490',
  '#3F6212',
  '#A21CAF',
];

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
