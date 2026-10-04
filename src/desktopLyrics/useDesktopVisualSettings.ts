import { useCallback, useMemo, useState } from 'react';
import type { Theme, VisualizerMode } from '../types';
import { useVisualizerSettingsStore } from '../stores/useVisualizerSettingsStore';
import { useTypographySettingsStore } from '../stores/useTypographySettingsStore';
import { useVisualizerAssetStore } from '../stores/useVisualizerAssetStore';
import { useThemeSettingsStore } from '../stores/useThemeSettingsStore';
import { useVisualizerTunings } from '../components/visualizer/useVisualizerTunings';
import { useVisualizerBackgroundConfig } from '../components/visualizer/useVisualizerBackgroundConfig';
import { buildVisualizerTheme } from '../components/app/presentation/buildVisualizerTheme';
import { useDesktopVisualAssets } from './useDesktopVisualAssets';
import { useDesktopVisualDraft } from './useDesktopVisualDraft';
import { applyTypographyPatch, type DesktopTypographyPatch, type DesktopVisualizerPatch } from './desktopVisualFields';
import { buildDesktopBackgroundActions, buildDesktopModePanelProps, resetDesktopMode } from './desktopVisualSettingsPanels';
import { exportDesktopVisualConfig, importDesktopVisualConfig } from './desktopVisualSettingsCodec';

// src/desktopLyrics/useDesktopVisualSettings.ts — original visual settings feed the desktop renderer without App playback state.
type Options = { baseTheme: Theme; cover: string; transparent: boolean; translated: boolean; onTranslated: (value: boolean) => void };
const INTENSITY_KEY = 'folia.desktop.animationIntensity.v1', BACKGROUND_KEY = 'folia.desktop.backgroundEnabled.v1';
const readIntensity = (): Theme['animationIntensity'] | null => {
  const value = localStorage.getItem(INTENSITY_KEY);
  return value === 'calm' || value === 'normal' || value === 'chaotic' ? value : null;
};
const commonDefaults: DesktopTypographyPatch = { lyricsFontStyle: 'sans', lyricsFontScale: 1, lyricsFontWeight: null, lyricsCustomFont: null, lyricsFontFallbackFamilies: [] };
const subtitleDefaults: DesktopTypographyPatch = { hidePlayerTranslationSubtitle: false, subtitleContentMode: 'translation', showSubtitleTranslation: true,
  subtitleOverlayOpacity: .6, subtitleOverlayBackground: true, subtitleUpcomingLyricsBlur: true, showHarmonySubtitle: true, harmonySubtitleBackground: true,
  subtitleFontInheritsLyrics: true, subtitleFontScale: 1, subtitleFontStyle: 'sans', subtitleFontWeight: null, subtitleFontFamily: null, subtitleFontFallbackFamilies: [] };

export function useDesktopVisualSettings(input: Options) {
  const assetActions = useDesktopVisualAssets();
  const visualizer = useVisualizerSettingsStore(), typography = useTypographySettingsStore(), assets = useVisualizerAssetStore();
  const staticMode = useThemeSettingsStore(s => s.staticMode), useCoverColorBg = useThemeSettingsStore(s => s.useCoverColorBg);
  const tunings = useVisualizerTunings(), committedBackground = useVisualizerBackgroundConfig();
  const edits = useDesktopVisualDraft();
  const [intensityOverride, setIntensityOverride] = useState(readIntensity);
  const [backgroundEnabled, setBackground] = useState(() => localStorage.getItem(BACKGROUND_KEY) === 'true');
  const animationIntensity = intensityOverride ?? input.baseTheme.animationIntensity;
  const setAnimationIntensity = useCallback((value: Theme['animationIntensity']) => {
    if (value !== 'calm' && value !== 'normal' && value !== 'chaotic') return;
    localStorage.setItem(INTENSITY_KEY, value); setIntensityOverride(value);
  }, []);
  const setBackgroundEnabled = useCallback((value: boolean) => { localStorage.setItem(BACKGROUND_KEY, String(value)); setBackground(value); }, []);
  const patchTypography = useCallback((patch: DesktopTypographyPatch) => {
    edits.patchTypography(patch);
    if (patch.subtitleContentMode !== undefined) input.onTranslated(patch.subtitleContentMode !== 'none');
    else if (patch.showSubtitleTranslation !== undefined) input.onTranslated(patch.showSubtitleTranslation);
  }, [edits.patchTypography, input.onTranslated]);
  const themes = useMemo(() => buildVisualizerTheme({
    appStyle: {}, theme: { ...input.baseTheme, animationIntensity }, lyricsFontStyle: typography.lyricsFontStyle,
    lyricsFontWeight: typography.lyricsFontWeight, lyricsCustomFontFamily: typography.lyricsCustomFont?.family ?? null,
    lyricsFontFallbackFamilies: typography.lyricsFontFallbackFamilies, subtitleFontInheritsLyrics: typography.subtitleFontInheritsLyrics,
    subtitleFontStyle: typography.subtitleFontStyle, subtitleFontWeight: typography.subtitleFontWeight,
    subtitleFontFamily: typography.subtitleFontFamily, subtitleFontFallbackFamilies: typography.subtitleFontFallbackFamilies,
    visualizerMode: 'classic',
  }), [input.baseTheme, animationIntensity, typography.lyricsFontStyle, typography.lyricsFontWeight, typography.lyricsCustomFont,
    typography.lyricsFontFallbackFamilies, typography.subtitleFontInheritsLyrics, typography.subtitleFontStyle, typography.subtitleFontWeight,
    typography.subtitleFontFamily, typography.subtitleFontFallbackFamilies]);
  const background = useMemo(() => ({ ...committedBackground, transparent: input.transparent || !backgroundEnabled }), [committedBackground, input.transparent, backgroundEnabled]);
  const rendererProps = useMemo(() => ({
    subtitleTheme: themes.visualizerSubtitleTheme, visualizerTunings: tunings, background, staticMode,
    visualizerOpacity: visualizer.visualizerOpacity, lyricsFontScale: typography.lyricsFontScale, subtitleFontScale: typography.subtitleFontScale,
    subtitleOverlayOpacity: typography.subtitleOverlayOpacity, subtitleOverlayBackground: typography.subtitleOverlayBackground,
    subtitleUpcomingLyricsBlur: typography.subtitleUpcomingLyricsBlur, showHarmonySubtitle: typography.showHarmonySubtitle,
    harmonySubtitleBackground: typography.harmonySubtitleBackground,
    showSubtitleTranslation: input.translated, hideTranslationSubtitle: typography.hidePlayerTranslationSubtitle || !input.translated,
    subtitleContentMode: input.translated ? typography.subtitleContentMode === 'none' ? 'translation' as const : typography.subtitleContentMode : 'none' as const,
    cappellaCustomEmojiImages: assets.cappellaCustomEmojiImages, cappellaCustomAvatarImages: assets.cappellaCustomAvatarImages, monetPortraitImage: assets.monetPortraitImage,
    onMonetTuningChange: visualizer.handleSetMonetTuning, onCladdaghTuningChange: visualizer.handleSetCladdaghTuning,
    onPendoloTuningChange: visualizer.handleSetPendoloTuning, onSonnetTuningChange: visualizer.handleSetSonnetTuning,
    onTemperaTuningChange: visualizer.handleSetTemperaTuning, onLumiereTuningChange: visualizer.handleSetLumiereTuning,
  }), [themes.visualizerSubtitleTheme, tunings, background, staticMode, visualizer.visualizerOpacity, typography.lyricsFontScale,
    typography.subtitleFontScale, typography.subtitleOverlayOpacity, typography.subtitleOverlayBackground, typography.subtitleUpcomingLyricsBlur,
    typography.showHarmonySubtitle, typography.harmonySubtitleBackground, typography.hidePlayerTranslationSubtitle, typography.subtitleContentMode,
    input.translated, assets.cappellaCustomEmojiImages, assets.cappellaCustomAvatarImages, assets.monetPortraitImage,
    visualizer.handleSetMonetTuning, visualizer.handleSetCladdaghTuning, visualizer.handleSetPendoloTuning, visualizer.handleSetSonnetTuning, visualizer.handleSetTemperaTuning, visualizer.handleSetLumiereTuning]);
  const draftVisualizer = useMemo(() => {
    const value = { ...visualizer, ...assetActions, ...edits.draft.visualizer };
    for (const key of Object.keys(edits.draft.visualizer) as (keyof DesktopVisualizerPatch)[]) {
      if (key.endsWith('Tuning')) (value as Record<string, unknown>)[key] = { ...visualizer[key] as object, ...edits.draft.visualizer[key] as object };
    }
    return value as typeof visualizer;
  }, [visualizer, assetActions, edits.draft.visualizer]);
  const draftTypography = useMemo(() => ({ ...typography, ...edits.draft.typography, showSubtitleTranslation: input.translated }), [typography, edits.draft.typography, input.translated]);
  const backgroundConfig = useMemo(() => ({ ...background, common: { ...background.common, opacity: draftVisualizer.backgroundOpacity,
    disableGeometricBackground: draftVisualizer.disableVisualizerGeometricBackground, disableVignette: draftVisualizer.disableVisualizerVignette },
    monet: { tuning: draftVisualizer.monetBackgroundTuning }, nomand: { tuning: draftVisualizer.nomandBackgroundTuning },
    latent: { tuning: draftVisualizer.latentBackgroundTuning }, sora: { tuning: draftVisualizer.soraBackgroundTuning },
    mode: draftVisualizer.visualizerBackgroundMode,
  }), [background, draftVisualizer.backgroundOpacity, draftVisualizer.disableVisualizerGeometricBackground, draftVisualizer.disableVisualizerVignette,
    draftVisualizer.monetBackgroundTuning, draftVisualizer.nomandBackgroundTuning, draftVisualizer.latentBackgroundTuning, draftVisualizer.soraBackgroundTuning, draftVisualizer.visualizerBackgroundMode]);
  const backgroundActions = buildDesktopBackgroundActions(draftVisualizer, assets, edits.patchVisualizer);
  const panelProps = buildDesktopModePanelProps(draftVisualizer, assets, edits.patchVisualizer, edits.beginSlider, edits.commitSlider);
  const resetCommon = () => { edits.commitSlider(); applyTypographyPatch(commonDefaults); visualizer.handleSetVisualizerOpacity(1); useThemeSettingsStore.getState().handleToggleStaticMode(false); localStorage.removeItem(INTENSITY_KEY); setIntensityOverride(null); };
  const resetSubtitle = () => { edits.commitSlider(); applyTypographyPatch(subtitleDefaults); input.onTranslated(true); };
  const resetMode = (mode: VisualizerMode) => { edits.commitSlider(); resetDesktopMode(mode); };
  const codecOptions = { animationIntensity, backgroundEnabled, translated: input.translated, setAnimationIntensity, setBackgroundEnabled, setTranslated: input.onTranslated };
  const exportConfig = (format: 'json' | 'code', mode?: VisualizerMode) => { edits.commitSlider(); return exportDesktopVisualConfig(format, codecOptions, mode); };
  const importConfig = async (text: string) => { edits.commitSlider(); return importDesktopVisualConfig(text, codecOptions); };
  return { mergedTheme: themes.visualizerTheme, subtitleTheme: themes.visualizerSubtitleTheme, rendererProps,
    visualizer: draftVisualizer, typography: draftTypography, assets, animationIntensity, setAnimationIntensity,
    backgroundEnabled, setBackgroundEnabled, backgroundSuppressed: backgroundEnabled && input.transparent,
    staticMode, setStaticMode: useThemeSettingsStore.getState().handleToggleStaticMode, useCoverColorBg,
    translated: input.translated, setTranslated: input.onTranslated, patchTypography, patchVisualizer: edits.patchVisualizer,
    backgroundConfig, backgroundActions, panelProps, beginSlider: edits.beginSlider, commitSlider: edits.commitSlider,
    resetCommon, resetSubtitle, resetMode, exportConfig, importConfig };
}
export type DesktopVisualSettingsModel = ReturnType<typeof useDesktopVisualSettings>;
