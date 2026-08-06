/**
 * Design tokens. All text/background pairs meet WCAG AA (4.5:1) in both
 * schemes; the availability pill palettes pair dark text on light tints
 * (and vice versa in dark mode) so status never relies on color alone —
 * every pill also carries a text label.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#171D1A',
    textSecondary: '#49564F',
    background: '#FFFFFF',
    backgroundElement: '#F3F6F4',
    backgroundSelected: '#E3EAE6',
    border: '#D9E1DC',
    tint: '#0B6B50',
    onTint: '#FFFFFF',
    successBg: '#DCF2E7',
    successText: '#0A5C42',
    warningBg: '#FCEFCF',
    warningText: '#6E4E00',
    dangerBg: '#FBE4E1',
    dangerText: '#8C231A',
    neutralBg: '#ECF0EE',
    neutralText: '#42504A',
  },
  dark: {
    text: '#E8EDEA',
    textSecondary: '#A4B1AA',
    background: '#0E1210',
    backgroundElement: '#1A211D',
    backgroundSelected: '#242E28',
    border: '#2C3630',
    tint: '#4CC79A',
    onTint: '#04281C',
    successBg: '#143D2F',
    successText: '#7ADBB4',
    warningBg: '#3D3113',
    warningText: '#E7C36B',
    dangerBg: '#42201C',
    dangerText: '#F2A69D',
    neutralBg: '#232B27',
    neutralText: '#ADB9B2',
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

/** Minimum touch-target size per platform accessibility guidelines. */
export const MinTouchTarget = 44;
