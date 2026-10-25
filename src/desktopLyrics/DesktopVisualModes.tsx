import type { VisualizerMode } from '../types';
import { getVisualizerRegistryEntry, getVisualizerModeLabel, VISUALIZER_REGISTRY } from '../components/visualizer/registry';
import { useVisualTranslation, VisualCard } from './DesktopVisualControls';
import type { DesktopVisualSettingsModel } from './useDesktopVisualSettings';
import DesktopRandomControls from './visualFeatures/DesktopRandomControls';

// src/desktopLyrics/DesktopVisualModes.tsx — exposes the upstream mode registry and its own tuning panels.
export default function DesktopVisualModes({ model, mode, onMode, editingMode = mode }: {
  model: DesktopVisualSettingsModel; mode: VisualizerMode; onMode: (mode: VisualizerMode) => void; editingMode?: VisualizerMode;
}) {
  const t = useVisualTranslation();
  const entry = getVisualizerRegistryEntry(editingMode);
  const panelProps = model.panelProps(editingMode);
  const dynamicModes = VISUALIZER_REGISTRY.filter(item => item.mode !== 'still');
  return <>
    <VisualCard><DesktopRandomControls showPool/></VisualCard>
    <VisualCard title={t('options.previewVisualizerSettings')}>
      <div className="desktop-visual-mode-grid" data-visual-mode-grid>
        {dynamicModes.map(item => <button key={item.mode} type="button" data-visual-mode={item.mode}
          aria-pressed={mode === item.mode} onClick={() => onMode(item.mode)}>{getVisualizerModeLabel(item.mode, t)}</button>)}
      </div>
      <div className="desktop-visual-still"><button type="button" data-visual-mode="still" aria-pressed={mode === 'still'}
        onClick={() => onMode('still')}>{getVisualizerModeLabel('still', t)}</button><p>{t('desktopVisual.stillHint')}</p></div>
      <button type="button" className="desktop-visual-reset" disabled={!entry.renderSettingsPanel || panelProps.tuning === undefined} onClick={() => model.resetMode(editingMode)}>
        {t('desktopVisual.resetMode')}
      </button>
    </VisualCard>
    <div className="desktop-visual-original-panel" data-visualizer-settings={editingMode}>
      {entry.renderSettingsPanel ? entry.renderSettingsPanel({ ...panelProps, t,
        theme: model.mergedTheme, isDaylight: false, controlCardBg: 'transparent', rangeInputClass: 'desktop-visual-native-range',
        onSliderPointerDown: model.beginSlider, onSliderCommit: model.commitSlider }) :
        <p className="desktop-visual-hint">{t('desktopVisual.noModeSettings')}</p>}
    </div>
    {editingMode === 'tempera' || editingMode === 'cappella' || editingMode === 'monet' ? <p className="desktop-visual-hint">{t('desktopVisual.assetHint')}</p> : null}
  </>;
}
