import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compressConfig, decompressConfig } from '@/utils/appearanceCodec';
import { exportDesktopVisualConfig, importDesktopVisualConfig } from '@/desktopLyrics/desktopVisualSettingsCodec';
import { applyTypographyPatch } from '@/desktopLyrics/desktopVisualFields';
import { useVisualizerSettingsStore } from '@/stores/useVisualizerSettingsStore';
import { useTypographySettingsStore } from '@/stores/useTypographySettingsStore';
import { useThemeSettingsStore } from '@/stores/useThemeSettingsStore';
import { useDesktopPanelSettingsStore, DEFAULT_SETTINGS_TRANSPARENCY, DESKTOP_SETTINGS_TRANSPARENCY_KEY } from '@/stores/useDesktopPanelSettingsStore';

// test/unit/desktop/desktopVisualSettingsCodec.test.ts — verify portable desktop visual settings at the original store boundary.
vi.mock('@/services/customLyricsFont', async original => ({ ...await original<typeof import('@/services/customLyricsFont')>(), clearUploadedLyricsFont: vi.fn(async () => undefined) }));
const originalVisualizer = useVisualizerSettingsStore.getState(), originalTypography = useTypographySettingsStore.getState(), originalTheme = useThemeSettingsStore.getState();
let storage: Storage;

function makeStorage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, String(value)); }, removeItem: key => { values.delete(key); },
    clear: () => values.clear(), key: index => Array.from(values.keys())[index] ?? null };
}
function makeOptions() {
  return { animationIntensity: 'calm' as const, backgroundEnabled: false, translated: true,
    setAnimationIntensity: vi.fn(), setBackgroundEnabled: vi.fn(), setTranslated: vi.fn((visible: boolean) => {
      const store = useTypographySettingsStore.getState();
      store.handleSetSubtitleContentMode(visible ? store.subtitleContentMode === 'none' ? 'translation' : store.subtitleContentMode : 'none');
      if (visible) store.handleToggleHidePlayerTranslationSubtitle(false);
    }) };
}
const encode = (format: 'json' | 'code', config: object) => format === 'code' ? compressConfig(config) : JSON.stringify(config);

beforeEach(() => {
  storage = makeStorage(); vi.stubGlobal('localStorage', storage); vi.stubGlobal('window', { localStorage: storage });
  useVisualizerSettingsStore.setState(originalVisualizer); useTypographySettingsStore.setState(originalTypography); useThemeSettingsStore.setState(originalTheme);
  useDesktopPanelSettingsStore.setState({ settingsTransparency: DEFAULT_SETTINGS_TRANSPARENCY });
});
afterEach(() => {
  useVisualizerSettingsStore.setState(originalVisualizer); useTypographySettingsStore.setState(originalTypography); useThemeSettingsStore.setState(originalTheme);
  vi.unstubAllGlobals();
});

describe('desktop appearance codec', () => {
  it.each(['json', 'code'] as const)('roundtrips settings transparency through %s, clamps finite values and preserves missing or invalid values', format => {
    const store = useDesktopPanelSettingsStore.getState();
    store.setSettingsTransparency(32);
    const exported = exportDesktopVisualConfig(format, makeOptions());
    expect(decompressConfig(exported).desktopSettingsTransparency).toBe(32);
    store.setSettingsTransparency(75);
    expect(importDesktopVisualConfig(exported, makeOptions()).ok).toBe(true);
    expect(useDesktopPanelSettingsStore.getState().settingsTransparency).toBe(32);
    expect(storage.getItem(DESKTOP_SETTINGS_TRANSPARENCY_KEY)).toBe('32');
    for (const value of ['bad', null, false]) {
      importDesktopVisualConfig(encode(format, { desktopSettingsTransparency: value }), makeOptions());
      expect(useDesktopPanelSettingsStore.getState().settingsTransparency).toBe(32);
    }
    importDesktopVisualConfig(encode(format, { lyricsFontStyle: 'sans' }), makeOptions());
    expect(useDesktopPanelSettingsStore.getState().settingsTransparency).toBe(32);
    for (const [value, expected] of [[-10, 0], [120, 100], [23.7, 24]]) {
      importDesktopVisualConfig(encode(format, { desktopSettingsTransparency: value }), makeOptions());
      expect(useDesktopPanelSettingsStore.getState().settingsTransparency).toBe(expected);
    }
    store.setSettingsTransparency(NaN); store.setSettingsTransparency(Infinity);
    expect(useDesktopPanelSettingsStore.getState().settingsTransparency).toBe(24);
  });
  it.each(['json', 'code'] as const)('ignores obsolete theme presets when importing %s and does not export them again', format => {
    const key = 'folia.desktop.themePreset.v1'; storage.setItem(key, 'cover');
    for (const preset of ['luotianyi-ado', 'cover', 'custom']) {
      const legacy = format === 'json'
        ? JSON.stringify({ visualizerMode: 'classic', lyricsFontStyle: 'mono', desktopThemePreset: preset })
        : `folia-theme://${btoa(JSON.stringify({ vm: 'classic', lfs: 'mono', dtp: preset }))}`;
      expect(importDesktopVisualConfig(legacy, makeOptions())).toEqual({ ok: true, mode: 'classic' });
      expect(useTypographySettingsStore.getState().lyricsFontStyle).toBe('mono');
      expect(storage.getItem(key)).toBe('cover');
      const exported = decompressConfig(exportDesktopVisualConfig(format, makeOptions(), 'classic'));
      expect(exported).not.toHaveProperty('desktopThemePreset'); expect(exported).not.toHaveProperty('dtp');
      expect(storage.getItem('custom_dual_theme')).toBeNull();
    }
  });
  it.each([true, false])('keeps standalone desktop background enabled=%s in the original JSON and shortcode codec', enabled => {
    expect(decompressConfig(compressConfig({ desktopBackgroundEnabled: enabled }))).toEqual({ desktopBackgroundEnabled: enabled });
    expect(decompressConfig(JSON.stringify({ desktopBackgroundEnabled: enabled }))).toEqual({ desktopBackgroundEnabled: enabled });
    expect(decompressConfig(JSON.stringify({ dbe: enabled }))).toEqual({ desktopBackgroundEnabled: enabled });
  });

  it.each(['json', 'code'] as const)('clears saved fonts, empty fallbacks, weights, background mode and selected URL through %s', format => {
    const v = useVisualizerSettingsStore.getState(), t = useTypographySettingsStore.getState();
    v.handleSetVisualizerBackgroundMode('latent'); v.handleSetUrlBackgroundSelectedId('old-image');
    t.handleSetLyricsCustomFont({ source: 'system', family: 'Old Lyrics Font', label: 'Old Lyrics Font' });
    t.handleSetLyricsFontFallbackFamilies(['Fallback']); t.handleSetLyricsFontWeight(700);
    t.handleSetSubtitleFontFamily('Old Subtitle Font'); t.handleSetSubtitleFontFallbackFamilies(['Subtitle Fallback']); t.handleSetSubtitleFontWeight(600);
    const options = makeOptions();
    expect(importDesktopVisualConfig(encode(format, { lyricsCustomFontFamily: null, lyricsFontFallbackFamilies: [], lyricsFontWeight: null,
      subtitleFontFamily: null, subtitleFontFallbackFamilies: [], subtitleFontWeight: null, visualizerBackgroundMode: null, urlBackgroundSelectedId: null,
      desktopBackgroundEnabled: false, staticMode: false }), options)).toEqual({ ok: true });
    expect(useTypographySettingsStore.getState()).toMatchObject({ lyricsCustomFont: null, lyricsFontFallbackFamilies: [], lyricsFontWeight: null,
      subtitleFontFamily: null, subtitleFontFallbackFamilies: [], subtitleFontWeight: null });
    expect(useVisualizerSettingsStore.getState()).toMatchObject({ visualizerBackgroundMode: null, urlBackgroundSelectedId: null });
    expect(storage.getItem('visualizer_background_mode')).toBeNull(); expect(storage.getItem('url_background_selected_id')).toBeNull();
    expect(storage.getItem('lyrics_font_weight')).toBeNull(); expect(storage.getItem('subtitle_font_weight')).toBeNull();
    expect(options.setBackgroundEnabled).toHaveBeenCalledWith(false);
  });

  it.each(['json', 'code'] as const)('returns still mode and preserves imported hidden romanization after the host quick toggle in %s', format => {
    const options = makeOptions();
    expect(importDesktopVisualConfig(encode(format, { visualizerMode: 'still', hidePlayerTranslationSubtitle: true,
      subtitleContentMode: 'romanization', showSubtitleTranslation: true }), options)).toEqual({ ok: true, mode: 'still' });
    expect(useTypographySettingsStore.getState()).toMatchObject({ subtitleContentMode: 'romanization', showSubtitleTranslation: true, hidePlayerTranslationSubtitle: true });
    expect(options.setTranslated).toHaveBeenCalledOnce(); expect(options.setTranslated).toHaveBeenCalledWith(true);
  });

  it.each(['json', 'code'] as const)('exports portable settings and the exact subtitle visibility combination through %s', format => {
    useTypographySettingsStore.setState({ hidePlayerTranslationSubtitle: true, showSubtitleTranslation: true, subtitleContentMode: 'romanization' });
    const config = decompressConfig(exportDesktopVisualConfig(format, makeOptions(), 'lumiere'));
    expect(config).toMatchObject({ visualizerMode: 'lumiere', desktopBackgroundEnabled: false,
      hidePlayerTranslationSubtitle: true, showSubtitleTranslation: true, subtitleContentMode: 'romanization' });
    expect(config.theme.dark).toMatchObject({ fontStyle: useTypographySettingsStore.getState().lyricsFontStyle, animationIntensity: 'calm' });
    // JSON stays colour-free. The original shortcode decoder supplies colour defaults, which desktop imports ignore.
    if (format === 'json') expect(config.theme.dark).not.toHaveProperty('primaryColor');
    expect(config).not.toHaveProperty('cappellaCustomEmojiImages'); expect(config).not.toHaveProperty('monetPortraitImage');
  });

  it('ignores unrelated host fields, validates numeric settings and delegates tuning clamping to the original setters', () => {
    const options = makeOptions(), frameRate = useVisualizerSettingsStore.getState().visualizerFrameRate;
    expect(importDesktopVisualConfig(JSON.stringify({ lyricsFontScale: 'bad', visualizerFrameRate: 1,
      theme: { dark: { primaryColor: '#ff0000', animationIntensity: 'chaotic' } },
      visualizerTunings: { classic: { breathingFloatMultiplier: 999, unknownControl: true } } }), options)).toEqual({ ok: true });
    expect(useTypographySettingsStore.getState().lyricsFontScale).toBe(originalTypography.lyricsFontScale);
    expect(useVisualizerSettingsStore.getState().visualizerFrameRate).toBe(frameRate);
    expect(useVisualizerSettingsStore.getState().classicTuning.breathingFloatMultiplier).toBeLessThan(999);
    expect(useVisualizerSettingsStore.getState().classicTuning).not.toHaveProperty('unknownControl');
    expect(options.setAnimationIntensity).toHaveBeenCalledWith('chaotic'); expect(storage.getItem('custom_dual_theme')).toBeNull();
  });

  it('uses automatic weight when clearing a custom font stack while preserving an explicit imported weight', () => {
    useTypographySettingsStore.setState({ lyricsFontWeight: 700, subtitleFontWeight: 600 });
    applyTypographyPatch({ lyricsCustomFont: null, subtitleFontFallbackFamilies: [] });
    expect(useTypographySettingsStore.getState()).toMatchObject({ lyricsFontWeight: null, subtitleFontWeight: null });
    applyTypographyPatch({ lyricsCustomFont: null, lyricsFontWeight: 500, subtitleFontFamily: null, subtitleFontWeight: 350 });
    expect(useTypographySettingsStore.getState()).toMatchObject({ lyricsFontWeight: 500, subtitleFontWeight: 350 });
  });

  it('rejects malformed configs and ignores mistyped nullable fields without writing settings or host setters', () => {
    const options = makeOptions(), before = useVisualizerSettingsStore.getState(), beforeTypography = useTypographySettingsStore.getState();
    expect(importDesktopVisualConfig('folia-theme://not-base64!!', options).ok).toBe(false);
    expect(importDesktopVisualConfig('{}', options).ok).toBe(false);
    importDesktopVisualConfig(JSON.stringify({ subtitleFontFamily: 123, urlBackgroundSelectedId: 123 }), options);
    expect(useVisualizerSettingsStore.getState()).toBe(before);
    expect(useTypographySettingsStore.getState()).toBe(beforeTypography);
    expect(options.setBackgroundEnabled).not.toHaveBeenCalled(); expect(options.setAnimationIntensity).not.toHaveBeenCalled(); expect(options.setTranslated).not.toHaveBeenCalled();
  });
});
