import { Eye, EyeOff, Languages, Maximize2, Minimize2, Music2, Pin, RefreshCw, Settings2, Sparkles, Wallpaper, WholeWord } from 'lucide-react';
import type { Theme, VisualizerMode } from '../types';
import i18n from '../i18n/config';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { VisualizerModeGlyph } from '../components/visualizer/modeGlyphs';
import { MODES, desktopModeLabel } from './desktopModes';
import DesktopSelect from './DesktopSelect';
import DesktopTopbarMore, { type TopbarMoreAction } from './DesktopTopbarMore';

// src/desktopLyrics/DesktopTopbar.tsx — song details and everyday lyric controls in a lightweight toolbar.
type Props = {
  title: string; artist: string; cover: string; mode: VisualizerMode; onMode: (mode: VisualizerMode) => void;
  translated: boolean; onTranslated: (value: boolean) => void; topmost: boolean; onTopmost: (value: boolean) => void;
  playing: boolean; connected: boolean; manual: boolean; panel: boolean; onPanel: () => void; immersive: boolean; onImmersive: () => void;
  fullscreen: boolean; onFullscreen: () => void;
  onVisualSettings: () => void; animationIntensity: Theme['animationIntensity']; onAnimationIntensity: (value: Theme['animationIntensity']) => void;
  onBackgroundSettings: () => void; backgroundPanel: boolean; backgroundEnabled: boolean; backgroundSuppressed: boolean;
  canSegment: boolean; savedSegmentation?: boolean; onSegmentation: () => void;
  canRefreshTheme: boolean; refreshingTheme: boolean; refreshThemeUnavailableReason: string | null; onRefreshTheme: () => Promise<boolean>;
};
const text = (key: string) => i18n.t(`desktopLyrics.topbar.${key}`, { lng: 'zh-CN' });
const styleOptions = MODES.map(entry => ({ value: entry.mode, label: desktopModeLabel(entry.mode),
  icon: <VisualizerModeGlyph mode={entry.mode} size={16}/> }));
const intensities: Theme['animationIntensity'][] = ['calm', 'normal', 'chaotic'];
const visualText = (key: string) => i18n.t(`desktopVisual.${key}`, { lng: 'zh-CN' });
const refreshHintKeys: Record<string, string> = {
  disabled: 'refreshThemeDisabled', 'missing-cover': 'refreshThemeMissingCover', loading: 'refreshThemeLoading',
  neutral: 'refreshThemeNeutral', unreadable: 'refreshThemeUnreadable',
};

export default function DesktopTopbar(p: Props) {
  const compact = useMediaQuery('(max-width: 640px)');
  const connection = text(p.manual ? 'manual' : p.connected ? p.playing ? 'following' : 'connected' : 'waitingConnection');
  const refreshHint = p.refreshingTheme ? text('refreshingTheme')
    : text(refreshHintKeys[p.refreshThemeUnavailableReason || ''] || 'refreshThemeHint');
  const translationState = text(p.translated ? 'translationOn' : 'translationOff');
  const topmostState = text(p.topmost ? 'topmostOn' : 'topmostOff');
  const intensityLabel = visualText(p.animationIntensity === 'calm' ? 'intensityCalm' : p.animationIntensity === 'chaotic' ? 'intensityChaotic' : 'intensityNormal');
  const actions: TopbarMoreAction[] = [
    { id: 'refresh', label: text('refreshTheme'), title: refreshHint, icon: <RefreshCw size={17}/>,
      disabled: !p.canRefreshTheme || p.refreshingTheme, busy: p.refreshingTheme, onAction: () => { void p.onRefreshTheme(); } },
    { id: 'translation', label: text('translation'), title: translationState, state: translationState, icon: <Languages size={18}/>,
      checked: p.translated, onAction: () => p.onTranslated(!p.translated) },
    { id: 'topmost', label: text('topmost'), title: topmostState, state: topmostState, icon: <Pin size={17}/>,
      checked: p.topmost, onAction: () => p.onTopmost(!p.topmost) },
    { id: 'fullscreen', label: text('fullscreen'), title: p.fullscreen ? text('exitFullscreen') : text('fullscreen'),
      icon: p.fullscreen ? <Minimize2 size={18}/> : <Maximize2 size={18}/>, onAction: p.onFullscreen },
  ];
  return <div className="desktop-topbar-shell"><header className="desktop-topbar desktop-topbar-compact">
    <div className="track-caption" title={[p.title, p.artist].filter(Boolean).join(' · ')}>
      {p.cover ? <img src={p.cover} alt={text('cover')}/> : <span className="cover-placeholder" aria-hidden="true"><Music2 size={18}/></span>}
      <div><strong>{p.title || text('waitingMusic')}</strong><small>{p.artist || text('followPlayer')}</small></div>
    </div>
    <span className={`connection-pill ${p.playing ? 'playing' : ''}`} title={connection}><i/>{connection}</span>
    <div className="topbar-mode-picker" title={text('style')}>
      <DesktopSelect label={text('style')} value={p.mode} options={styleOptions} placeholder={p.mode === 'still' ? desktopModeLabel('still') : undefined} topbar
        menuAction={{ label: visualText('moreSettings'), onAction: p.onVisualSettings }}
        triggerPrefix={<Sparkles size={15}/>} onChange={value => {
        const entry = MODES.find(item => item.mode === value);
        if (entry) p.onMode(entry.mode);
      }}/>
    </div>
    <button className="style-intensity-button" aria-label={i18n.t('ui.animationIntensity', { lng: 'zh-CN' })}
      title={i18n.t('desktopVisual.intensityHint', { lng: 'zh-CN', state: intensityLabel })}
      onClick={() => p.onAnimationIntensity(intensities[(intensities.indexOf(p.animationIntensity) + 1) % intensities.length])}>{intensityLabel}</button>
    <button className={`icon-button segmentation-shortcut ${p.savedSegmentation ? 'selected' : ''}`} aria-label={visualText('segmentation')}
      title={visualText(p.canSegment ? 'segmentation' : 'segmentationUnavailable')} disabled={!p.canSegment} onClick={p.onSegmentation}><WholeWord size={17}/></button>
    <div className="topbar-actions">
      <button type="button" className={`icon-button background-settings-button ${p.backgroundPanel ? 'selected' : ''}`}
        aria-label={visualText('backgroundTitle')} aria-expanded={p.backgroundPanel}
        title={i18n.t('desktopVisual.backgroundStatus', { lng: 'zh-CN', state: visualText(p.backgroundSuppressed ? 'backgroundTransparentPriority' : p.backgroundEnabled ? 'enabled' : 'disabled') })}
        onClick={p.onBackgroundSettings}><Wallpaper size={18}/></button>
      {compact ? <DesktopTopbarMore label={text('more')} actions={actions}/> : <>
        <button className="icon-button theme-refresh-button" aria-label={actions[0].label} title={actions[0].title}
          disabled={actions[0].disabled} aria-busy={actions[0].busy} onClick={actions[0].onAction}>{actions[0].icon}</button>
        <button className={`icon-button ${p.translated ? 'selected' : ''}`} aria-label={actions[1].label} title={actions[1].title}
          aria-pressed={p.translated} onClick={actions[1].onAction}>{actions[1].icon}</button>
        <button className={`icon-button ${p.topmost ? 'selected' : ''}`} aria-label={actions[2].label} title={actions[2].title}
          aria-pressed={p.topmost} onClick={actions[2].onAction}>{actions[2].icon}</button>
        <button className="icon-button" aria-label={actions[3].label} title={actions[3].title}
          aria-pressed={p.fullscreen} onClick={actions[3].onAction}>{actions[3].icon}</button>
      </>}
      <button className={`icon-button ${p.panel ? 'selected' : ''}`} aria-label={text('settings')} title={text('settings')}
        aria-expanded={p.panel} onClick={p.onPanel}><Settings2 size={19}/></button>
      <span className="immersive-toggle-slot" aria-hidden="true"/>
    </div>
  </header><button className="restore-controls" aria-label={p.immersive ? '显示控制栏' : text('immersive')}
    title={p.immersive ? '显示控制栏' : text('immersive')} aria-pressed={p.immersive} onClick={p.onImmersive}>
      {p.immersive ? <Eye size={18}/> : <EyeOff size={18}/>}</button></div>;
}
