import { useEffect, useState } from 'react';
import { AudioLines, FileUp, FolderPlus, Maximize2, Settings2, EyeOff, Eye, Music2 } from 'lucide-react';
import VisualizerRenderer from '../components/visualizer/VisualizerRenderer';
import { PlayerBottomBarLayoutContext } from '../components/floating-player/PlayerBottomBarLayoutContext';
import { DEFAULT_THEME } from '../services/baseThemes';
import type { VisualizerMode } from '../types';
import { isDesktop, send } from './bridge';
import { useDesktopState } from './useDesktopState';
import { useVisualizerClock } from './useVisualizerClock';
import type { ManualClock } from './clock';
import ControlPanel, { MODES, ClockReadout } from './ControlPanel';
import VisualizerBoundary from './VisualizerBoundary';
import PlaybackControls from './PlaybackControls';
import WindowChrome from './WindowChrome';
import AcrylicBackdrop from './AcrylicBackdrop';
import { useGlassHighlights } from './useGlassHighlights';

// src/desktopLyrics/DesktopLyrics.tsx
export default function DesktopLyrics() {
  const state = useDesktopState();
  const glassSurface = useGlassHighlights();
  const [mode, setMode] = useState<VisualizerMode>(() => MODES.find(m => m.mode === localStorage.getItem('folia.desktop.mode.v1'))?.mode ?? 'classic');
  const [panel, setPanel] = useState(false), [immersive, setImmersive] = useState(false), [translated, setTranslated] = useState(true), [offset, setOffset] = useState(0);
  const [manual, setManual] = useState<ManualClock>({ enabled: false, playing: false, position: 0, received: performance.now() });
  const runtime = useVisualizerClock(state.lyrics.lines, state.clock, state.spectrum, manual, offset, state.preferences.audioReactive);
  const title = state.session.title || state.lyricInfo?.title || '', artist = state.session.artist || state.lyricInfo?.artist || '', cover = state.session.cover || state.lyricInfo?.cover || '';
  const playing = manual.enabled ? manual.playing : state.session.playing && state.session.hasTimeline && !state.connectionError;
  const duration = manual.enabled ? state.lyrics.lines.at(-1)?.endTime ?? 0 : state.session.duration;
  const offsetKey = `folia.desktop.offset.v1:${title}\n${artist}`;
  useEffect(() => { const n = Number(localStorage.getItem(offsetKey)); setOffset(Number.isFinite(n) ? n : 0); }, [offsetKey]);
  useEffect(() => setImmersive(false), [state.restore]);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPanel(false); setImmersive(false); } if (e.key === 'F11') { e.preventDefault(); send('fullscreen'); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, []);
  const changeMode = (next: VisualizerMode) => { setMode(next); localStorage.setItem('folia.desktop.mode.v1', next); };
  const changeOffset = (next: number) => { const n = Math.round(Math.min(120, Math.max(-120, next)) * 10) / 10; setOffset(n); localStorage.setItem(offsetKey, String(n)); };
  return <main ref={glassSurface} className={`desktop-lyrics ${immersive ? 'immersive' : ''} ${state.appearance.acrylic ? 'native-acrylic' : ''} ${state.appearance.solid ? 'solid-surfaces' : ''} ${state.appearance.highContrast ? 'high-contrast' : ''}`}><AcrylicBackdrop cover={cover}/><WindowChrome/><div className="desktop-stage">
    {state.lyrics.lines.length ? <VisualizerBoundary key={mode} onRecover={() => changeMode('classic')}><PlayerBottomBarLayoutContext.Provider value={false}>
      <VisualizerRenderer mode={mode} currentTime={runtime.currentTime} currentLineIndex={runtime.lineIndex} lines={state.lyrics.lines} theme={DEFAULT_THEME}
        audioPower={runtime.audioPower} audioBands={runtime.audioBands} songTitle={title} songArtist={artist} coverUrl={cover || undefined} showText paused={!playing}
        seed={state.session.key || title || 'desktop'} background={{ transparent: true }} isPreviewMode showSubtitleTranslation={translated} hideTranslationSubtitle={!translated}
        subtitleContentMode={translated ? 'translation' : 'none'} isPlayerChromeHidden={immersive}/>
    </PlayerBottomBarLayoutContext.Provider></VisualizerBoundary> : <div className="waiting-screen"><div className="waiting-symbol"><AudioLines size={40} strokeWidth={1}/></div>
      <div className="eyebrow">FOLIA DESKTOP LYRICS</div><h1>{title ? '让歌词，跟上音乐。' : '音乐在播放，歌词在这里。'}</h1>
      <p>{title ? `已识别「${title}」 · ${state.online.message}` : '打开你常用的音乐播放器，识别歌曲后自动匹配在线歌词。'}</p>
      <div className="waiting-actions"><button className="primary-button" onClick={() => setPanel(true)}><Settings2 size={17}/>在线歌词设置</button><button disabled={state.scan.active} onClick={() => send('addFolder')}><FolderPlus size={17}/>选择音乐目录</button>
        <button onClick={() => send('import')}><FileUp size={17}/>导入歌词 / 音乐文件</button></div>
      <div className="waiting-notes"><span>原版 12 种动效</span><i/><span>在线自动匹配</span><i/><span>本地歌词缓存</span></div>
      <p className="compatibility-note">播放器需要支持 Windows 系统媒体接口。未识别时，可在设置中使用手动歌词时钟。</p></div>}</div>
    <header className="desktop-topbar"><div className="desktop-brand">Folia<span>.</span><small>桌面歌词</small></div>
      <div className="track-caption">{cover ? <img src={cover} alt="专辑封面"/> : <span className="cover-placeholder"><Music2 size={18}/></span>}<div><strong>{title || '等待音乐'}</strong><small>{artist || '跟随你的播放器'}</small></div></div>
      <div className="topbar-space"/><span className={`connection-pill ${playing ? 'playing' : ''}`}><i/>{manual.enabled ? '手动计时' : state.session.key ? playing ? '正在跟随' : '已连接' : '等待连接'}</span>
      <div className="topbar-actions"><button className="icon-button" aria-label="沉浸显示" onClick={() => { setImmersive(true); setPanel(false); }}><EyeOff size={18}/></button>
      <button className="icon-button" aria-label="切换全屏" onClick={() => send('fullscreen')}><Maximize2 size={18}/></button>
      <button className={`icon-button ${panel ? 'selected' : ''}`} aria-label="打开歌词设置" aria-expanded={panel} onClick={() => setPanel(!panel)}><Settings2 size={19}/></button></div></header>
    <button className="restore-controls" aria-label="显示控制栏" onClick={() => setImmersive(false)}><Eye size={18}/></button>
    <footer className="desktop-statusbar"><div className="status-left"><span>{MODES.find(m => m.mode === mode)?.labelFallback}</span><small>{state.scan.active ? state.scan.text : state.lyricInfo?.source || state.online.message}</small></div>
      <PlaybackControls session={state.session} disconnected={Boolean(state.connectionError)}/><ClockReadout time={runtime.currentTime} duration={duration}/></footer>
    {panel ? <ControlPanel mode={mode} onMode={changeMode} session={state.session} preferences={state.preferences} library={state.library} online={state.online} scan={state.scan} offset={offset} onOffset={changeOffset}
      translated={translated} onTranslated={setTranslated} manual={manual} setManual={setManual} audioStatus={state.audioStatus} onClose={() => setPanel(false)}/> : null}
    {state.notice || state.connectionError || state.session.key && !state.session.hasTimeline && !manual.enabled ? <div className="desktop-notice" role="status">
      {state.notice || state.connectionError || '此播放器未提供有效进度，请在设置中使用手动歌词时钟。'}<button onClick={() => { state.setNotice(''); setPanel(true); }}>查看设置</button></div> : null}
    {!isDesktop() ? <div className="desktop-host-warning">界面预览 · 自动同步与文件读取需在 Windows EXE 中使用</div> : null}
  </main>;
}
