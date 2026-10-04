import type { VisualizerMode } from '../types';
import DesktopSelect from './DesktopSelect';
import DesktopVisualFont from './DesktopVisualFont';
import { useVisualTranslation, VisualCard, VisualRange, VisualToggle } from './DesktopVisualControls';
import type { DesktopVisualSettingsModel } from './useDesktopVisualSettings';
import DesktopSettingsTransparency from './DesktopSettingsTransparency';

// src/desktopLyrics/DesktopVisualCommon.tsx — global typography and motion controls for the original renderer.
export default function DesktopVisualCommon({ model, mode, onSegmentation, canSegment = false }: {
  model: DesktopVisualSettingsModel; mode: VisualizerMode; onSegmentation?: () => void; canSegment?: boolean;
}) {
  const t = useVisualTranslation();
  const settings = model.typography;
  const patch = model.patchTypography;
  const autoSize = ['sonnet', 'tempera', 'lumiere'].includes(mode);
  return <>
    <VisualCard title={t('options.previewCommonSettings')}>
      <button type="button" className="desktop-visual-reset" onClick={model.resetCommon}>{t('ui.default')}</button>
      <DesktopSettingsTransparency/>
      <label className="desktop-visual-field"><span>{t('ui.animationIntensity')}</span><DesktopSelect
        value={model.animationIntensity} label={t('ui.animationIntensity')} onChange={value => model.setAnimationIntensity(value as 'calm' | 'normal' | 'chaotic')}
        options={['calm', 'normal', 'chaotic'].map(value => ({ value, label: t(`animation.${value}`) }))}/></label>
      <DesktopVisualFont theme={model.mergedTheme} fontStyle={settings.lyricsFontStyle} family={settings.lyricsCustomFont?.family ?? null}
        fallback={settings.lyricsFontFallbackFamilies} weight={settings.lyricsFontWeight}
        onStyle={lyricsFontStyle => patch({ lyricsFontStyle, lyricsCustomFont: null })}
        onFamily={family => patch({ lyricsCustomFont: family ? { source: 'system', family, label: family } : null })}
        onFallback={lyricsFontFallbackFamilies => patch({ lyricsFontFallbackFamilies })} onWeight={lyricsFontWeight => patch({ lyricsFontWeight })}
        beginSlider={model.beginSlider} commitSlider={model.commitSlider}/>
      <fieldset disabled={autoSize} className="desktop-visual-size"><VisualRange label={t('options.fontSize')}
        value={settings.lyricsFontScale} min={0.85} max={1.4} display={`${Math.round(settings.lyricsFontScale * 100)}%`}
        onChange={lyricsFontScale => patch({ lyricsFontScale })} beginSlider={model.beginSlider} commitSlider={model.commitSlider}/></fieldset>
      {autoSize ? <p className="desktop-visual-hint">{t(`options.${mode}FontSizeAutoNotice`)}</p> : null}
      <VisualRange label={t('options.visualizerOpacity')} value={model.visualizer.visualizerOpacity} min={0.2} max={1}
        display={`${Math.round(model.visualizer.visualizerOpacity * 100)}%`} onChange={visualizerOpacity => model.patchVisualizer({ visualizerOpacity })}
        beginSlider={model.beginSlider} commitSlider={model.commitSlider}/>
      <VisualToggle label={t('desktopVisual.staticMode')} checked={model.staticMode} onChange={model.setStaticMode}/>
      <button type="button" disabled={!canSegment || !onSegmentation} onClick={onSegmentation}>{t('desktopVisual.segmentation')}</button>
      {!canSegment ? <p className="desktop-visual-hint">{t('desktopVisual.segmentationUnavailable')}</p> : null}
      <p className="desktop-visual-hint">{t('desktopVisual.livePreviewHint')}</p>
    </VisualCard>
  </>;
}
