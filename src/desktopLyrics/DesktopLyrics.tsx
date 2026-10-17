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
import { useDesktopFonts } from './useDesktopFonts';
import { ALL_MODES } from './desktopModes';
import { getVisualizerRegistryEntry } from '../components/visualizer/registry';
import { useDesktopVisualSettings } from './useDesktopVisualSettings';
import { useDesktopSegmentation } from './useDesktopSegmentation';
import type { DesktopVisualSection } from './DesktopVisualSettings';
import i18n from '../i18n/config';
import { useTypographySettingsStore } from '../stores/useTypographySettingsStore';
import { useDesktopSettingsTransparency } from './useDesktopSettingsTransparency';
import { useDesktopLyricOffset } from './useDesktopLyricOffset';
import { useDesktopSettingsModules } from './useDesktopSettingsModules';
import DesktopNotice from './DesktopNotice';
import DesktopMusicAppDiscovery from './DesktopMusicAppDiscovery';
import type { DesktopNoticeData, DesktopSettingsRequest, DesktopSettingsTarget } from '../types/desktopSettings';
import type { DesktopSettingsSearchEntry, DesktopSettingsSearchRequest } from '../types/desktopSettingsSearch';

// src/desktopLyrics/DesktopLyrics.tsx
const DesktopStage = lazy(() => import('./DesktopStage'));
export default function DesktopLyrics() {
  const state = useDesktopState();
  const { visual: DesktopVisualSettings, segmentation: DesktopSegmentationSettings, open: openSettingsModule, cancel: cancelSettingsOpening } = useDesktopSettingsModules();
  const glassSurface = useGlassHighlights();
  useDesktopSettingsTransparency(glassSurface);
  const footer = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<VisualizerMode>(() => ALL_MODES.find(m => m.mode === localStorage.getItem('folia.desktop.mode.v1'))?.mode ?? 'classic');
  const [panel, setPanel] = useState(false), [immersive, setImmersive] = useState(false);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const translated = useTypographySettingsStore(settings => settings.showSubtitleTranslation && settings.subtitleContentMode !== 'none' && !settings.hidePlayerTranslationSubtitle);
  const changeTranslated = useCallback((enabled: boolean) => {
    const saved = useTypographySettingsStore.getState();
    const content = enabled ? saved.subtitleContentMode === 'none' ? 'translation' : saved.subtitleContentMode : 'none';
    if (enabled && saved.hidePlayerTranslationSubtitle) saved.handleToggleHidePlayerTranslationSubtitle(false);
    if (saved.subtitleContentMode !== content || saved.showSubtitleTranslation !== enabled) saved.handleSetSubtitleContentMode(content);
  }, []);
  const [panelNavigation, setPanelNavigation] = useState<DesktopSettingsRequest>();
  const [searchNavigation, setSearchNavigation] = useState<DesktopSettingsSearchRequest>();
  const navigationSequence = useRef(0);
  const [visualSection, setVisualSection] = useState<DesktopVisualSection | null>(null), [segmentationOpen, setSegmentationOpen] = useState(false);
  const [visualNavigation, setVisualNavigation] = useState(0);
  const mainOpener = useRef<HTMLElement | null>(null), visualOpener = useRef<HTMLElement | null>(null), segmentationOpener = useRef<HTMLElement | null>(null);
  const segmentationFromSettings = useRef(false);
  const [immersiveProgress, setImmersiveProgress] = useState(() => localStorage.getItem('folia.desktop.immersiveProgress.v1') === 'true');
  const [manual, setManual] = useState<ManualClock>({ enabled: false, playing: false, position: 0, received: performance.now() });
  const songIdentity = state.session.key || state.lyricInfo?.key || (state.lyricInfo ? `${state.lyricInfo.source}\n${state.lyricInfo.title}\n${state.lyricInfo.artist}` : '');
  const title = state.session.title || state.lyricInfo?.title || '', artist = state.session.artist || state.lyricInfo?.artist || '', cover = state.session.cover || state.lyricInfo?.cover || '';
  const { offset, changeOffset } = useDesktopLyricOffset({ ...state.session, title, artist }, state.lyricInfo);
  const segmentation = useDesktopSegmentation(songIdentity, state.lyrics);
  const coverTheme = useCoverTheme(cover, state.preferences.coverTheme);
  const visual = useDesktopVisualSettings({ baseTheme: coverTheme.theme, cover, transparent: Boolean(state.appearance.transparent), translated, onTranslated: changeTranslated });
  const fontsReady = useDesktopFonts({ lines: segmentation.lyrics.lines, theme: visual.mergedTheme, subtitleTheme: visual.subtitleTheme, title, artist,
    hideTranslationSubtitle: visual.rendererProps.hideTranslationSubtitle, subtitleContentMode: visual.rendererProps.subtitleContentMode,
    showHarmonySubtitle: visual.rendererProps.showHarmonySubtitle }, state.setNotice);
  const hasLyrics = state.lyrics.lines.length > 0;
  const runtime = useVisualizerClock(segmentation.lyrics.lines, state.clock, state.spectrum, manual, offset, state.preferences.audioReactive,
    state.frameDemand, state.lyricInfo?.key ?? '', hasLyrics && fontsReady);
  const stageLoaded = useRef(false); if (hasLyrics) stageLoaded.current = true;
  const anyPanel = panel || visualSection !== null || segmentationOpen || discoveryOpen;
  const canSegment = Boolean(state.lyrics.lines.length && getVisualizerRegistryEntry(mode).usesWordSegmentation);
  const { cursorHidden, controlsRevealed, topControlsRevealed } = useImmersiveControls({ root: glassSurface, immersive, setImmersive, panel: anyPanel,
    hasLyrics: state.lyrics.lines.length > 0, clickThrough: state.clickThrough, fullscreen: state.fullscreen, restore: state.restore, preferences: state.preferences });
  const immersiveToggleHidden = useImmersiveToggleIdle(glassSurface, immersive);
  const footerVisible = !immersive || controlsRevealed;
  useDesktopSubtitleLayout(glassSurface, footer, footerVisible);
  const playing = manual.enabled ? manual.playing : state.session.playing && state.session.hasTimeline && !state.connectionError;
  const duration = manual.enabled ? state.lyrics.lines.at(-1)?.endTime ?? 0 : state.session.duration;
  useEffect(() => { cancelSettingsOpening(); setImmersive(false); }, [state.restore, cancelSettingsOpening]);
  useEffect(() => { if (state.clickThrough) { cancelSettingsOpening(); setImmersive(true); setPanel(false); setVisualSection(null); setSegmentationOpen(false); } }, [state.clickThrough, cancelSettingsOpening]);
  useEffect(() => { cancelSettingsOpening('segmentation'); setSegmentationOpen(false); }, [songIdentity, state.preferences.source, cancelSettingsOpening]);
  useEffect(() => { if (!canSegment) { cancelSettingsOpening('segmentation'); setSegmentationOpen(false); } }, [canSegment, cancelSettingsOpening]);
  const restoreControls = useCallback(() => { cancelSettingsOpening(); setPanel(false); setVisualSection(null); setSegmentationOpen(false); setImmersive(false); }, [cancelSettingsOpening]);
  useDesktopHotkeys(state.fullscreen, restoreControls);
  const mediaControls = useMediaControls(state.session, Boolean(state.connectionError));
  useDesktopPlaybackInput({ root: glassSurface, active: Boolean(state.session.key || state.lyrics.lines.length), panel: anyPanel,
    clickThrough: state.clickThrough, playing: state.session.playing, control: mediaControls.control });
  const changeMode = useCallback((next: VisualizerMode) => { if (ALL_MODES.some(entry => entry.mode === next)) { setMode(next); localStorage.setItem('folia.desktop.mode.v1', next); } }, []);
  const recoverStage = useCallback(() => changeMode('classic'), [changeMode]);
  const changeImmersiveProgress = (next: boolean) => { setImmersiveProgress(next); localStorage.setItem('folia.desktop.immersiveProgress.v1', String(next)); };
  const showSettings = (target?: DesktopSettingsTarget) => {
    // Capture the clicked entry before the previous panel restores focus during unmount.
    if (!panel) mainOpener.current = glassSurface.current?.querySelector<HTMLElement>('[data-settings-trigger]') ?? null;
    cancelSettingsOpening(); setVisualSection(null); setSegmentationOpen(false);
    setSearchNavigation(undefined);
    setPanelNavigation(target ? { sequence: ++navigationSequence.current, target } : undefined); setPanel(true); setImmersive(false);
  };
  const settingsLoadError = () => state.setNotice({ text: i18n.t('desktopVisual.settingsLoadFailed', { lng: 'zh-CN' }), target: { id: 'visual-settings' } });
  // Capture before lazy loading and chrome blur; discarded menu/panel buttons return to the persistent style trigger.
  const captureVisualOpener = () => {
    const active = document.activeElement;
    return active instanceof HTMLElement && active !== document.body && !active.closest('.control-panel,.desktop-top-menu')
      ? active : glassSurface.current?.querySelector<HTMLElement>('.topbar-mode-picker [role="combobox"]') ?? null;
  };
  const showVisualSettings = (section: DesktopVisualSection = 'visualizer', stableOpener?: HTMLElement | null, searchEntry?: DesktopSettingsSearchEntry) => {
    const opener = stableOpener ?? captureVisualOpener();
    openSettingsModule('visual', () => { visualOpener.current = opener; setPanel(false); setSegmentationOpen(false); setVisualSection(section); setVisualNavigation(value => value + 1);
      setSearchNavigation(searchEntry ? { sequence: ++navigationSequence.current, entry: searchEntry } : undefined); setImmersive(false); },
      () => state.setNotice({ text: i18n.t('desktopVisual.settingsLoadFailed', { lng: 'zh-CN' }), target: { id: section === 'background' ? 'background-settings' : 'visual-settings' } }));
  };
  const navigateSettings = (target?: DesktopSettingsTarget) => {
    if (target?.id === 'visual-settings' || target?.id === 'background-settings') showVisualSettings(target.id === 'background-settings' ? 'background' : 'visualizer',
      glassSurface.current?.querySelector<HTMLElement>(target.id === 'background-settings' ? '[data-background-settings-trigger]' : '[data-settings-trigger]'));
    else showSettings(target);
  };
  const navigateSearch = (entry: DesktopSettingsSearchEntry) => {
    if (entry.section === 'main') { showSettings(); setSearchNavigation({ sequence: ++navigationSequence.current, entry }); }
    else showVisualSettings(entry.section, glassSurface.current?.querySelector<HTMLElement>(entry.section === 'background' ? '[data-background-settings-trigger]' : '[data-settings-trigger]'), entry);
  };
  useEffect(() => {
    // Host navigation runs after the restore effect, so it cannot cancel its own deferred module opening.
    if (state.settingsRequest) navigateSettings(state.settingsRequest.target);
    // Each host message owns a fresh request; ordinary renders must preserve drafts and scroll position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.settingsRequest]);
  // Return to the current-song settings entry when the editor was opened from that panel.
  const showSegmentation = () => {
    if (!canSegment) return;
    const fromSettings = panel, opener = panel && document.activeElement instanceof HTMLElement ? document.activeElement : captureVisualOpener();
    openSettingsModule('segmentation', () => {
      segmentationFromSettings.current = fromSettings; segmentationOpener.current = opener;
      setPanel(false); setVisualSection(null); setSegmentationOpen(true); setImmersive(false);
    }, settingsLoadError);
  };
  const closeSegmentation = () => {
    cancelSettingsOpening();
    setSegmentationOpen(false);
    if (segmentationFromSettings.current) { setPanelNavigation({ sequence: ++navigationSequence.current, target: { id: 'segmentation' } }); setPanel(true); }
  };
  const notice: DesktopNoticeData | null = state.notice ?? (state.session.key && !state.session.hasTimeline && !manual.enabled
    ? { text: i18n.t('desktopLyrics.settings.noTimelineNotice', { lng: 'zh-CN' }), target: { id: 'manual-clock' } } : null);
  const waiting = <DesktopWaitingScreen session={state.session} online={state.online} preferences={state.preferences}
    connectionError={state.connectionError} lyricStatus={state.lyricStatus} title={title} scanning={state.scan.active} onSettings={showSettings}/>;
  return <main ref={glassSurface} style={coverTheme.style} className={`desktop-lyrics ${coverTheme.active ? 'cover-theme' : ''} ${immersive ? 'immersive' : ''} ${cursorHidden ? 'cursor-idle' : ''} ${immersiveToggleHidden ? 'immersive-toggle-idle' : ''} ${controlsRevealed ? 'controls-revealed' : ''} ${topControlsRevealed ? 'top-controls-revealed' : ''} ${state.fullscreen ? 'native-fullscreen' : ''} ${state.appearance.acrylic ? 'native-acrylic' : ''} ${state.appearance.transparent ? 'transparent-background' : ''} ${state.appearance.solid ? 'solid-surfaces' : ''} ${state.appearance.highContrast ? 'high-contrast' : ''}`}>
    {state.appearance.transparent ? <div className="transparent-veil" aria-hidden="true"/> : <AcrylicBackdrop cover={cover}/>}<WindowChrome session={state.session} apps={state.preferences.musicApps} preferred={state.preferences.source}/><div className="desktop-stage">
    {stageLoaded.current ? <Suspense fallback={waiting}><DesktopStage ready={hasLyrics && fontsReady} fallback={hasLyrics ? null : waiting} mode={mode} onRecover={recoverStage} currentTime={runtime.currentTime} currentLineIndex={runtime.lineIndex} lines={segmentation.lyrics.lines} theme={visual.mergedTheme}
        audioPower={runtime.audioPower} audioBands={runtime.audioBands} songTitle={title} songArtist={artist} coverUrl={cover || undefined} showText paused={!playing}
        seed={state.session.key || title || 'desktop'} isPreviewMode={false} {...visual.rendererProps} isPlayerChromeHidden={!footerVisible}/></Suspense> : waiting}</div>
    <DesktopTopbar title={title} artist={artist} cover={cover} mode={mode} onMode={changeMode} translated={translated} onTranslated={changeTranslated}
      topmost={state.preferences.topmost} onTopmost={value => send('topmost', value)} playing={playing} connected={Boolean(state.session.key)} manual={manual.enabled}
      panel={panel} onPanel={() => { if (panel) { cancelSettingsOpening(); setPanel(false); } else showSettings(); }} immersive={immersive} onImmersive={() => { cancelSettingsOpening(); setImmersive(!immersive); setPanel(false); setVisualSection(null); setSegmentationOpen(false); }}
      onVisualSettings={() => showVisualSettings()} animationIntensity={visual.animationIntensity} onAnimationIntensity={visual.setAnimationIntensity}
      onBackgroundSettings={() => { if (visualSection === 'background') { cancelSettingsOpening(); setVisualSection(null); } else showVisualSettings('background'); }}
      backgroundPanel={visualSection === 'background'} backgroundEnabled={visual.backgroundEnabled} backgroundSuppressed={visual.backgroundSuppressed}
      fullscreen={state.fullscreen} onFullscreen={() => send('fullscreen')} canRefreshTheme={coverTheme.canRefresh}
      refreshingTheme={coverTheme.refreshing} refreshThemeUnavailableReason={coverTheme.refreshUnavailableReason} onRefreshTheme={coverTheme.refresh}/>
    <footer ref={footer} className="desktop-statusbar desktop-playback-bar"><div className="status-left"><ClockReadout time={runtime.playbackTime} duration={duration}/></div>
      <PlaybackControls session={state.session} controls={mediaControls}/></footer>
    {!immersive || immersiveProgress ? <AudioProgress time={runtime.playbackTime} duration={duration} spectrum={runtime.audioBands.spectrum} input={state.spectrum}
      playing={playing} unavailable={Boolean(state.connectionError) || !manual.enabled && !state.session.hasTimeline}/> : null}
    {panel ? <ControlPanel mode={mode} onMode={changeMode} session={state.session} preferences={state.preferences} library={state.library} online={state.online} scan={state.scan} offset={offset} onOffset={changeOffset}
      translated={translated} onTranslated={changeTranslated} immersiveProgress={immersiveProgress} onImmersiveProgress={changeImmersiveProgress} manual={manual} setManual={setManual} audioStatus={state.audioStatus}
      lyricSource={state.lyricInfo?.source} navigation={panelNavigation} searchNavigation={searchNavigation} onSearchNavigate={navigateSearch} returnFocus={mainOpener.current} onVisualSettings={() => showVisualSettings()} canSegment={canSegment} onSegmentation={showSegmentation} onClose={() => { cancelSettingsOpening(); setPanel(false); }}/> : null}
    {visualSection !== null && DesktopVisualSettings ? <DesktopVisualSettings key={visualSection === 'background' ? 'background' : 'visual'} initialSection={visualSection} navigationSequence={visualNavigation} mode={mode} onMode={changeMode} model={visual}
      returnFocus={visualOpener.current} searchNavigation={searchNavigation} onSearchNavigate={navigateSearch} onClearSearchNavigation={() => setSearchNavigation(undefined)}
      canSegment={canSegment} onSegmentation={showSegmentation} onClose={() => { cancelSettingsOpening(); setVisualSection(null); }}/> : null}
    {segmentationOpen && DesktopSegmentationSettings ? <DesktopSegmentationSettings model={segmentation} returnFocus={segmentationOpener.current} onClose={closeSegmentation}/> : null}
    {notice ? <DesktopNotice text={notice.text}
      action={notice.target ? i18n.t('desktopLyrics.settings.noTimelineAction', { lng: 'zh-CN' }) : '关闭'} onAction={() => { state.setNotice(''); if (notice.target) navigateSettings(notice.target); }}/> : null}
    {!isDesktop() ? <div className="desktop-host-warning">{i18n.t('desktopLyrics.settings.previewMode', { lng: 'zh-CN' })}</div> : null}
    <DesktopMusicAppDiscovery enabled={!state.clickThrough} onOpenChange={setDiscoveryOpen}/>
    <SystemVolumeFeedback/>
  </main>;
}
