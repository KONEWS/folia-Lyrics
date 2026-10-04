import type { VisualizerMode } from '../types';
import { getVisualizerRegistryEntry, getVisualizerModeLabel, VISUALIZER_REGISTRY } from '../components/visualizer/registry';
import { useVisualTranslation, VisualCard } from './DesktopVisualControls';
import type { DesktopVisualSettingsModel } from './useDesktopVisualSettings';

// src/desktopLyrics/DesktopVisualModes.tsx — exposes the upstream mode registry and its own tuning panels.
export default function DesktopVisualModes({ model, mode, onMode }: {
  model: DesktopVisualSettingsModel; mode: VisualizerMode; onMode: (mode: VisualizerMode) => void;
}) {
  const t = useVisualTranslation();
  const entry = getVisualizerRegistryEntry(mode);
  const dynamicModes = VISUALIZER_REGISTRY.filter(item => item.mode !== 'still');
  return <>
    <VisualCard title={t('options.previewVisualizerSettings')}>
      <div className="desktop-visual-mode-grid" data-visual-mode-grid>
        {dynamicModes.map(item => <button key={item.mode} type="button" data-visual-mode={item.mode}
          aria-pressed={mode === item.mode} onClick={() => onMode(item.mode)}>{getVisualizerModeLabel(item.mode, t)}</button>)}
      </div>
      <div className="desktop-visual-still"><button type="button" data-visual-mode="still" aria-pressed={mode === 'still'}
        onClick={() => onMode('still')}>{getVisualizerModeLabel('still', t)}</button><p>{t('desktopVisual.stillHint')}</p></div>
      <button type="button" className="desktop-visual-reset" disabled={!entry.resetSettings} onClick={() => model.resetMode(mode)}>
        {t('desktopVisual.resetMode')}
      </button>
    </VisualCard>
    <div className="desktop-visual-original-panel" data-visualizer-settings={mode}>
      {entry.renderSettingsPanel ? entry.renderSettingsPanel({ ...model.panelProps, t,
        theme: model.mergedTheme, isDaylight: false, controlCardBg: 'transparent', rangeInputClass: 'desktop-visual-native-range',
        onSliderPointerDown: model.beginSlider, onSliderCommit: model.commitSlider }) :
        <p className="desktop-visual-hint">{t('desktopVisual.noModeSettings')}</p>}
    </div>
    {mode === 'tempera' || mode === 'cappella' || mode === 'monet' ? <p className="desktop-visual-hint">{t('desktopVisual.assetHint')}</p> : null}
  </>;
}
