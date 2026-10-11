import { Platform } from 'react-native';

// Volt Graphite (design system "Trainer Manager", 11 Oct 2026).
// C is filled from the active palette by applyTheme(); the root layout remounts the app when it changes.
const dark = {
  bg: '#0E0F10',
  surface: '#17191B',
  surface2: '#202326',      // surface-raised: chips, inputs, pressed rows
  line: '#2A2D31',
  fg: '#F2F3EE',            // ink
  muted: '#9A9EA4',         // ink-muted
  brand: '#C9F24B',         // Volt: one filled spot per screen (primary button / hero)
  brandInk: '#141A00',      // text on brand
  accent: '#C9F24B',        // brand-strong: icons, links, selected tabs, borders on focus
  accentSoft: '#252D10',    // brand-soft
  infoFg: '#A9C4F5', infoBg: '#1B2A45',
  warnFg: '#F5B585', warnBg: '#3A2414',
  cautionFg: '#F2D46B', cautionBg: '#33300F',
  badFg: '#F59A92', badBg: '#3A1A1A',
  scrim: 'rgba(0,0,0,0.6)',
};
const light: typeof dark = {
  bg: '#F5F5F2',
  surface: '#FFFFFF',
  surface2: '#ECECE7',
  line: '#DEDED8',
  fg: '#111214',
  muted: '#5D6066',
  brand: '#C9F24B',
  brandInk: '#141A00',
  accent: '#4D6B00',
  accentSoft: '#EEF9C6',
  infoFg: '#2F5BB7', infoBg: '#E3ECFC',
  warnFg: '#9A4A0B', warnBg: '#FDEBDC',
  cautionFg: '#7A5F00', cautionBg: '#FBF3CF',
  badFg: '#B3261E', badBg: '#FCE4E2',
  scrim: 'rgba(17,18,20,0.45)',
};

export type Scheme = 'dark' | 'light';
export const C = { ...dark, scheme: 'dark' as Scheme };
export function applyTheme(s: Scheme) {
  Object.assign(C, s === 'light' ? light : dark, { scheme: s });
}

// LINE's own button colours (LINE brand rules). Only on the LINE sign-in button.
export const LINE_GREEN = '#06C755';
export const LINE_INK = '#FFFFFF';

// Web loads the Thai fonts from Google Fonts (see app/_layout); phones use the system font for now.
export const F = {
  body: Platform.OS === 'web' ? '"IBM Plex Sans Thai", system-ui, sans-serif' : undefined,
  display: Platform.OS === 'web' ? 'Anuphan, "IBM Plex Sans Thai", system-ui, sans-serif' : undefined,
};

// radius-sm 8 · radius-md 12 · radius-lg 20 · pill
export const R = { badge: 8, field: 12, card: 20, pill: 999 };
// space-1..8
export const S = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 } as const;
