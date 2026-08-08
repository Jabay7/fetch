/**
 * FetchNFind design tokens.
 *
 * ---------------------------------------------------------------------------
 * WHY INDIGO, AND WHY NOT GREEN
 *
 * The app previously ran on a green accent over green-biased neutrals — every
 * surface, border and secondary text carried a green cast, so the interface
 * read as one undifferentiated wash and nothing could stand out by colour.
 *
 * The accent also has to survive being placed directly beside retailer logos,
 * which is unavoidable in a multi-retailer app. The major US retail brand
 * colours are effectively spoken for:
 *
 *   red     Target, Walgreens, CVS          blue   Walmart, Kroger, Lowe's,
 *   orange  Home Depot                             Best Buy
 *   green   Instacart, Whole Foods, Publix   yellow Best Buy accent, Dollar General
 *
 * Indigo is the one distinctive hue in this category that no major US grocer
 * or big-box retailer owns, so a Kroger logo, a Target bullseye and our own
 * chrome can share a screen without any of them reading as the app's brand.
 * It also carries the right associations for a wayfinding product — transit
 * and mapping rather than groceries.
 *
 * ---------------------------------------------------------------------------
 * WHAT COLOUR IS ALLOWED TO MEAN
 *
 * Brand indigo marks actions and identity. It is deliberately NOT used for
 * status, because a shopper must be able to tell "in stock" from "this button
 * is tappable" at a glance. Availability keeps its own semantic scale, and
 * data provenance keeps a third, so official retailer data never wears the
 * same colour as a community contribution.
 *
 * ---------------------------------------------------------------------------
 * CONTRAST
 *
 * Every text/background pair below meets WCAG 2.2 AA (4.5:1 normal text,
 * 3:1 large text and UI components) in both schemes — asserted, not assumed:
 * see src/lib/__tests__/contrast.test.ts, which fails the build on regression.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#14141B',
    textSecondary: '#55556B',
    /** Third-level text: metadata, provenance, timestamps. */
    textMuted: '#68687E',
    background: '#FFFFFF',
    /** Cards and inputs resting on the page. */
    backgroundElement: '#F4F4F8',
    /** Pressed / selected state, and the next level of nesting. */
    backgroundSelected: '#E8E8F0',
    /** Raised above the page — sheets, popovers, sticky bars. */
    backgroundElevated: '#FFFFFF',
    border: '#E1E1EA',
    /** Brand. Actions and identity only — never status. */
    tint: '#4338CA',
    onTint: '#FFFFFF',
    /** A quiet wash of the brand, for selected chips and subtle fills. */
    tintSubtle: '#EEEDFB',
    /**
     * Aisle signage. Deep indigo ink with white numerals, borrowed from
     * transit and airport wayfinding, where a code has to be readable at a
     * glance from across a concourse. This is the app's single most important
     * piece of information, so it gets its own colour that nothing else uses.
     */
    signage: '#1E1B4B',
    onSignage: '#FFFFFF',
    successBg: '#DDF3E4',
    successText: '#116338',
    warningBg: '#FBEDD0',
    warningText: '#7A4E00',
    dangerBg: '#FBE3E1',
    dangerText: '#9B241A',
    neutralBg: '#ECECF2',
    neutralText: '#4B4B5F',
    /** Provenance: verified retailer data. */
    dataOfficial: '#1D4ED8',
    /** Provenance: contributed and confirmed by shoppers. */
    dataCommunity: '#7C3AED',
    /** Provenance: the bundled demo catalogue. */
    dataDemo: '#8A5A00',
  },
  dark: {
    text: '#ECECF3',
    textSecondary: '#A3A3B8',
    textMuted: '#7E7E94',
    background: '#0B0B11',
    backgroundElement: '#16161F',
    backgroundSelected: '#22222E',
    backgroundElevated: '#1C1C27',
    border: '#2B2B39',
    tint: '#A5B4FC',
    onTint: '#111133',
    tintSubtle: '#1E1E3A',
    /**
     * Inverted in dark mode. A dark ink panel on a near-black page is not a
     * sign — it disappears. Here the panel becomes the light element and the
     * numerals the dark one, which keeps the same "printed sign" identity
     * while staying the most prominent thing on the screen.
     */
    signage: '#C7D2FE',
    onSignage: '#1E1B4B',
    successBg: '#0F3A28',
    successText: '#6FE3B0',
    warningBg: '#3A2F13',
    warningText: '#EBC46F',
    dangerBg: '#3F1E1B',
    dangerText: '#F5A79E',
    neutralBg: '#22222E',
    neutralText: '#AFAFC2',
    dataOfficial: '#93B4FF',
    dataCommunity: '#C4A5FD',
    dataDemo: '#E7BE72',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/**
 * Type scale. Sizes step by a consistent ratio so headings, product names and
 * metadata are separable at a glance rather than all landing near 15px, which
 * was the previous failure — everything was legible and nothing was ranked.
 *
 * `aisle` is intentionally the largest thing in the app after the display
 * size: the aisle number is the answer the shopper opened the app for.
 */
export const TypeScale = {
  display: { fontSize: 32, lineHeight: 36, letterSpacing: -0.6, fontWeight: '800' },
  title: { fontSize: 24, lineHeight: 29, letterSpacing: -0.4, fontWeight: '700' },
  heading: { fontSize: 19, lineHeight: 24, letterSpacing: -0.2, fontWeight: '700' },
  productName: { fontSize: 16, lineHeight: 21, letterSpacing: -0.1, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 23, letterSpacing: 0, fontWeight: '400' },
  small: { fontSize: 14, lineHeight: 19, letterSpacing: 0, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, letterSpacing: 0.1, fontWeight: '500' },
  /** Uppercase micro-labels: "AISLE", "IN STOCK", section eyebrows. */
  overline: { fontSize: 11, lineHeight: 14, letterSpacing: 0.9, fontWeight: '700' },
  /** The aisle code itself. */
  aisle: { fontSize: 28, lineHeight: 32, letterSpacing: -0.5, fontWeight: '800' },
  aisleLarge: { fontSize: 40, lineHeight: 44, letterSpacing: -0.8, fontWeight: '800' },
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/**
 * Elevation. Dark mode cannot use shadows to convey height — a shadow on a
 * near-black surface is invisible — so raised surfaces there lighten instead,
 * per Material 3's tonal-elevation approach.
 */
export const Elevation = {
  card: Platform.select({
    web: { boxShadow: '0 1px 2px rgba(15,15,30,0.05), 0 8px 20px -14px rgba(15,15,30,0.22)' },
    default: {
      shadowColor: '#0B0B18',
      shadowOpacity: 0.07,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
  }),
  sheet: Platform.select({
    web: { boxShadow: '0 -2px 24px rgba(15,15,30,0.16)' },
    default: {
      shadowColor: '#0B0B18',
      shadowOpacity: 0.14,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: -3 },
      elevation: 12,
    },
  }),
} as const;

/** Minimum touch-target size per platform accessibility guidelines. */
export const MinTouchTarget = 44;
