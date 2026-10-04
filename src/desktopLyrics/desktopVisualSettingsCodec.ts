import type { Theme, VisualizerMode } from '../types';
import { compressConfig, decompressConfig } from '../utils/appearanceCodec';
import { hasVisualizerMode } from '../components/visualizer/registry';
import { hasVisualizerBackgroundMode } from '../components/visualizer/backgrounds/registry';
import { collectVisualizerTunings } from '../components/visualizer/tuningRegistry';
import { useVisualizerSettingsStore } from '../stores/useVisualizerSettingsStore';
import { useTypographySettingsStore } from '../stores/useTypographySettingsStore';
import { useThemeSettingsStore } from '../stores/useThemeSettingsStore';
import { applyTypographyPatch, applyVisualizerPatch, typographySetters, visualizerSetters, type DesktopTypographyPatch, type DesktopVisualizerPatch } from './desktopVisualFields';

// src/desktopLyrics/desktopVisualSettingsCodec.ts — original shortcode/JSON format with a desktop field whitelist; never import song colours or asset URLs.
export type DesktopVisualImportResult = { ok: boolean; error?: string; mode?: VisualizerMode };
type Options = { animationIntensity: Theme['animationIntensity']; backgroundEnabled: boolean; translated: boolean;
  setAnimationIntensity: (value: Theme['animationIntensity']) => void; setBackgroundEnabled: (value: boolean) => void; setTranslated: (value: boolean) => void };
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const has = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

// Only plain values matching known setting shapes reach the original setters, which own clamping.
function sanitize(value: unknown, current: unknown): unknown {
  if (typeof current === 'number') return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  if (typeof current === 'boolean') return typeof value === 'boolean' ? value : undefined;
  if (typeof current === 'string') return typeof value === 'string' ? value : undefined;
  if (current === null) return value === null || typeof value === 'string' || typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  if (Array.isArray(current)) return Array.isArray(value) ? value : undefined;
  if (!object(current) || !object(value)) return undefined;
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(current)) {
    if (!has(value, key)) continue;
    const item = sanitize(value[key], current[key]);
    if (item !== undefined) next[key] = item;
  }
  return Object.keys(next).length ? next : undefined;
}
function configInput(text: string): string {
  const value = text.trim();
  if (/^https?:\/\//i.test(value)) return new URL(value).searchParams.get('cfg') || value;
  return value;
}
export function exportDesktopVisualConfig(format: 'json' | 'code', options: Options, mode?: VisualizerMode): string {
  const v = useVisualizerSettingsStore.getState(), t = useTypographySettingsStore.getState(), theme = useThemeSettingsStore.getState();
  const typography = Object.fromEntries(Object.keys(typographySetters).filter(key => key !== 'lyricsCustomFont').map(key => [key, t[key as keyof typeof t]]));
  const visualizer = Object.fromEntries(Object.keys(visualizerSetters).map(key => [key, v[key as keyof typeof v]]));
  // Partial theme metadata is enough for the original codec; colour fields intentionally stay absent.
  const metadata = { name: 'Desktop typography', fontStyle: t.lyricsFontStyle, animationIntensity: options.animationIntensity };
  const config = { ...visualizer, ...typography, visualizerTunings: collectVisualizerTunings(v as unknown as Record<string, unknown>),
    visualizerMode: mode, theme: { light: metadata, dark: metadata }, desktopBackgroundEnabled: options.backgroundEnabled,
    useCoverColorBg: theme.useCoverColorBg, staticMode: theme.staticMode,
    showSubtitleTranslation: t.showSubtitleTranslation, subtitleContentMode: t.subtitleContentMode,
    lyricsCustomFontFamily: t.lyricsCustomFont?.source === 'system' ? t.lyricsCustomFont.family : null };
  return format === 'code' ? compressConfig(config) : JSON.stringify(config, null, 2);
}
export function importDesktopVisualConfig(text: string, options: Options): DesktopVisualImportResult {
  try {
    const config: unknown = decompressConfig(configInput(text));
    if (!object(config)) throw new Error('Invalid visual settings configuration');
    const v = useVisualizerSettingsStore.getState(), t = useTypographySettingsStore.getState();
    const visualizer: DesktopVisualizerPatch = {}, typography: DesktopTypographyPatch = {};
    const tunings = object(config.visualizerTunings) ? config.visualizerTunings : {};
    for (const key of Object.keys(visualizerSetters) as (keyof typeof visualizerSetters)[]) {
      const modeKey = key.endsWith('Tuning') ? key.slice(0, -6) : '';
      const raw = modeKey && has(tunings, modeKey) ? tunings[modeKey] : config[key];
      if (raw === undefined) continue;
      if (key === 'visualizerBackgroundMode' && raw !== null && !hasVisualizerBackgroundMode(raw)) continue;
      if (key === 'urlBackgroundSelectedId' && raw !== null && typeof raw !== 'string') continue;
      const nullable = key === 'visualizerBackgroundMode' || key === 'urlBackgroundSelectedId';
      const value = raw === null && nullable ? null : sanitize(raw, v[key]);
      if (value !== undefined) (visualizer as Record<string, unknown>)[key] = value;
    }
    for (const key of Object.keys(typographySetters) as (keyof typeof typographySetters)[]) {
      if (key === 'lyricsCustomFont' || !has(config, key)) continue;
      const raw = config[key];
      if ((key === 'lyricsFontStyle' || key === 'subtitleFontStyle') && !['sans', 'serif', 'mono'].includes(String(raw))) continue;
      if (key === 'subtitleContentMode' && !['translation', 'romanization', 'none'].includes(String(raw))) continue;
      if (key.includes('FontWeight') && raw !== null && (typeof raw !== 'number' || !Number.isFinite(raw))) continue;
      if (key === 'subtitleFontFamily' && raw !== null && typeof raw !== 'string') continue;
      if (key.endsWith('FallbackFamilies') && (!Array.isArray(raw) || !raw.every(item => typeof item === 'string'))) continue;
      const nullable = key === 'lyricsFontWeight' || key === 'subtitleFontWeight' || key === 'subtitleFontFamily';
      const value = raw === null && nullable ? null : sanitize(raw, t[key]);
      if (value !== undefined) (typography as Record<string, unknown>)[key] = value;
    }
    const dual = object(config.theme) ? config.theme : {}, metadata = object(dual.dark) ? dual.dark : object(dual.light) ? dual.light : {};
    const intensity = metadata.animationIntensity;
    if (intensity === 'calm' || intensity === 'normal' || intensity === 'chaotic') options.setAnimationIntensity(intensity);
    if (!has(config, 'lyricsFontStyle') && ['sans', 'serif', 'mono'].includes(String(metadata.fontStyle))) typography.lyricsFontStyle = metadata.fontStyle as Theme['fontStyle'];
    if (has(config, 'lyricsCustomFontFamily')) {
      const family = config.lyricsCustomFontFamily;
      if (family === null || typeof family === 'string') typography.lyricsCustomFont = family ? { source: 'system', family, label: family } : null;
    }
    // Notify the host before applying exact subtitle fields: its quick toggle must not clear an imported hide flag or romanization mode.
    if (typography.subtitleContentMode !== undefined) options.setTranslated(typography.subtitleContentMode !== 'none');
    else if (typeof typography.showSubtitleTranslation === 'boolean') options.setTranslated(typography.showSubtitleTranslation);
    applyVisualizerPatch(visualizer); applyTypographyPatch(typography);
    if (typeof config.desktopBackgroundEnabled === 'boolean') options.setBackgroundEnabled(config.desktopBackgroundEnabled);
    if (typeof config.useCoverColorBg === 'boolean') useThemeSettingsStore.getState().handleToggleCoverColorBg(config.useCoverColorBg);
    if (typeof config.staticMode === 'boolean') useThemeSettingsStore.getState().handleToggleStaticMode(config.staticMode);
    return { ok: true, ...(hasVisualizerMode(String(config.visualizerMode)) ? { mode: config.visualizerMode as VisualizerMode } : {}) };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
}
