import DesktopSelect from './DesktopSelect';
import DesktopVisualFont from './DesktopVisualFont';
import { useVisualTranslation, VisualCard, VisualRange, VisualToggle } from './DesktopVisualControls';
import type { DesktopVisualSettingsModel } from './useDesktopVisualSettings';

// src/desktopLyrics/DesktopVisualSubtitle.tsx — original subtitle options without a separate playback clock.
export default function DesktopVisualSubtitle({ model }: { model: DesktopVisualSettingsModel }) {
  const t = useVisualTranslation();
  const settings = model.typography;
  const patch = model.patchTypography;
  const toggles = [
    ['subtitleOverlayBackground', 'options.subtitleOverlayBackground'],
    ['subtitleUpcomingLyricsBlur', 'options.subtitleUpcomingLyricsBlur'],
    ['subtitleFontInheritsLyrics', 'options.subtitleFontInheritsLyrics'],
    ['showHarmonySubtitle', 'desktopVisual.harmonySubtitle'],
    ['harmonySubtitleBackground', 'options.harmonySubtitleBackground'],
  ] as const;
  return <VisualCard title={t('options.previewSubtitleSettings')}>
    <button type="button" className="desktop-visual-reset" onClick={model.resetSubtitle}>{t('ui.default')}</button>
    <VisualToggle label={t('desktopVisual.showTranslation')} checked={model.translated} onChange={model.setTranslated}/>
    <label className="desktop-visual-field"><span>{t('options.subtitleContentMode')}</span><DesktopSelect label={t('options.subtitleContentMode')}
      value={settings.subtitleContentMode} onChange={value => patch({ subtitleContentMode: value as 'translation' | 'romanization' | 'none' })}
      options={(['translation', 'romanization', 'none'] as const).map(value => ({ value,
        label: t(`options.subtitleContent${value === 'translation' ? 'Translation' : value === 'romanization' ? 'Romanization' : 'None'}`) }))}/></label>
    {toggles.map(([key, label]) => <VisualToggle key={key} label={t(label)} checked={settings[key]} onChange={next => patch({ [key]: next })}/>)}
    <VisualRange label={t('options.subtitleFontScale')} value={settings.subtitleFontScale} min={0.85} max={1.4}
      display={`${Math.round(settings.subtitleFontScale * 100)}%`} onChange={subtitleFontScale => patch({ subtitleFontScale })}
      beginSlider={model.beginSlider} commitSlider={model.commitSlider}/>
    {!settings.subtitleFontInheritsLyrics ? <DesktopVisualFont theme={model.subtitleTheme} fontStyle={settings.subtitleFontStyle}
      family={settings.subtitleFontFamily} fallback={settings.subtitleFontFallbackFamilies} weight={settings.subtitleFontWeight}
      onStyle={subtitleFontStyle => patch({ subtitleFontStyle, subtitleFontFamily: null })} onFamily={subtitleFontFamily => patch({ subtitleFontFamily })}
      onFallback={subtitleFontFallbackFamilies => patch({ subtitleFontFallbackFamilies })} onWeight={subtitleFontWeight => patch({ subtitleFontWeight })}
      beginSlider={model.beginSlider} commitSlider={model.commitSlider}/> : null}
    <VisualRange label={t('options.subtitleOverlayOpacity')} value={settings.subtitleOverlayOpacity} min={0.2} max={1}
      display={`${Math.round(settings.subtitleOverlayOpacity * 100)}%`} onChange={subtitleOverlayOpacity => patch({ subtitleOverlayOpacity })}
      beginSlider={model.beginSlider} commitSlider={model.commitSlider}/>
    <p className="desktop-visual-hint">{t('desktopVisual.subtitleContentHint')}</p>
  </VisualCard>;
}
