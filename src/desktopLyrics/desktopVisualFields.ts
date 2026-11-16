import type { TypographySettingsState } from '../stores/useTypographySettingsStore';
import { useTypographySettingsStore } from '../stores/useTypographySettingsStore';
import type { VisualizerSettingsState } from '../stores/useVisualizerSettingsStore';
import { useVisualizerSettingsStore } from '../stores/useVisualizerSettingsStore';
import { getStoredVisualizerTunings } from '../components/visualizer/tuningRegistry';

// src/desktopLyrics/desktopVisualFields.ts — one allowed field-to-original-setter table for desktop edits and imports.
type TuningKey = Extract<keyof VisualizerSettingsState, `${string}Tuning`>;
// Follow the same declarations that build the store, so a newly registered style is editable and portable.
const tuningSetters = Object.fromEntries(
  getStoredVisualizerTunings().map(tuning => [tuning.settingsKey, tuning.settingsSetterKey]),
) as { [K in TuningKey]: keyof VisualizerSettingsState };
export const visualizerSetters = {
  randomVisualizerModePerSong: 'handleToggleRandomVisualizerModePerSong', randomVisualizerModes: 'handleSetRandomVisualizerModes',
  backgroundOpacity: 'handleSetBackgroundOpacity', visualizerOpacity: 'handleSetVisualizerOpacity', visualizerFrameRate: 'handleSetVisualizerFrameRate',
  lyricRenderQuality: 'handleSetLyricRenderQuality',
  disableVisualizerVignette: 'handleToggleDisableVisualizerVignette', disableVisualizerGeometricBackground: 'handleToggleDisableVisualizerGeometricBackground',
  visualizerBackgroundMode: 'handleSetVisualizerBackgroundMode',
  ...tuningSetters,
  smartBeat: 'handleSetSmartBeat',
} as const satisfies Partial<Record<keyof VisualizerSettingsState, keyof VisualizerSettingsState>>;
export const typographySetters = {
  lyricsFontStyle: 'handleSetLyricsFontStyle', lyricsFontScale: 'handleSetLyricsFontScale', lyricsFontWeight: 'handleSetLyricsFontWeight',
  lyricsCustomFont: 'handleSetLyricsCustomFont', lyricsFontFallbackFamilies: 'handleSetLyricsFontFallbackFamilies',
  subtitleFontInheritsLyrics: 'handleSetSubtitleFontInheritsLyrics', subtitleFontStyle: 'handleSetSubtitleFontStyle',
  subtitleFontScale: 'handleSetSubtitleFontScale', subtitleFontWeight: 'handleSetSubtitleFontWeight', subtitleFontFamily: 'handleSetSubtitleFontFamily',
  subtitleFontFallbackFamilies: 'handleSetSubtitleFontFallbackFamilies', hidePlayerTranslationSubtitle: 'handleToggleHidePlayerTranslationSubtitle',
  showSubtitleTranslation: 'handleToggleShowSubtitleTranslation', subtitleContentMode: 'handleSetSubtitleContentMode',
  subtitleOverlayLayout: 'handleSetSubtitleOverlayLayout',
  subtitleOverlayOpacity: 'handleSetSubtitleOverlayOpacity', subtitleOverlayBackground: 'handleToggleSubtitleOverlayBackground',
  subtitleUpcomingLyricsBlur: 'handleToggleSubtitleUpcomingLyricsBlur', showHarmonySubtitle: 'handleToggleShowHarmonySubtitle', harmonySubtitleBackground: 'handleToggleHarmonySubtitleBackground',
} as const satisfies Partial<Record<keyof TypographySettingsState, keyof TypographySettingsState>>;
export type DesktopVisualizerValues = Pick<VisualizerSettingsState, keyof typeof visualizerSetters>;
export type DesktopTypographyValues = Pick<TypographySettingsState, keyof typeof typographySetters>;
export type DesktopVisualizerPatch = { [K in keyof DesktopVisualizerValues]?: K extends `${string}Tuning` ? Partial<DesktopVisualizerValues[K]> : DesktopVisualizerValues[K] };
export type DesktopTypographyPatch = Partial<DesktopTypographyValues>;

export function applyVisualizerPatch(patch: DesktopVisualizerPatch) {
  const store = useVisualizerSettingsStore.getState();
  for (const key of Object.keys(patch) as (keyof DesktopVisualizerPatch)[]) {
    if (!(key in visualizerSetters) || patch[key] === undefined) continue;
    if (key === 'visualizerBackgroundMode' && patch[key] === null) store.handleResetVisualizerBackgroundMode();
    else (store[visualizerSetters[key]] as (value: unknown) => void)(patch[key]);
  }
}
export function applyTypographyPatch(patch: DesktopTypographyPatch) {
  const store = useTypographySettingsStore.getState();
  for (const key of Object.keys(patch) as (keyof DesktopTypographyPatch)[]) {
    if (key in typographySetters && patch[key] !== undefined) (store[typographySetters[key]] as (value: unknown) => void)(patch[key]);
  }
  // Returning to a built-in font also returns to its own weight; an explicit imported weight wins.
  if ((patch.lyricsCustomFont === null || patch.lyricsFontFallbackFamilies?.length === 0) && patch.lyricsFontWeight === undefined) store.handleSetLyricsFontWeight(null);
  if ((patch.subtitleFontFamily === null || patch.subtitleFontFallbackFamilies?.length === 0) && patch.subtitleFontWeight === undefined) store.handleSetSubtitleFontWeight(null);
}

// A tuning slider changes one nested field; preserve every other draft field until the single commit.
export function mergeVisualizerPatch(old: DesktopVisualizerPatch, patch: DesktopVisualizerPatch): DesktopVisualizerPatch {
  const next = { ...old, ...patch };
  for (const key of Object.keys(patch) as (keyof DesktopVisualizerPatch)[]) {
    if (key.endsWith('Tuning')) (next as Record<string, unknown>)[key] = { ...old[key] as object, ...patch[key] as object };
  }
  return next;
}
