import type { VisualizerSettingsPanelProps } from '../components/visualizer/definition';
import { getVisualizerTuning } from '../components/visualizer/tuningRegistry';
import type { VisualizerBackgroundActions } from '../components/visualizer/backgrounds/definition';
import { useVisualizerSettingsStore, type VisualizerSettingsState } from '../stores/useVisualizerSettingsStore';
import type { VisualizerAssetState } from '../stores/useVisualizerAssetStore';
import { useThemeSettingsStore } from '../stores/useThemeSettingsStore';
import type { VisualizerMode } from '../types';
import type { DesktopVisualizerPatch } from './desktopVisualFields';

// src/desktopLyrics/desktopVisualSettingsPanels.ts — bind original registry panels to committed/draft desktop settings.
export function buildDesktopModePanelProps(mode: VisualizerMode, v: VisualizerSettingsState, patch: (value: DesktopVisualizerPatch) => void,
  begin: () => void, commit: () => void): Omit<VisualizerSettingsPanelProps, 't' | 'isDaylight' | 'theme' | 'controlCardBg' | 'rangeInputClass'> {
  const adapter = getVisualizerTuning(mode);
  const fields = v as unknown as Record<string, unknown>;
  return {
    tuning: adapter ? fields[adapter.settingsKey] : undefined,
    onTuningChange: value => { if (adapter) patch({ [adapter.settingsKey]: value } as DesktopVisualizerPatch); },
    settings: v, onSliderPointerDown: begin, onSliderCommit: commit,
  };
}
export function buildDesktopBackgroundActions(v: VisualizerSettingsState, a: VisualizerAssetState,
  patch: (value: DesktopVisualizerPatch) => void): VisualizerBackgroundActions {
  return {
    onModeChange: value => patch({ visualizerBackgroundMode: value }),
    common: { onCoverColorChange: useThemeSettingsStore.getState().handleToggleCoverColorBg, onOpacityChange: value => patch({ backgroundOpacity: value }),
      onDisableGeometricChange: value => patch({ disableVisualizerGeometricBackground: value }), onDisableVignetteChange: value => patch({ disableVisualizerVignette: value }) },
    customImage: { onUpload: v.handleUploadMonetBackgroundImage, onClear: v.handleClearMonetBackgroundImage, isLoading: a.isLoadingMonetBackgroundImage },
    monet: { onTuningChange: value => patch({ monetBackgroundTuning: value }), onResetTuning: v.handleResetMonetBackgroundTuning },
    nomand: { onTuningChange: value => patch({ nomandBackgroundTuning: value }), onResetTuning: v.handleResetNomandBackgroundTuning },
    latent: { onTuningChange: value => patch({ latentBackgroundTuning: value }), onResetTuning: v.handleResetLatentBackgroundTuning },
    sora: { onTuningChange: value => patch({ soraBackgroundTuning: value }), onResetTuning: v.handleResetSoraBackgroundTuning },
    url: { onAdd: v.handleAddUrlBackgroundItem, onUpdate: v.handleUpdateUrlBackgroundItem, onDelete: v.handleDeleteUrlBackgroundItem, onSelect: v.handleSetUrlBackgroundSelectedId },
  };
}
export function resetDesktopMode(mode: VisualizerMode) {
  const adapter = getVisualizerTuning(mode);
  const store = useVisualizerSettingsStore.getState() as unknown as Record<string, unknown>;
  const reset = adapter?.settingsResetterKey ? store[adapter.settingsResetterKey] : undefined;
  if (typeof reset === 'function') reset();
}
