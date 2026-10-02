import { Eye, EyeOff, Languages, Maximize2, Minimize2, Music2, Pin, RefreshCw, Settings2, Sparkles } from 'lucide-react';
import type { VisualizerMode } from '../types';
import i18n from '../i18n/config';
import { MODES } from './desktopModes';
import DesktopSelect from './DesktopSelect';

// src/desktopLyrics/DesktopTopbar.tsx — song details and everyday lyric controls in one glass bar.
type Props = {
  title: string; artist: string; cover: string; mode: VisualizerMode; onMode: (mode: VisualizerMode) => void;
  translated: boolean; onTranslated: (value: boolean) => void; topmost: boolean; onTopmost: (value: boolean) => void;
  playing: boolean; connected: boolean; manual: boolean; panel: boolean; onPanel: () => void; immersive: boolean; onImmersive: () => void;
  fullscreen: boolean; onFullscreen: () => void;
  canRefreshTheme: boolean; refreshingTheme: boolean; refreshThemeUnavailableReason: string | null; onRefreshTheme: () => Promise<boolean>;
};
const text = (key: string) => i18n.t(`desktopLyrics.topbar.${key}`, { lng: 'zh-CN' });
const styleOptions = MODES.map(entry => ({ value: entry.mode, label: entry.labelFallback }));
const refreshHintKeys: Record<string, string> = {
  disabled: 'refreshThemeDisabled', 'missing-cover': 'refreshThemeMissingCover', loading: 'refreshThemeLoading',
  neutral: 'refreshThemeNeutral', unreadable: 'refreshThemeUnreadable',
};

export default function DesktopTopbar(p: Props) {
  const connection = text(p.manual ? 'manual' : p.connected ? p.playing ? 'following' : 'connected' : 'waitingConnection');
  const refreshHint = p.refreshingTheme ? text('refreshingTheme')
    : text(refreshHintKeys[p.refreshThemeUnavailableReason || ''] || 'refreshThemeHint');
  return <div className="desktop-topbar-shell"><header className="desktop-topbar desktop-topbar-compact">
    <div className="track-caption" title={[p.title, p.artist].filter(Boolean).join(' · ')}>
      {p.cover ? <img src={p.cover} alt={text('cover')}/> : <span className="cover-placeholder" aria-hidden="true"><Music2 size={18}/></span>}
      <div><strong>{p.title || text('waitingMusic')}</strong><small>{p.artist || text('followPlayer')}</small></div>
    </div>
    <span className={`connection-pill ${p.playing ? 'playing' : ''}`} title={connection}><i/>{connection}</span>
    <div className="topbar-mode-picker" title={text('style')}>
      <Sparkles size={15} aria-hidden="true"/><span>{text('styleShort')}</span>
      <DesktopSelect label={text('style')} value={p.mode} options={styleOptions} topbar onChange={value => {
        const entry = MODES.find(item => item.mode === value);
        if (entry) p.onMode(entry.mode);
      }}/>
    </div>
    <div className="topbar-actions">
      <button className="icon-button theme-refresh-button" aria-label={text('refreshTheme')} title={refreshHint}
        disabled={!p.canRefreshTheme || p.refreshingTheme} aria-busy={p.refreshingTheme} onClick={() => { void p.onRefreshTheme(); }}><RefreshCw size={17}/></button>
      <button className={`icon-button ${p.translated ? 'selected' : ''}`} aria-label={text('translation')} title={text('translation')}
        aria-pressed={p.translated} onClick={() => p.onTranslated(!p.translated)}><Languages size={18}/></button>
      <button className={`icon-button ${p.topmost ? 'selected' : ''}`} aria-label={text('topmost')} title={text('topmost')}
        aria-pressed={p.topmost} onClick={() => p.onTopmost(!p.topmost)}><Pin size={17}/></button>
      <button className="icon-button" aria-label={text('fullscreen')} title={p.fullscreen ? text('exitFullscreen') : text('fullscreen')}
        aria-pressed={p.fullscreen} onClick={p.onFullscreen}>{p.fullscreen ? <Minimize2 size={18}/> : <Maximize2 size={18}/>}</button>
      <button className={`icon-button ${p.panel ? 'selected' : ''}`} aria-label={text('settings')} title={text('settings')}
        aria-expanded={p.panel} onClick={p.onPanel}><Settings2 size={19}/></button>
      <span className="immersive-toggle-slot" aria-hidden="true"/>
    </div>
  </header><button className="restore-controls" aria-label={p.immersive ? '显示控制栏' : text('immersive')}
    title={p.immersive ? '显示控制栏' : text('immersive')} aria-pressed={p.immersive} onClick={p.onImmersive}>
      {p.immersive ? <Eye size={18}/> : <EyeOff size={18}/>}</button></div>;
}
