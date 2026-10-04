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

// src/desktopLyrics/DesktopVisualSettings.tsx — one desktop settings surface, with the live original renderer behind it.
export type DesktopVisualSection = 'common' | 'background' | 'visualizer' | 'subtitle';
const SECTIONS: DesktopVisualSection[] = ['common', 'visualizer', 'subtitle'];
const SLIDER_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']);
const LABELS = { common: 'options.previewCommonSettings', background: 'options.previewBackgroundSettings',
  visualizer: 'options.previewVisualizerSettings', subtitle: 'options.previewSubtitleSettings' } as const;
type Props = { mode: VisualizerMode; onMode: (mode: VisualizerMode) => void; model: DesktopVisualSettingsModel;
  onClose: () => void; initialSection?: DesktopVisualSection; onSegmentation?: () => void; canSegment?: boolean; returnFocus?: HTMLElement | null };

export default function DesktopVisualSettings(props: Props) {
  return <DesktopVisualLanguage><DesktopVisualSettingsSurface {...props}/></DesktopVisualLanguage>;
}

function DesktopVisualSettingsSurface({ mode, onMode, model, onClose, initialSection = 'visualizer', onSegmentation, canSegment, returnFocus }: Props) {
  const t = useVisualTranslation();
  const id = useId();
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [section, setSection] = useState(initialSection);
  const backgroundOnly = initialSection === 'background';
  const title = t(backgroundOnly ? 'desktopVisual.backgroundTitle' : 'desktopVisual.title');
  useDesktopVisualDialogSkin(panel, model.mergedTheme, t('desktopVisual.closeImages'));
  useDesktopVisualDialogFocus(panel);
  useDesktopSettingsDismiss(panel, () => { model.commitSlider(); onClose(); });
  useEffect(() => {
    const previous = returnFocus ?? document.activeElement;
    closeButton.current?.focus();
    return () => { model.commitSlider(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
    // Capture opening focus once; model values change as the settings are edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Original asset portals remain in this React tree; Escape respects their in-flight write lock.
  const keyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    const target = event.target instanceof Element ? event.target : null;
    const asset = target?.closest<HTMLElement>('.desktop-visual-asset-dialog');
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
  return <aside ref={panel} role="dialog" aria-modal="true" aria-label={title} data-desktop-visual-settings
    className="control-panel desktop-visual-settings" onKeyDown={keyboard}
    onKeyDownCapture={event => { if (event.target instanceof HTMLInputElement && event.target.type === 'range' && SLIDER_KEYS.has(event.key)) model.beginSlider(); }}
    onKeyUpCapture={event => { if (event.target instanceof HTMLInputElement && event.target.type === 'range' && SLIDER_KEYS.has(event.key)) model.commitSlider(); }}
    onBlurCapture={event => { if (event.target instanceof HTMLInputElement && event.target.type === 'range') model.commitSlider(); }}>
    <header className="desktop-visual-heading"><div><h2 id={`${id}-heading`}>{title}</h2><p>{t('desktopVisual.headingHint')}</p></div>
      <button ref={closeButton} type="button" aria-label={t(backgroundOnly ? 'desktopVisual.backgroundClose' : 'desktopVisual.close')} onClick={() => { model.commitSlider(); onClose(); }}><X size={19}/></button></header>
    {!backgroundOnly ? <div role="tablist" aria-label={t('desktopVisual.tabs')} className="desktop-visual-tabs">
      {SECTIONS.map(value => <button key={value} type="button" role="tab" id={`${id}-${value}`} aria-selected={section === value}
        aria-controls={`${id}-content`} tabIndex={section === value ? 0 : -1} onClick={() => { model.commitSlider(); setSection(value); }}
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation(); model.commitSlider();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? SECTIONS.length - 1 : (SECTIONS.indexOf(value) + (event.key === 'ArrowRight' ? 1 : -1) + SECTIONS.length) % SECTIONS.length;
          setSection(SECTIONS[next]); document.getElementById(`${id}-${SECTIONS[next]}`)?.focus();
        }}>{t(LABELS[value])}</button>)}
    </div> : null}
    <div role={backgroundOnly ? 'region' : 'tabpanel'} id={`${id}-content`} aria-labelledby={backgroundOnly ? `${id}-heading` : `${id}-${section}`} data-visual-section={section} className="desktop-visual-content" key={section}>
      {section === 'common' ? <DesktopVisualCommon model={model} mode={mode} onSegmentation={onSegmentation} canSegment={canSegment}/> : section === 'background' ? <DesktopVisualBackground model={model} mode={mode}/>
        : section === 'subtitle' ? <DesktopVisualSubtitle model={model}/> : <DesktopVisualModes model={model} mode={mode} onMode={onMode}/>}
      <DesktopVisualConfigActions model={model} mode={mode} onMode={onMode}/>
    </div>
    <DesktopVisualFeedback/>
  </aside>;
}
