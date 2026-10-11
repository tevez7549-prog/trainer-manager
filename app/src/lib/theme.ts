import { Platform } from 'react-native';

// Same palette as the approved prototype
export const C = {
  bg: '#f2f4f1',
  surface: '#ffffff',
  surface2: '#f6f8f7',
  fg: '#15211c',
  muted: '#55645d',
  line: '#dfe5e1',
  accent: '#0b6b4d',
  accentFg: '#ffffff',
  accentSoft: '#e3f1ea',
  accentInk: '#0b4d38',
  warnBg: '#fde7d6',
  warnFg: '#8a3d0c',
  badBg: '#fbe1e1',
  badFg: '#9b1c1c',
  infoBg: '#e3ecfb',
  infoFg: '#1f4aa8',
};

// Web loads the Thai fonts from Google Fonts (see app/_layout); phones use the system font for now.
export const F = {
  body: Platform.OS === 'web' ? '"IBM Plex Sans Thai", system-ui, sans-serif' : undefined,
  display: Platform.OS === 'web' ? 'Anuphan, "IBM Plex Sans Thai", system-ui, sans-serif' : undefined,
};

export const R = { card: 16, field: 12, pill: 999 };
