import { DEFAULT_THEME } from '../services/baseThemes';
import { generateBuiltinDualTheme } from '../utils/builtinTheme/generateBuiltinDualTheme';
import { getHueDistance, hexToHsl } from '../utils/themeColorMath';
import type { Theme } from '../types';

// src/desktopLyrics/coverTheme.ts — reuse Folia's cover palette generator with stable choices.
const NEUTRAL_COVER_THEME = { ...DEFAULT_THEME, name: 'Cover Neutral', backgroundColor: '#121212', primaryColor: '#f4f4f4', accentColor: '#d8d8d8', secondaryColor: '#a3a3a3' };
const validCoverColors = (colors: string[]) => colors.filter(color => hexToHsl(color) !== null).slice(0, 5);
export const canRefreshCoverTheme = (colors: string[]) => validCoverColors(colors).some(color => hexToHsl(color)!.s >= .08);
export function buildCoverTheme(colors: string[]) {
  const valid = validCoverColors(colors);
  if (!valid.length) return DEFAULT_THEME;
  if (valid.every(color => hexToHsl(color)!.s < .08)) return NEUTRAL_COVER_THEME;
  // Fixed choices keep the same artwork consistent after pause, reload, and returning to a song.
  return generateBuiltinDualTheme({ coverColors: valid, random: () => .5 }).dark;
}

// Reuse the original harmony generator, retrying near-identical duotone accents rather than editing its colors.
export function refreshCoverTheme(colors: string[], previous: Theme, random = Math.random) {
  const valid = validCoverColors(colors);
  if (!canRefreshCoverTheme(valid)) return buildCoverTheme(valid);
  const previousHue = hexToHsl(previous.accentColor)!.h;
  let best = previous, bestDistance = -1;
  const candidate = (source: () => number) => {
    const theme = generateBuiltinDualTheme({ coverColors: valid, random: source }).dark;
    const distance = getHueDistance(hexToHsl(theme.accentColor)!.h, previousHue);
    if (distance > bestDistance) { best = theme; bestDistance = distance; }
    return distance >= 20;
  };
  for (let attempt = 0; attempt < 8; attempt++) if (candidate(random)) return best;
  // A constant/random stream can repeatedly choose the same harmony; these original-generator choices bound the fallback.
  for (const choice of [.1, .9, .75]) if (candidate(() => choice)) return best;
  return best;
}
