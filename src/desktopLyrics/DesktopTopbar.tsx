import { Eye, EyeOff, Languages, Maximize2, Minimize2, Music2, Pin, RefreshCw, Settings2, Sparkles, Wallpaper } from 'lucide-react';
import type { Theme, VisualizerMode } from '../types';
import i18n from '../i18n/config';
import { VisualizerModeGlyph } from '../components/visualizer/modeGlyphs';
import { MODES, desktopModeLabel } from './desktopModes';
import DesktopSelect from './DesktopSelect';

// src/desktopLyrics/DesktopTopbar.tsx — song details and everyday lyric controls in a lightweight toolbar.
type Props = {
  title: string; artist: string; cover: string; mode: VisualizerMode; onMode: (mode: VisualizerMode) => void;
  translated: boolean; onTranslated: (value: boolean) => void; topmost: boolean; onTopmost: (value: boolean) => void;
  playing: boolean; connected: boolean; manual: boolean; panel: boolean; onPanel: () => void; immersive: boolean; onImmersive: () => void;
  fullscreen: boolean; onFullscreen: () => void;
  onVisualSettings: () => void; animationIntensity: Theme['animationIntensity']; onAnimationIntensity: (value: Theme['animationIntensity']) => void;
  onBackgroundSettings: () => void; backgroundPanel: boolean; backgroundEnabled: boolean; backgroundSuppressed: boolean;
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
  const connection = text(p.manual ? 'manual' : p.connected ? p.playing ? 'following' : 'connected' : 'waitingConnection');
  const refreshHint = p.refreshingTheme ? text('refreshingTheme')
    : text(refreshHintKeys[p.refreshThemeUnavailableReason || ''] || 'refreshThemeHint');
  const translationState = text(p.translated ? 'translationOn' : 'translationOff');
  const topmostState = text(p.topmost ? 'topmostOn' : 'topmostOff');
  const intensityLabel = visualText(p.animationIntensity === 'calm' ? 'intensityCalm' : p.animationIntensity === 'chaotic' ? 'intensityChaotic' : 'intensityNormal');
  const nextIntensity = intensities[(intensities.indexOf(p.animationIntensity) + 1) % intensities.length];
  const immersiveRestoreLabel = text(p.immersive ? 'showControls' : 'immersive');
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
      onClick={() => p.onAnimationIntensity(nextIntensity)}>{intensityLabel}</button>
    <div className="topbar-actions">
      <button type="button" className={`icon-button background-settings-button ${p.backgroundPanel ? 'selected' : ''}`}
        aria-label={visualText('backgroundTitle')} aria-expanded={p.backgroundPanel}
        title={i18n.t('desktopVisual.backgroundStatus', { lng: 'zh-CN', state: visualText(p.backgroundSuppressed ? 'backgroundTransparentPriority' : p.backgroundEnabled ? 'enabled' : 'disabled') })}
        onClick={p.onBackgroundSettings}><Wallpaper size={18}/></button>
      <button className="icon-button theme-refresh-button" aria-label={text('refreshTheme')} title={refreshHint}
        disabled={!p.canRefreshTheme || p.refreshingTheme} aria-busy={p.refreshingTheme} onClick={() => { void p.onRefreshTheme(); }}><RefreshCw size={17}/></button>
      <button className={`icon-button ${p.translated ? 'selected' : ''}`} aria-label={text('translation')} title={translationState}
        aria-pressed={p.translated} onClick={() => p.onTranslated(!p.translated)}><Languages size={18}/></button>
      <button className={`icon-button ${p.topmost ? 'selected' : ''}`} aria-label={text('topmost')} title={topmostState}
        aria-pressed={p.topmost} onClick={() => p.onTopmost(!p.topmost)}><Pin size={17}/></button>
      <button className="icon-button" aria-label={text('fullscreen')} title={p.fullscreen ? text('exitFullscreen') : text('fullscreen')}
        aria-pressed={p.fullscreen} onClick={p.onFullscreen}>{p.fullscreen ? <Minimize2 size={18}/> : <Maximize2 size={18}/>}</button>
      <button data-settings-trigger className={`icon-button ${p.panel ? 'selected' : ''}`} aria-label={text('settings')} title={text('settings')}
        aria-expanded={p.panel} onClick={p.onPanel}><Settings2 size={19}/></button>
      <span className="immersive-toggle-slot" aria-hidden="true"/>
    </div>
  </header><button className="restore-controls" aria-label={immersiveRestoreLabel}
    title={immersiveRestoreLabel} aria-pressed={p.immersive} onClick={p.onImmersive}>
      {p.immersive ? <Eye size={18}/> : <EyeOff size={18}/>}</button></div>;
}
