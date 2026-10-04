import { DEFAULT_THEME } from '../services/baseThemes';
import type { Theme } from '../types';

// src/desktopLyrics/desktopTheme.ts — desktop colours without changing Folia's renderer defaults or animation settings.
export const DESKTOP_THEME_COLORS = {
  light: '#66CCFF', primary: '#4054C7', dark: '#232A66', highlight: '#27A9D6',
  background: '#0B0D17', text: '#F4F7FF', secondary: '#ADB9D8',
} as const;

export const DESKTOP_DEFAULT_THEME: Theme = {
  ...DEFAULT_THEME,
  name: '洛天依 × Ado',
  backgroundColor: DESKTOP_THEME_COLORS.background,
  primaryColor: DESKTOP_THEME_COLORS.text,
  accentColor: DESKTOP_THEME_COLORS.light,
  secondaryColor: DESKTOP_THEME_COLORS.secondary,
};
