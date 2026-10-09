import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { VisualizerMode } from '../types';
import { isDesktop, send } from './bridge';
import { useDesktopState } from './useDesktopState';
import { useVisualizerClock } from './useVisualizerClock';
import type { ManualClock } from './clock';
import ControlPanel, { ClockReadout } from './ControlPanel';
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
import DesktopWaitingScreen from './DesktopWaitingScreen';
import { prepareDesktopFonts } from './desktopFonts';
import { ALL_MODES } from './desktopModes';
import { getVisualizerRegistryEntry } from '../components/visualizer/registry';
import { useDesktopVisualSettings } from './useDesktopVisualSettings';
import { useDesktopSegmentation } from './useDesktopSegmentation';
import type { DesktopVisualSection } from './DesktopVisualSettings';
import i18n from '../i18n/config';
import { useTypographySettingsStore } from '../stores/useTypographySettingsStore';
import { useDesktopSettingsTransparency } from './useDesktopSettingsTransparency';

// src/desktopLyrics/DesktopLyrics.tsx
const DesktopStage = lazy(() => Promise.all([import('./DesktopStage'), prepareDesktopFonts()]).then(([stage]) => stage));
const DesktopVisualSettings = lazy(() => import('./DesktopVisualSettings'));
const DesktopSegmentationSettings = lazy(() => import('./DesktopSegmentationSettings'));
export default function DesktopLyrics() {
  const state = useDesktopState();
  const glassSurface = useGlassHighlights();
  useDesktopSettingsTransparency(glassSurface);
  const footer = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<VisualizerMode>(() => ALL_MODES.find(m => m.mode === localStorage.getItem('folia.desktop.mode.v1'))?.mode ?? 'classic');
  const [panel, setPanel] = useState(false), [immersive, setImmersive] = useState(false), [offset, setOffset] = useState(0);
  const translated = useTypographySettingsStore(settings => settings.showSubtitleTranslation && settings.subtitleContentMode !== 'none' && !settings.hidePlayerTranslationSubtitle);
  const changeTranslated = useCallback((enabled: boolean) => {
    const saved = useTypographySettingsStore.getState();
    const content = enabled ? saved.subtitleContentMode === 'none' ? 'translation' : saved.subtitleContentMode : 'none';
    if (enabled && saved.hidePlayerTranslationSubtitle) saved.handleToggleHidePlayerTranslationSubtitle(false);
    if (saved.subtitleContentMode !== content || saved.showSubtitleTranslation !== enabled) saved.handleSetSubtitleContentMode(content);
  }, []);
  const [panelSection, setPanelSection] = useState<'player' | 'online' | 'segmentation' | undefined>();
  const [visualSection, setVisualSection] = useState<DesktopVisualSection | null>(null), [segmentationOpen, setSegmentationOpen] = useState(false);
  const visualOpener = useRef<HTMLElement | null>(null), segmentationOpener = useRef<HTMLElement | null>(null);
  const segmentationFromSettings = useRef(false);
  const [immersiveProgress, setImmersiveProgress] = useState(() => localStorage.getItem('folia.desktop.immersiveProgress.v1') === 'true');
  const [manual, setManual] = useState<ManualClock>({ enabled: false, playing: false, position: 0, received: performance.now() });
  const songIdentity = state.session.key || state.lyricInfo?.key || (state.lyricInfo ? `${state.lyricInfo.source}\n${state.lyricInfo.title}\n${state.lyricInfo.artist}` : '');
  const segmentation = useDesktopSegmentation(songIdentity, state.lyrics);
  const runtime = useVisualizerClock(segmentation.lyrics.lines, state.clock, state.spectrum, manual, offset, state.preferences.audioReactive);
  const title = state.session.title || state.lyricInfo?.title || '', artist = state.session.artist || state.lyricInfo?.artist || '', cover = state.session.cover || state.lyricInfo?.cover || '';
  const coverTheme = useCoverTheme(cover, state.preferences.coverTheme);
  const visual = useDesktopVisualSettings({ baseTheme: coverTheme.theme, cover, transparent: Boolean(state.appearance.transparent), translated, onTranslated: changeTranslated });
  const anyPanel = panel || visualSection !== null || segmentationOpen;
  const canSegment = Boolean(state.lyrics.lines.length && getVisualizerRegistryEntry(mode).usesWordSegmentation);
  const { cursorHidden, controlsRevealed, topControlsRevealed } = useImmersiveControls({ root: glassSurface, immersive, setImmersive, panel: anyPanel,
    hasLyrics: state.lyrics.lines.length > 0, clickThrough: state.clickThrough, fullscreen: state.fullscreen, restore: state.restore, preferences: state.preferences });
  const immersiveToggleHidden = useImmersiveToggleIdle(glassSurface, immersive);
  const footerVisible = !immersive || controlsRevealed;
  useDesktopSubtitleLayout(glassSurface, footer, footerVisible);
  const playing = manual.enabled ? manual.playing : state.session.playing && state.session.hasTimeline && !state.connectionError;
  const duration = manual.enabled ? state.lyrics.lines.at(-1)?.endTime ?? 0 : state.session.duration;
  const offsetKey = `folia.desktop.offset.v1:${title}\n${artist}`;
  useEffect(() => { const n = Number(localStorage.getItem(offsetKey)); setOffset(Number.isFinite(n) ? n : 0); }, [offsetKey]);
  useEffect(() => setImmersive(false), [state.restore]);
  useEffect(() => { if (state.clickThrough) { setImmersive(true); setPanel(false); setVisualSection(null); setSegmentationOpen(false); } }, [state.clickThrough]);
  useEffect(() => setSegmentationOpen(false), [songIdentity]);
  const restoreControls = useCallback(() => { setPanel(false); setVisualSection(null); setSegmentationOpen(false); setImmersive(false); }, []);
  useDesktopHotkeys(state.fullscreen, restoreControls);
  const mediaControls = useMediaControls(state.session, Boolean(state.connectionError));
  useDesktopPlaybackInput({ root: glassSurface, active: Boolean(state.session.key || state.lyrics.lines.length), panel: anyPanel,
    clickThrough: state.clickThrough, playing: state.session.playing, control: mediaControls.control });
  const changeMode = useCallback((next: VisualizerMode) => { if (ALL_MODES.some(entry => entry.mode === next)) { setMode(next); localStorage.setItem('folia.desktop.mode.v1', next); } }, []);
  const recoverStage = useCallback(() => changeMode('classic'), [changeMode]);
  const changeOffset = (next: number) => { const n = Math.round(Math.min(120, Math.max(-120, next)) * 10) / 10; setOffset(n); localStorage.setItem(offsetKey, String(n)); };
  const changeImmersiveProgress = (next: boolean) => { setImmersiveProgress(next); localStorage.setItem('folia.desktop.immersiveProgress.v1', String(next)); };
  const showSettings = (section?: 'player' | 'online') => { setVisualSection(null); setSegmentationOpen(false); setPanelSection(section); setPanel(true); setImmersive(false); };
  // Capture before lazy loading and chrome blur; discarded menu/panel buttons return to the persistent style trigger.
  const captureVisualOpener = () => {
    const active = document.activeElement;
    return active instanceof HTMLElement && active !== document.body && !active.closest('.control-panel,.desktop-top-menu')
      ? active : glassSurface.current?.querySelector<HTMLElement>('.topbar-mode-picker [role="combobox"]') ?? null;
  };
  const showVisualSettings = (section: DesktopVisualSection = 'visualizer') => { visualOpener.current = captureVisualOpener(); setPanel(false); setSegmentationOpen(false); setVisualSection(section); setImmersive(false); };
  // Return to the current-song settings entry when the editor was opened from that panel.
  const showSegmentation = () => {
    if (!canSegment) return;
    segmentationFromSettings.current = panel;
    segmentationOpener.current = panel && document.activeElement instanceof HTMLElement ? document.activeElement : captureVisualOpener();
    setPanel(false); setVisualSection(null); setSegmentationOpen(true); setImmersive(false);
  };
  const closeSegmentation = () => {
    setSegmentationOpen(false);
    if (segmentationFromSettings.current) { setPanelSection('segmentation'); setPanel(true); }
  };
  return <main ref={glassSurface} style={coverTheme.style} className={`desktop-lyrics ${coverTheme.active ? 'cover-theme' : ''} ${immersive ? 'immersive' : ''} ${cursorHidden ? 'cursor-idle' : ''} ${immersiveToggleHidden ? 'immersive-toggle-idle' : ''} ${controlsRevealed ? 'controls-revealed' : ''} ${topControlsRevealed ? 'top-controls-revealed' : ''} ${state.fullscreen ? 'native-fullscreen' : ''} ${state.appearance.acrylic ? 'native-acrylic' : ''} ${state.appearance.transparent ? 'transparent-background' : ''} ${state.appearance.solid ? 'solid-surfaces' : ''} ${state.appearance.highContrast ? 'high-contrast' : ''}`}>
    {state.appearance.transparent ? <div className="transparent-veil" aria-hidden="true"/> : <AcrylicBackdrop cover={cover}/>}<WindowChrome/><div className="desktop-stage">
    {state.lyrics.lines.length ? <Suspense fallback={null}><DesktopStage mode={mode} onRecover={recoverStage} currentTime={runtime.currentTime} currentLineIndex={runtime.lineIndex} lines={segmentation.lyrics.lines} theme={visual.mergedTheme}
        audioPower={runtime.audioPower} audioBands={runtime.audioBands} songTitle={title} songArtist={artist} coverUrl={cover || undefined} showText paused={!playing}
        seed={state.session.key || title || 'desktop'} isPreviewMode={false} {...visual.rendererProps} isPlayerChromeHidden={!footerVisible}/></Suspense> : <DesktopWaitingScreen session={state.session} online={state.online} preferences={state.preferences}
      connectionError={state.connectionError} lyricStatus={state.lyricStatus} title={title} scanning={state.scan.active} onSettings={showSettings}/>}</div>
    <DesktopTopbar title={title} artist={artist} cover={cover} mode={mode} onMode={changeMode} translated={translated} onTranslated={changeTranslated}
      topmost={state.preferences.topmost} onTopmost={value => send('topmost', value)} playing={playing} connected={Boolean(state.session.key)} manual={manual.enabled}
      panel={anyPanel} onPanel={() => { if (anyPanel) { setPanel(false); setVisualSection(null); setSegmentationOpen(false); } else showSettings(); }} immersive={immersive} onImmersive={() => { setImmersive(!immersive); setPanel(false); setVisualSection(null); setSegmentationOpen(false); }}
      onVisualSettings={() => showVisualSettings()} animationIntensity={visual.animationIntensity} onAnimationIntensity={visual.setAnimationIntensity}
      onBackgroundSettings={() => { if (visualSection === 'background') setVisualSection(null); else showVisualSettings('background'); }}
      backgroundPanel={visualSection === 'background'} backgroundEnabled={visual.backgroundEnabled} backgroundSuppressed={visual.backgroundSuppressed}
      fullscreen={state.fullscreen} onFullscreen={() => send('fullscreen')} canRefreshTheme={coverTheme.canRefresh}
      refreshingTheme={coverTheme.refreshing} refreshThemeUnavailableReason={coverTheme.refreshUnavailableReason} onRefreshTheme={coverTheme.refresh}/>
    <footer ref={footer} className="desktop-statusbar desktop-playback-bar"><div className="status-left"><ClockReadout time={runtime.playbackTime} duration={duration}/></div>
      <PlaybackControls session={state.session} controls={mediaControls}/></footer>
    {!immersive || immersiveProgress ? <AudioProgress time={runtime.playbackTime} duration={duration} spectrum={runtime.audioBands.spectrum} input={state.spectrum}
      playing={playing} unavailable={Boolean(state.connectionError) || !manual.enabled && !state.session.hasTimeline}/> : null}
    {panel ? <ControlPanel mode={mode} onMode={changeMode} session={state.session} preferences={state.preferences} library={state.library} online={state.online} scan={state.scan} offset={offset} onOffset={changeOffset}
      translated={translated} onTranslated={changeTranslated} immersiveProgress={immersiveProgress} onImmersiveProgress={changeImmersiveProgress} manual={manual} setManual={setManual} audioStatus={state.audioStatus}
      lyricSource={state.lyricInfo?.source} focusSection={panelSection} onVisualSettings={() => showVisualSettings()} canSegment={canSegment} onSegmentation={showSegmentation} onClose={() => setPanel(false)}/> : null}
    {visualSection !== null || segmentationOpen ? <Suspense fallback={<aside className="control-panel" role="status">{i18n.t('desktopVisual.loadingSettings', { lng: 'zh-CN' })}</aside>}>
      {visualSection !== null ? <DesktopVisualSettings key={visualSection === 'background' ? 'background' : 'visual'} initialSection={visualSection} mode={mode} onMode={changeMode} model={visual}
        returnFocus={visualOpener.current} canSegment={canSegment} onSegmentation={showSegmentation} onClose={() => setVisualSection(null)}/> : <DesktopSegmentationSettings model={segmentation} returnFocus={segmentationOpener.current} onClose={closeSegmentation}/>}
    </Suspense> : null}
    {state.notice || state.connectionError || state.session.key && !state.session.hasTimeline && !manual.enabled ? <div className="desktop-notice" role="status">
      {state.notice || state.connectionError || i18n.t('desktopLyrics.settings.noTimelineNotice', { lng: 'zh-CN' })}<button onClick={() => { state.setNotice(''); showSettings(); }}>{i18n.t('desktopLyrics.settings.noTimelineAction', { lng: 'zh-CN' })}</button></div> : null}
    {!isDesktop() ? <div className="desktop-host-warning">{i18n.t('desktopLyrics.settings.previewMode', { lng: 'zh-CN' })}</div> : null}
    <SystemVolumeFeedback/>
  </main>;
}
