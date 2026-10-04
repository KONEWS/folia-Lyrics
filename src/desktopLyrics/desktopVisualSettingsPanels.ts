import type { VisualizerSettingsPanelProps, VisualizerSettingsResetProps } from '../components/visualizer/definition';
import { getVisualizerRegistryEntry } from '../components/visualizer/registry';
import type { VisualizerBackgroundActions } from '../components/visualizer/backgrounds/definition';
import { useVisualizerSettingsStore, type VisualizerSettingsState } from '../stores/useVisualizerSettingsStore';
import type { VisualizerAssetState } from '../stores/useVisualizerAssetStore';
import { useThemeSettingsStore } from '../stores/useThemeSettingsStore';
import type { VisualizerMode } from '../types';
import type { DesktopVisualizerPatch } from './desktopVisualFields';

// src/desktopLyrics/desktopVisualSettingsPanels.ts — bind original registry panels to committed/draft desktop settings.
export function buildDesktopModePanelProps(v: VisualizerSettingsState, a: VisualizerAssetState, patch: (value: DesktopVisualizerPatch) => void,
  begin: () => void, commit: () => void): Omit<VisualizerSettingsPanelProps, 't' | 'isDaylight' | 'theme' | 'controlCardBg' | 'rangeInputClass'> {
  return {
    classicTuning: v.classicTuning, onClassicTuningChange: value => patch({ classicTuning: value }),
    partitaTuning: v.partitaTuning, onPartitaTuningChange: value => patch({ partitaTuning: value }),
    fumeTuning: v.fumeTuning, onFumeTuningChange: value => patch({ fumeTuning: value }),
    claddaghTuning: v.claddaghTuning, onCladdaghTuningChange: value => patch({ claddaghTuning: value }),
    cappellaTuning: v.cappellaTuning, onCappellaTuningChange: value => patch({ cappellaTuning: value }),
    tiltTuning: v.tiltTuning, onTiltTuningChange: value => patch({ tiltTuning: value }),
    dioramaTuning: v.dioramaTuning, onDioramaTuningChange: value => patch({ dioramaTuning: value }),
    monetTuning: v.monetTuning, onMonetTuningChange: value => patch({ monetTuning: value }),
    pendoloTuning: v.pendoloTuning, onPendoloTuningChange: value => patch({ pendoloTuning: value }),
    sonnetTuning: v.sonnetTuning, onSonnetTuningChange: value => patch({ sonnetTuning: value }),
    temperaTuning: v.temperaTuning, onTemperaTuningChange: value => patch({ temperaTuning: value }),
    lumiereTuning: v.lumiereTuning, onLumiereTuningChange: value => patch({ lumiereTuning: value }),
    cappellaCustomEmojiImages: a.cappellaCustomEmojiImages, cappellaCustomEmojiCount: a.cappellaCustomEmojiImages.length,
    hasCappellaCustomEmojiPack: a.storedCappellaEmojiPack.length > 0, isCappellaCustomEmojiPackLoading: a.isLoadingCappellaCustomEmojiPack,
    onImportCappellaCustomEmojiPack: v.handleImportCustomCappellaEmojiPack, onClearCappellaCustomEmojiPack: v.handleClearCustomCappellaEmojiPack,
    cappellaCustomAvatarImages: a.cappellaCustomAvatarImages, hasCappellaCustomAvatar: a.storedCappellaAvatarPack.length > 0,
    isCappellaCustomAvatarLoading: a.isLoadingCappellaCustomAvatarPack, onImportCappellaCustomAvatar: v.handleImportCustomCappellaAvatar, onClearCappellaCustomAvatar: v.handleClearCustomCappellaAvatar,
    monetPortraitImage: a.monetPortraitImage, isLoadingMonetPortraitImage: a.isLoadingMonetPortraitImage,
    onUploadMonetPortraitImage: v.handleUploadMonetPortraitImage, onClearMonetPortraitImage: v.handleClearMonetPortraitImage,
    onSliderPointerDown: begin, onSliderCommit: commit,
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
  const store = useVisualizerSettingsStore.getState(), reset: VisualizerSettingsResetProps = {};
  for (const kind of ['Classic', 'Partita', 'Fume', 'Claddagh', 'Cappella', 'Tilt', 'Diorama', 'Monet', 'Pendolo', 'Sonnet', 'Tempera', 'Lumiere'] as const) {
    (reset as Record<string, unknown>)[`reset${kind}Tuning`] = store[`handleReset${kind}Tuning`];
  }
  getVisualizerRegistryEntry(mode).resetSettings?.(reset);
}
