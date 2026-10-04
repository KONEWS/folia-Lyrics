import type { VisualizerMode } from '../types';
import { getVisualizerBackgroundRegistryEntry, getVisualizerBackgroundModeLabel, VISUALIZER_BACKGROUND_REGISTRY } from '../components/visualizer/backgrounds/registry';
import { resolveVisualizerBackgroundMode } from '../stores/visualizerSettingsPersistence';
import { useVisualTranslation, VisualCard, VisualToggle } from './DesktopVisualControls';
import DesktopSelect from './DesktopSelect';
import type { DesktopVisualSettingsModel } from './useDesktopVisualSettings';

// src/desktopLyrics/DesktopVisualBackground.tsx — mounts original background cards with desktop transparency precedence.
export default function DesktopVisualBackground({ model, mode }: { model: DesktopVisualSettingsModel; mode: VisualizerMode }) {
  const t = useVisualTranslation();
  const resolved = resolveVisualizerBackgroundMode(model.backgroundConfig.mode, mode);
  const entry = getVisualizerBackgroundRegistryEntry(resolved);
  return <>
    <VisualCard title={t('options.previewBackgroundSettings')}>
      <VisualToggle label={t('desktopVisual.originalBackground')} checked={model.backgroundEnabled} onChange={model.setBackgroundEnabled}/>
      <p className="desktop-visual-hint">{t(model.backgroundSuppressed ? 'desktopVisual.backgroundSuppressed' : 'desktopVisual.backgroundHint')}</p>
      <label className="desktop-visual-field"><span>{t('options.visualizerBackgroundMode')}</span><DesktopSelect label={t('options.visualizerBackgroundMode')}
        value={resolved} onChange={value => model.backgroundActions.onModeChange?.(value as typeof resolved)}
        options={VISUALIZER_BACKGROUND_REGISTRY.map(item => ({ value: item.mode, label: getVisualizerBackgroundModeLabel(item.mode, t) }))}/></label>
      {entry.resetSettings ? <button type="button" className="desktop-visual-reset" onClick={() => entry.resetSettings?.(model.backgroundActions)}>{t('ui.default')}</button> : null}
    </VisualCard>
    <div className="desktop-visual-original-panel" data-background-settings={resolved}>
      {entry.renderSettingsPanel?.({ config: model.backgroundConfig, actions: model.backgroundActions, t,
        theme: model.mergedTheme, isDaylight: false, controlCardBg: 'transparent', rangeInputClass: 'desktop-visual-native-range',
        onSliderPointerDown: model.beginSlider, onSliderCommit: model.commitSlider })}
    </div>
    <p className="desktop-visual-hint">{t('desktopVisual.assetHint')}</p>
  </>;
}
