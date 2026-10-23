import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import type { VisualizerMode } from '../types';
import DesktopVisualCommon from './DesktopVisualCommon';
import DesktopVisualBackground from './DesktopVisualBackground';
import DesktopVisualModes from './DesktopVisualModes';
import DesktopVisualSubtitle from './DesktopVisualSubtitle';
import DesktopVisualConfigActions from './DesktopVisualConfigActions';
import DesktopVisualFeedback from './DesktopVisualFeedback';
import DesktopVisualLanguage from './DesktopVisualLanguage';
import { useVisualTranslation } from './DesktopVisualControls';
import { useDesktopVisualDialogSkin } from './useDesktopVisualDialogSkin';
import { getDesktopVisualFocusableElements, useDesktopVisualDialogFocus } from './useDesktopVisualDialogFocus';
import { useDesktopSettingsDismiss } from './useDesktopSettingsDismiss';
import type { DesktopVisualSettingsModel } from './useDesktopVisualSettings';
import './desktop-visual-settings.css';
import DesktopSettingsSearch from './DesktopSettingsSearch';
import type { DesktopSettingsSearchEntry, DesktopSettingsSearchRequest } from '../types/desktopSettingsSearch';
import { useDesktopSettingsSearchNavigation } from './useDesktopSettingsSearchNavigation';
import { getVisualizerModeLabel } from '../components/visualizer/registry';
import { getVisualizerBackgroundModeLabel } from '../components/visualizer/backgrounds/registry';
import i18n from '../i18n/config';
import { SettingsKitThemeContext, settingsTokens } from '../components/modal/settings/kit/kitTheme';

// src/desktopLyrics/DesktopVisualSettings.tsx — one desktop settings surface, with the live original renderer behind it.
export type DesktopVisualSection = 'common' | 'background' | 'visualizer' | 'subtitle';
const SECTIONS: DesktopVisualSection[] = ['common', 'visualizer', 'subtitle'];
const SLIDER_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']);
const LABELS = { common: 'desktopVisual.commonTab', background: 'options.previewBackgroundSettings',
  visualizer: 'options.previewVisualizerSettings', subtitle: 'options.previewSubtitleSettings' } as const;
type Props = { mode: VisualizerMode; onMode: (mode: VisualizerMode) => void; model: DesktopVisualSettingsModel;
  onClose: () => void; initialSection?: DesktopVisualSection; navigationSequence?: number; onSegmentation?: () => void; canSegment?: boolean; returnFocus?: HTMLElement | null;
  searchNavigation?: DesktopSettingsSearchRequest; onSearchNavigate: (entry: DesktopSettingsSearchEntry) => void; onClearSearchNavigation: () => void };

export default function DesktopVisualSettings(props: Props) {
  return <SettingsKitThemeContext.Provider value={{ isDaylight: false, theme: props.model.mergedTheme }}><DesktopVisualLanguage><DesktopVisualSettingsSurface {...props}/></DesktopVisualLanguage></SettingsKitThemeContext.Provider>;
}

function DesktopVisualSettingsSurface({ mode, onMode, model, onClose, initialSection = 'visualizer', navigationSequence, onSegmentation, canSegment, returnFocus,
  searchNavigation, onSearchNavigate, onClearSearchNavigation }: Props) {
  const t = useVisualTranslation();
  const id = useId();
  const panel = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [section, setSection] = useState(initialSection);
  const backgroundOnly = initialSection === 'background';
  const title = t(backgroundOnly ? 'desktopVisual.backgroundTitle' : 'desktopVisual.title');
  const searchHint = useDesktopSettingsSearchNavigation(content, searchNavigation, section);
  const editingName = searchNavigation?.entry.mode ? getVisualizerModeLabel(searchNavigation.entry.mode, t)
    : searchNavigation?.entry.background ? getVisualizerBackgroundModeLabel(searchNavigation.entry.background, t) : '';
  useDesktopVisualDialogSkin(panel, model.mergedTheme, t('desktopVisual.closeImages'));
  useDesktopVisualDialogFocus(panel);
  useDesktopSettingsDismiss(panel, () => { model.commitSlider(); onClose(); });
  useEffect(() => {
    const previous = returnFocus ?? document.activeElement;
    if (!searchNavigation) closeButton.current?.focus();
    return () => { model.commitSlider(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
    // Capture opening focus once; model values change as the settings are edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (navigationSequence === undefined) return;
    setSection(initialSection);
    if (searchNavigation) return;
    const scroll = panel.current?.querySelector<HTMLElement>('.desktop-visual-content');
    if (scroll) scroll.scrollTop = 0;
    (document.getElementById(`${id}-${initialSection}`) ?? closeButton.current)?.focus({ preventScroll: true });
  }, [id, initialSection, navigationSequence]);
  // Original asset portals remain in this React tree; Escape respects their in-flight write lock.
  const keyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    const target = event.target instanceof Element ? event.target : null;
    const asset = target?.closest<HTMLElement>('.desktop-visual-asset-dialog');
    // Shared sheets own their capture/bubble order and restore their own opener.
    if (asset?.matches('[data-folia-sheet],.desktop-visual-sheet')) return;
    if (asset && event.key === 'Escape') {
      if (asset.querySelector('[role="menu"]')) return;
      event.preventDefault(); event.stopPropagation();
      const dialog = asset.firstElementChild;
      const close = dialog ? Array.from(dialog.children).find(child => child instanceof HTMLButtonElement) : null;
      if (close instanceof HTMLButtonElement && !close.disabled) close.click();
      return;
    }
    if (asset || target?.closest('.desktop-glass-menu')) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); model.commitSlider(); onClose(); }
    if (event.key !== 'Tab') return;
    const controls = panel.current ? getDesktopVisualFocusableElements(panel.current) : [];
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return <aside ref={panel} style={settingsTokens(false, model.mergedTheme)} role="dialog" aria-modal="true" aria-label={title} data-desktop-visual-settings
    className={`control-panel desktop-visual-settings${backgroundOnly ? ' desktop-background-settings' : ''}`} onKeyDown={keyboard}
    onKeyDownCapture={event => { if (event.target instanceof HTMLInputElement && event.target.type === 'range' && SLIDER_KEYS.has(event.key)) model.beginSlider(); }}
    onKeyUpCapture={event => { if (event.target instanceof HTMLInputElement && event.target.type === 'range' && SLIDER_KEYS.has(event.key)) model.commitSlider(); }}
    onBlurCapture={event => { if (event.target instanceof HTMLInputElement && event.target.type === 'range') model.commitSlider(); }}>
    <header className={`desktop-visual-heading${backgroundOnly ? ' panel-heading' : ''}`}><div><h2 id={`${id}-heading`}>{title}</h2>{!backgroundOnly ? <p>{t('desktopVisual.headingHint')}</p> : null}</div>
      <button ref={closeButton} type="button" aria-label={t(backgroundOnly ? 'desktopVisual.backgroundClose' : 'desktopVisual.close')} onClick={() => { model.commitSlider(); onClose(); }}><X size={19}/></button></header>
    <DesktopSettingsSearch onNavigate={entry => { model.commitSlider(); onSearchNavigate(entry); }}/>
    {searchHint ? <p className="desktop-settings-search-hint" role="status">{searchHint}</p> : null}
    {!backgroundOnly ? <div role="tablist" aria-label={t('desktopVisual.tabs')} className="desktop-visual-tabs">
      {SECTIONS.map(value => <button key={value} type="button" role="tab" id={`${id}-${value}`} aria-selected={section === value}
        aria-controls={`${id}-content`} tabIndex={section === value ? 0 : -1} onClick={() => { model.commitSlider(); onClearSearchNavigation(); setSection(value); }}
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation(); model.commitSlider();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? SECTIONS.length - 1 : (SECTIONS.indexOf(value) + (event.key === 'ArrowRight' ? 1 : -1) + SECTIONS.length) % SECTIONS.length;
          onClearSearchNavigation(); setSection(SECTIONS[next]); document.getElementById(`${id}-${SECTIONS[next]}`)?.focus();
        }}>{t(LABELS[value])}</button>)}
    </div> : null}
    <div ref={content} role={backgroundOnly ? 'region' : 'tabpanel'} id={`${id}-content`} aria-labelledby={backgroundOnly ? `${id}-heading` : `${id}-${section}`} data-visual-section={section} className={`desktop-visual-content${backgroundOnly ? ' desktop-settings-scroll' : ''}`}>
      {editingName ? <div className="desktop-search-editing"><span>{i18n.t('desktopLyrics.settingsSearch.editing', { lng: 'zh-CN', name: editingName })}</span>
        <button type="button" onClick={onClearSearchNavigation}>{t('desktopLyrics.settingsSearch.current')}</button></div> : null}
      {section === 'common' ? <DesktopVisualCommon model={model} mode={mode} onSegmentation={onSegmentation} canSegment={canSegment}/> : section === 'background' ? <DesktopVisualBackground model={model} mode={mode}
        editingBackground={searchNavigation?.entry.background} onSelection={onClearSearchNavigation}/>
        : section === 'subtitle' ? <DesktopVisualSubtitle model={model}/> : <DesktopVisualModes model={model} mode={mode} editingMode={searchNavigation?.entry.mode}
          onMode={next => { onClearSearchNavigation(); onMode(next); }}/>}
      <DesktopVisualConfigActions model={model} mode={mode} onMode={onMode}/>
    </div>
    <DesktopVisualFeedback/>
  </aside>;
}
