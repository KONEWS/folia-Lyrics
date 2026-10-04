import { DESKTOP_DEFAULT_THEME } from './desktopTheme';
import { generateBuiltinDualTheme } from '../utils/builtinTheme/generateBuiltinDualTheme';
import { getContrastRatio, hexToHsl } from '../utils/themeColorMath';
import type { Theme } from '../types';

// src/desktopLyrics/coverTheme.ts — reuse Folia's cover palette generator with stable choices.
const NEUTRAL_COVER_THEME = { ...DESKTOP_DEFAULT_THEME, name: 'Cover Neutral', backgroundColor: '#121212', primaryColor: '#f4f4f4', accentColor: '#d8d8d8', secondaryColor: '#a3a3a3' };
const validCoverColors = (colors: string[]) => colors.filter(color => hexToHsl(color) !== null).slice(0, 5);
export const canRefreshCoverTheme = (colors: string[]) => validCoverColors(colors).some(color => hexToHsl(color)!.s >= .08);
export function buildCoverTheme(colors: string[]) {
  const valid = validCoverColors(colors);
  if (!valid.length) return DESKTOP_DEFAULT_THEME;
  if (valid.every(color => hexToHsl(color)!.s < .08)) return NEUTRAL_COVER_THEME;
  // Fixed choices keep the same artwork consistent after pause, reload, and returning to a song.
  return generateBuiltinDualTheme({ coverColors: valid, random: () => .5, preserveCoverHue: true }).dark;
}

// Refresh depth and brightness through the original contrast solver while retaining the artwork's dominant hue.
export function refreshCoverTheme(colors: string[], previous: Theme, random = Math.random) {
  const valid = validCoverColors(colors);
  if (!canRefreshCoverTheme(valid)) return buildCoverTheme(valid);
  let best = previous, bestDistance = -1;
  const candidate = (source: () => number) => {
    const theme = generateBuiltinDualTheme({ coverColors: valid, random: source, preserveCoverHue: true }).dark;
    const distance = Math.max(getContrastRatio(theme.accentColor, previous.accentColor), getContrastRatio(theme.backgroundColor, previous.backgroundColor));
    if (distance > bestDistance) { best = theme; bestDistance = distance; }
    return distance >= 1.12;
  };
  for (let attempt = 0; attempt < 8; attempt++) if (candidate(random)) return best;
  // A constant random stream can repeat the same brightness; these bounded choices still produce a visible refresh.
  for (const choice of [.1, .9, .75]) if (candidate(() => choice)) return best;
  return best;
}
