import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, FileUp, FolderPlus, Settings2 } from 'lucide-react';
import VisualizerRenderer from '../components/visualizer/VisualizerRenderer';
import { PlayerBottomBarLayoutContext } from '../components/floating-player/PlayerBottomBarLayoutContext';
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
import AudioProgress from './AudioProgress';
import { useCoverTheme } from './useCoverTheme';
import { useImmersiveControls } from './useImmersiveControls';
import DesktopTopbar from './DesktopTopbar';
import { useDesktopHotkeys } from './useDesktopHotkeys';
import { useMediaControls } from './useMediaControls';
import { useDesktopPlaybackInput } from './useDesktopPlaybackInput';
import SystemVolumeFeedback from './SystemVolumeFeedback';
import { useDesktopSubtitleLayout } from './useDesktopSubtitleLayout';
import { useImmersiveToggleIdle } from './useImmersiveToggleIdle';

// src/desktopLyrics/DesktopLyrics.tsx
export default function DesktopLyrics() {
  const state = useDesktopState();
  const glassSurface = useGlassHighlights();
  const footer = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<VisualizerMode>(() => MODES.find(m => m.mode === localStorage.getItem('folia.desktop.mode.v1'))?.mode ?? 'classic');
  const [panel, setPanel] = useState(false), [immersive, setImmersive] = useState(false), [translated, setTranslated] = useState(true), [offset, setOffset] = useState(0);
  const [immersiveProgress, setImmersiveProgress] = useState(() => localStorage.getItem('folia.desktop.immersiveProgress.v1') === 'true');
  const [manual, setManual] = useState<ManualClock>({ enabled: false, playing: false, position: 0, received: performance.now() });
  const runtime = useVisualizerClock(state.lyrics.lines, state.clock, state.spectrum, manual, offset, state.preferences.audioReactive);
  const title = state.session.title || state.lyricInfo?.title || '', artist = state.session.artist || state.lyricInfo?.artist || '', cover = state.session.cover || state.lyricInfo?.cover || '';
  const coverTheme = useCoverTheme(cover, state.preferences.coverTheme);
  const { cursorHidden, controlsRevealed, topControlsRevealed } = useImmersiveControls({ root: glassSurface, immersive, setImmersive, panel,
    hasLyrics: state.lyrics.lines.length > 0, clickThrough: state.clickThrough, fullscreen: state.fullscreen, restore: state.restore, preferences: state.preferences });
  const immersiveToggleHidden = useImmersiveToggleIdle(glassSurface, immersive);
  const footerVisible = !immersive || controlsRevealed;
  useDesktopSubtitleLayout(glassSurface, footer, footerVisible);
  const playing = manual.enabled ? manual.playing : state.session.playing && state.session.hasTimeline && !state.connectionError;
  const duration = manual.enabled ? state.lyrics.lines.at(-1)?.endTime ?? 0 : state.session.duration;
  const offsetKey = `folia.desktop.offset.v1:${title}\n${artist}`;
  useEffect(() => { const n = Number(localStorage.getItem(offsetKey)); setOffset(Number.isFinite(n) ? n : 0); }, [offsetKey]);
  useEffect(() => setImmersive(false), [state.restore]);
  useEffect(() => { if (state.clickThrough) { setImmersive(true); setPanel(false); } }, [state.clickThrough]);
  const restoreControls = useCallback(() => { setPanel(false); setImmersive(false); }, []);
  useDesktopHotkeys(state.fullscreen, restoreControls);
  const mediaControls = useMediaControls(state.session, Boolean(state.connectionError));
  useDesktopPlaybackInput({ root: glassSurface, active: Boolean(state.session.key || state.lyrics.lines.length), panel,
    clickThrough: state.clickThrough, playing: state.session.playing, control: mediaControls.control });
  const changeMode = (next: VisualizerMode) => { setMode(next); localStorage.setItem('folia.desktop.mode.v1', next); };
  const changeOffset = (next: number) => { const n = Math.round(Math.min(120, Math.max(-120, next)) * 10) / 10; setOffset(n); localStorage.setItem(offsetKey, String(n)); };
  const changeImmersiveProgress = (next: boolean) => { setImmersiveProgress(next); localStorage.setItem('folia.desktop.immersiveProgress.v1', String(next)); };
  return <main ref={glassSurface} style={coverTheme.style} className={`desktop-lyrics ${coverTheme.active ? 'cover-theme' : ''} ${immersive ? 'immersive' : ''} ${cursorHidden ? 'cursor-idle' : ''} ${immersiveToggleHidden ? 'immersive-toggle-idle' : ''} ${controlsRevealed ? 'controls-revealed' : ''} ${topControlsRevealed ? 'top-controls-revealed' : ''} ${state.fullscreen ? 'native-fullscreen' : ''} ${state.appearance.acrylic ? 'native-acrylic' : ''} ${state.appearance.transparent ? 'transparent-background' : ''} ${state.appearance.solid ? 'solid-surfaces' : ''} ${state.appearance.highContrast ? 'high-contrast' : ''}`}>
    {state.appearance.transparent ? <div className="transparent-veil" aria-hidden="true"/> : <AcrylicBackdrop cover={cover}/>}<WindowChrome/><div className="desktop-stage">
    {state.lyrics.lines.length ? <VisualizerBoundary key={mode} onRecover={() => changeMode('classic')}><PlayerBottomBarLayoutContext.Provider value={true}>
      <VisualizerRenderer mode={mode} currentTime={runtime.currentTime} currentLineIndex={runtime.lineIndex} lines={state.lyrics.lines} theme={coverTheme.theme}
        audioPower={runtime.audioPower} audioBands={runtime.audioBands} songTitle={title} songArtist={artist} coverUrl={cover || undefined} showText paused={!playing}
        seed={state.session.key || title || 'desktop'} background={{ transparent: true }} isPreviewMode showSubtitleTranslation={translated} hideTranslationSubtitle={!translated}
        subtitleContentMode={translated ? 'translation' : 'none'} isPlayerChromeHidden={!footerVisible}/>
    </PlayerBottomBarLayoutContext.Provider></VisualizerBoundary> : <div className="waiting-screen"><div className="waiting-symbol"><AudioLines size={40} strokeWidth={1}/></div>
      <div className="eyebrow">FOLIA DESKTOP LYRICS</div><h1>{title ? '让歌词，跟上音乐。' : '音乐在播放，歌词在这里。'}</h1>
      <p>{title ? `已识别「${title}」 · ${state.online.message}` : '打开你常用的音乐播放器，识别歌曲后自动匹配在线歌词。'}</p>
      <div className="waiting-actions"><button className="primary-button" onClick={() => setPanel(true)}><Settings2 size={17}/>在线歌词设置</button><button disabled={state.scan.active} onClick={() => send('addFolder')}><FolderPlus size={17}/>选择音乐目录</button>
        <button onClick={() => send('import')}><FileUp size={17}/>导入歌词 / 音乐文件</button></div>
      <div className="waiting-notes"><span>原版 {MODES.length} 种动效</span><i/><span>在线自动匹配</span><i/><span>本地歌词缓存</span></div>
      <p className="compatibility-note">播放器需要支持 Windows 系统媒体接口。未识别时，可在设置中使用手动歌词时钟。</p></div>}</div>
    <DesktopTopbar title={title} artist={artist} cover={cover} mode={mode} onMode={changeMode} translated={translated} onTranslated={setTranslated}
      topmost={state.preferences.topmost} onTopmost={value => send('topmost', value)} playing={playing} connected={Boolean(state.session.key)} manual={manual.enabled}
      panel={panel} onPanel={() => { setPanel(!panel); setImmersive(false); }} immersive={immersive} onImmersive={() => { setImmersive(!immersive); setPanel(false); }}
      fullscreen={state.fullscreen} onFullscreen={() => send('fullscreen')} canRefreshTheme={coverTheme.canRefresh}
      refreshingTheme={coverTheme.refreshing} refreshThemeUnavailableReason={coverTheme.refreshUnavailableReason} onRefreshTheme={coverTheme.refresh}/>
    <footer ref={footer} className="desktop-statusbar"><div className="status-left"><strong>{title || '等待音乐'}</strong><ClockReadout time={runtime.playbackTime} duration={duration}/><small>{state.scan.active ? state.scan.text : state.lyricInfo?.source || state.online.message}</small></div>
      <PlaybackControls session={state.session} controls={mediaControls}/><div className="status-right"><span>{MODES.find(m => m.mode === mode)?.labelFallback}</span><small>{artist || '跟随你的播放器'}</small></div></footer>
    {!immersive || immersiveProgress ? <AudioProgress time={runtime.playbackTime} duration={duration} spectrum={runtime.audioBands.spectrum} input={state.spectrum}
      playing={playing} unavailable={Boolean(state.connectionError) || !manual.enabled && !state.session.hasTimeline}/> : null}
    {panel ? <ControlPanel mode={mode} onMode={changeMode} session={state.session} preferences={state.preferences} library={state.library} online={state.online} scan={state.scan} offset={offset} onOffset={changeOffset}
      translated={translated} onTranslated={setTranslated} immersiveProgress={immersiveProgress} onImmersiveProgress={changeImmersiveProgress} manual={manual} setManual={setManual} audioStatus={state.audioStatus} onClose={() => setPanel(false)}/> : null}
    {state.notice || state.connectionError || state.session.key && !state.session.hasTimeline && !manual.enabled ? <div className="desktop-notice" role="status">
      {state.notice || state.connectionError || '此播放器未提供有效进度，请在设置中使用手动歌词时钟。'}<button onClick={() => { state.setNotice(''); setPanel(true); }}>查看设置</button></div> : null}
    {!isDesktop() ? <div className="desktop-host-warning">界面预览 · 自动同步与文件读取需在 Windows EXE 中使用</div> : null}
    <SystemVolumeFeedback/>
  </main>;
}
