import type { Line, SubtitleContentMode, Theme } from '../types';
import { resolveThemeFontStack, resolveThemeFontWeight, resolveThemeTranslationFontStack } from '../utils/fontStacks';
import { resolveLyricAlternateText } from '../utils/lyrics/alternateText';
import { getLineBackgroundVocals } from '../components/visualizer/harmonyRuntime';

// src/desktopLyrics/desktopFonts.ts — prepare the fonts used by this song before any renderer measures or rasterizes it.
export type DesktopFontRequest = { font: string; text: string };
export type DesktopFontInput = { lines: Line[]; theme: Theme; subtitleTheme: Theme; title: string; artist: string;
  hideTranslationSubtitle?: boolean; subtitleContentMode?: SubtitleContentMode; showHarmonySubtitle?: boolean };
const pending = new WeakMap<FontFaceSet, Map<string, Promise<void>>>();
const uniqueText = (values: string[]) => [...new Set(values.join(''))].join('') || ' ';

// Include real code points, not a Latin probe, so unicode-range fonts needed by later lyric lines are loaded too.
export function desktopFontRequests(input: DesktopFontInput): DesktopFontRequest[] {
  const { lines, theme, subtitleTheme } = input;
  const main = [input.title, input.artist, theme.name, theme.description || ''];
  const subtitle: string[] = [], contentMode = input.subtitleContentMode ?? 'translation';
  for (const line of lines) {
    main.push(line.fullText, ...line.words.map(word => word.text));
    subtitle.push(line.fullText, resolveLyricAlternateText(line, contentMode) || '');
    if (input.showHarmonySubtitle !== false) for (const vocal of getLineBackgroundVocals(line)) {
      main.push(vocal.text, ...vocal.words.map(word => word.text));
      subtitle.push(resolveLyricAlternateText(vocal, contentMode) || '');
    }
  }
  const requests = [{ font: `${resolveThemeFontWeight(theme, 400)} 16px ${resolveThemeFontStack(theme)}`, text: uniqueText(main) }];
  if (!input.hideTranslationSubtitle) requests.push({
    font: `${resolveThemeFontWeight(subtitleTheme, 500)} 16px ${resolveThemeTranslationFontStack(subtitleTheme)}`, text: uniqueText(subtitle),
  });
  return requests;
}

// Share StrictMode/repeated requests. A failed web font releases the layout gate and keeps the browser's normal fallback.
export function prepareDesktopFonts(requests: DesktopFontRequest[]): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts?.load) return Promise.resolve();
  const fonts = document.fonts, key = JSON.stringify(requests);
  let cache = pending.get(fonts);
  if (!cache) { cache = new Map(); pending.set(fonts, cache); }
  const saved = cache.get(key);
  if (saved) return saved;
  const loading = Promise.allSettled(requests.map(async request => {
    const matched = await fonts.load(request.font, request.text);
    const families = new Set(matched.map(face => face.family));
    const variants: Promise<FontFace>[] = [];
    // Automatic renderer weights differ by mode; prepare the other declared faces of the same matched families as well.
    fonts.forEach(face => { if (families.has(face.family)) variants.push(face.load()); });
    await Promise.allSettled(variants);
  })).then(() => undefined);
  cache.set(key, loading);
  while (cache.size > 16) cache.delete(cache.keys().next().value!);
  return loading;
}
