import { describe, expect, it, vi, afterEach } from 'vitest';
import { buildCoverTheme, canRefreshCoverTheme, refreshCoverTheme } from '../src/desktopLyrics/coverTheme';
import { DEFAULT_THEME } from '../src/services/baseThemes';
import { getContrastRatio, getHueDistance, hexToHsl } from '../src/utils/themeColorMath';
import { extractRepresentativeColors } from '../src/utils/colorExtractor';
import { generateBuiltinDualTheme } from '../src/utils/builtinTheme/generateBuiltinDualTheme';

// test/desktopCoverTheme.test.ts — artwork identity, readability, stable colors, and unreadable covers.
afterEach(() => vi.unstubAllGlobals());
describe('desktop cover themes', () => {
  it('keeps the cover hue and readable foreground across colored artwork', () => {
    for (const color of ['#dc5432', '#246edc', '#26c076', '#b940ca']) {
      const theme = buildCoverTheme([color]);
      expect(getHueDistance(hexToHsl(theme.backgroundColor)!.h, hexToHsl(color)!.h)).toBeLessThan(3);
      expect(getContrastRatio(theme.primaryColor, theme.backgroundColor)).toBeGreaterThanOrEqual(9);
      expect(getContrastRatio(theme.secondaryColor, theme.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('changes the theme with the artwork and reproduces it when returning', () => {
    const red = buildCoverTheme(['#dc5432']), blue = buildCoverTheme(['#246edc']);
    expect(red.backgroundColor).not.toBe(blue.backgroundColor);
    expect(buildCoverTheme(['#dc5432'])).toEqual(red);
  });
  it('uses the default only for missing or malformed covers', () => {
    for (const colors of [[], ['invalid']]) expect(buildCoverTheme(colors)).toBe(DEFAULT_THEME);
  });
  it('uses readable neutral colors for monochrome artwork instead of a colored fallback', () => {
    const theme = buildCoverTheme(['#000000', '#ffffff', '#888888']);
    expect(theme).not.toBe(DEFAULT_THEME);
    for (const color of [theme.backgroundColor, theme.primaryColor, theme.accentColor, theme.secondaryColor]) expect(hexToHsl(color)!.s).toBe(0);
    expect(getContrastRatio(theme.primaryColor, theme.backgroundColor)).toBeGreaterThan(9);
    expect(getContrastRatio(theme.secondaryColor, theme.backgroundColor)).toBeGreaterThan(4.5);
  });
  it('refreshes colored covers with distinct readable accents through the original generator', () => {
    let seed = 977;
    const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
    for (const colors of [['#dc5432'], ['#246edc', '#dc5432'], ['#4b594c']]) {
      let previous = buildCoverTheme(colors);
      // Compare the complete generated palette; dark, near-neutral RGB quantization can shift measured HSL hue.
      expect(refreshCoverTheme(colors, previous, () => .9)).toEqual(generateBuiltinDualTheme({ coverColors: colors, random: () => .9 }).dark);
      for (let index = 0; index < 20; index++) {
        const next = refreshCoverTheme(colors, previous, random);
        expect(getHueDistance(hexToHsl(next.accentColor)!.h, hexToHsl(previous.accentColor)!.h)).toBeGreaterThanOrEqual(20);
        expect(getContrastRatio(next.primaryColor, next.backgroundColor)).toBeGreaterThanOrEqual(9);
        expect(getContrastRatio(next.secondaryColor, next.backgroundColor)).toBeGreaterThanOrEqual(4.5);
        previous = next;
      }
    }
  });
  it('escapes the unchanged automatic duotone even when every random draw repeats .5', () => {
    const colors = ['#246edc', '#dc5432'], automatic = buildCoverTheme(colors);
    const next = refreshCoverTheme(colors, automatic, () => .5);
    expect(next.accentColor).not.toBe(automatic.accentColor);
    expect(getHueDistance(hexToHsl(next.accentColor)!.h, hexToHsl(automatic.accentColor)!.h)).toBeGreaterThanOrEqual(20);
  });
  it('does not manufacture colorful refreshes for neutral, invalid or missing cover colors', () => {
    const random = vi.fn();
    for (const colors of [[], ['invalid'], ['#000000', '#ffffff', '#888888']]) {
      const previous = buildCoverTheme(colors);
      expect(canRefreshCoverTheme(colors)).toBe(false);
      expect(refreshCoverTheme(colors, previous, random)).toBe(previous);
    }
    expect(random).not.toHaveBeenCalled();
  });
  it('resolves a fallback when canvas refuses cross-origin cover pixels', async () => {
    vi.stubGlobal('Image', class {
      onload?: () => void;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    });
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ drawImage: () => {}, getImageData: () => { throw new Error('SecurityError'); } }) }) });
    expect(await extractRepresentativeColors('https://unreadable.example/cover.png')).toEqual([]);
  });
});
