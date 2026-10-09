import { useEffect, useLayoutEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { useMotionValueEvent, type MotionValue } from 'framer-motion';
import { FolderPlus, FileUp, RefreshCw, Minus, Plus, RotateCcw } from 'lucide-react';
import type { VisualizerMode } from '../types';
import { EMPTY, send, type LibrarySummary, type Preferences, type Session, type OnlineState } from './bridge';
import { clockPosition, timeLabel, type ManualClock } from './clock';
import OnlineLyricsPanel from './OnlineLyricsPanel';
import i18n from '../i18n/config';
import ImmersiveSettings from './ImmersiveSettings';
import { MODES } from './desktopModes';
import DesktopSelect from './DesktopSelect';
import { useDesktopSettingsDismiss } from './useDesktopSettingsDismiss';

// src/desktopLyrics/ControlPanel.tsx
export { MODES };
const text = (key: string, values?: Record<string, string | number>) => i18n.t(`desktopLyrics.${key}`, { ...values, lng: 'zh-CN' });
export function ClockReadout({ time, duration }: { time: MotionValue<number>; duration: number }) {
  const label = useRef<HTMLSpanElement>(null), previous = useRef(-1);
  useMotionValueEvent(time, 'change', value => { if (label.current && Math.floor(value) !== previous.current) { previous.current = Math.floor(value); label.current.textContent = timeLabel(value); } });
  return <div className="clock-readout"><span ref={label}>{timeLabel(time.get())}</span><span> / {duration > 0 ? timeLabel(duration) : '—:—'}</span></div>;
}
type Props = { mode: VisualizerMode; onMode: (mode: VisualizerMode) => void; session: Session; preferences: Preferences;
  library: LibrarySummary; online: OnlineState; scan: { active: boolean; text: string }; offset: number; onOffset: (value: number) => void;
  translated: boolean; onTranslated: (value: boolean) => void; immersiveProgress: boolean; onImmersiveProgress: (value: boolean) => void; manual: ManualClock; setManual: Dispatch<SetStateAction<ManualClock>>; audioStatus: string; onClose: () => void;
  focusSection?: 'player' | 'online' | 'segmentation'; lyricSource?: string; onVisualSettings?: () => void;
  canSegment?: boolean; onSegmentation?: () => void };
export default function ControlPanel(p: Props) {
  const panelRef = useRef<HTMLElement>(null);
  useDesktopSettingsDismiss(panelRef, p.onClose);
  // Reveal the requested section and restore the editor entry without scrolling the lyrics behind this panel.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel || !p.focusSection) return;
    const section = panel.querySelector<HTMLElement>(`[data-settings-section="${p.focusSection === 'segmentation' ? 'sync' : p.focusSection}"]`);
    const target = p.focusSection === 'segmentation' ? section?.querySelector<HTMLElement>('.settings-segmentation-entry')
      : p.focusSection === 'online' ? section?.querySelector<HTMLElement>('.online-search') ?? section : section;
    if (target) panel.scrollTop += target.getBoundingClientRect().top - panel.getBoundingClientRect().top - panel.clientTop - 8;
    if (p.focusSection === 'segmentation') target?.focus({ preventScroll: true });
  }, [p.focusSection]);
  useEffect(() => {
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== document.body && !panelRef.current?.contains(active)
      ? active : document.querySelector<HTMLElement>('[data-settings-trigger]');
    return () => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  const toggleClock = () => p.setManual(old => ({ ...old, playing: !old.playing, position: clockPosition(EMPTY, performance.now(), old), received: performance.now() }));
  return <aside ref={panelRef} className="control-panel" aria-label="歌词设置">
    <section data-settings-section="transparency" aria-label={i18n.t('desktopLyrics.transparentBackground', { lng: 'zh-CN' })}>
      <label className="toggle"><span>{i18n.t('desktopLyrics.transparentBackground', { lng: 'zh-CN' })}</span><input type="checkbox" checked={p.preferences.transparentBackground} onChange={e => send('transparentBackground', e.target.checked)}/></label>
      <button className="wide-button" onClick={() => send('clickThrough')}>启用鼠标穿透</button>
      <p className="hint settings-recovery-hint">{text('settings.clickThroughRecovery')}</p>
      <details className="settings-help transparent-help"><summary>{text('settings.transparentHelp')}</summary>
        <p className="hint">{i18n.t('desktopLyrics.transparentHint', { lng: 'zh-CN' })}</p>
        <p className="hint">{i18n.t('desktopLyrics.clickThroughHint', { lng: 'zh-CN' })}</p></details></section>
    <section data-settings-section="sync"><div className="section-label">歌词同步</div>
      {p.lyricSource ? <p className="hint current-lyric-source">{text('settings.currentLyricSource', { source: p.lyricSource })}</p> : null}
      <div className="offset-row">
      <button aria-label="歌词延后 0.2 秒" onClick={() => p.onOffset(p.offset - .2)}><Minus size={16}/></button>
      <span>{p.offset === 0 ? '时间无偏移' : `${p.offset > 0 ? '提前' : '延后'} ${Math.abs(p.offset).toFixed(1)} 秒`}</span>
      <button aria-label="歌词提前 0.2 秒" onClick={() => p.onOffset(p.offset + .2)}><Plus size={16}/></button><button aria-label="重置歌词偏移" onClick={() => p.onOffset(0)}><RotateCcw size={14}/></button></div>
      <label className="toggle"><span>显示译文</span><input type="checkbox" checked={p.translated} onChange={e => p.onTranslated(e.target.checked)}/></label>
      {p.onSegmentation ? <button type="button" className="wide-button settings-segmentation-entry" disabled={!p.canSegment}
        title={i18n.t(`desktopVisual.${p.canSegment ? 'segmentation' : 'segmentationUnavailable'}`, { lng: 'zh-CN' })}
        onClick={p.onSegmentation}>{i18n.t('desktopVisual.segmentation', { lng: 'zh-CN' })}</button> : null}
      {p.manual.enabled || p.session.key && !p.session.hasTimeline ? <p className="hint settings-recovery-hint">{text(p.manual.enabled ? 'settings.manualActive' : 'settings.missingTimeline')}</p> : null}
      <details><summary>播放器没有提供进度？</summary><p className="hint">开启手动歌词时钟，在外部播放器开始播放时点“开始计时”。这里只推进歌词，不播放音乐。</p>
        <label className="toggle"><span>手动歌词时钟</span><input type="checkbox" checked={p.manual.enabled} onChange={e => p.setManual({ enabled: e.target.checked, playing: false, position: 0, received: performance.now() })}/></label>
        {p.manual.enabled ? <div className="manual-controls"><button onClick={toggleClock}>{p.manual.playing ? '暂停计时' : '开始计时'}</button><label>定位到 <input aria-label="手动定位秒数" type="number" min="0" step=".1" defaultValue="0"
          onChange={e => { const position = Number(e.target.value); if (Number.isFinite(position)) p.setManual(old => ({ ...old, position: Math.max(0, position), received: performance.now() })); }}/> 秒</label></div> : null}</details></section>
    <section data-settings-section="player" aria-label={text('settings.playerTitle')}><div className="section-label">{text('settings.playerTitle')}</div>
      <DesktopSelect label="选择播放器" value={p.preferences.source} onChange={value => send('source', value)} options={[
        { value: '', label: '自动跟随正在播放的应用' },
        ...(p.preferences.source && !p.session.sources.some(s => s.id === p.preferences.source) ? [{ value: p.preferences.source, label: `${p.preferences.source}（未连接）` }] : []),
        ...p.session.sources.map(source => ({ value: source.id, label: source.label })),
      ]}/>
      <p className="hint player-status">{p.session.key ? text('settings.currentPlayer', { player: p.session.source || '—' }) : text('settings.noPlayer')}</p>
      <details className="settings-help player-help"><summary>{text('settings.playerHelp')}</summary>
        <p className="hint">底部按钮控制这里选中的播放器，可暂停、继续和切换歌曲。歌词跟随它的实际进度；按钮灰色表示尚未连接或播放器不支持该操作。</p></details></section>
    {p.onVisualSettings ? <button className="wide-button settings-visual-entry" onClick={p.onVisualSettings}>{i18n.t('desktopVisual.openSettings', { lng: 'zh-CN' })}</button> : null}
    <ImmersiveSettings preferences={p.preferences}/>
    <section data-settings-section="window-sound"><div className="section-label">窗口与声音</div>
      <label className="toggle"><span>{i18n.t('desktopLyrics.immersiveProgress', { lng: 'zh-CN' })}</span><input type="checkbox" checked={p.immersiveProgress} onChange={e => p.onImmersiveProgress(e.target.checked)}/></label>
      <label className="toggle"><span>窗口置顶</span><input type="checkbox" checked={p.preferences.topmost} onChange={e => send('topmost', e.target.checked)}/></label>
      <label className="toggle"><span>{i18n.t('desktopLyrics.closeToTaskbar', { lng: 'zh-CN' })}</span><input type="checkbox" checked={p.preferences.closeToTaskbar} onChange={e => send('closeToTaskbar', e.target.checked)}/></label>
      <label className="toggle"><span>跟随系统声音变化</span><input type="checkbox" checked={p.preferences.audioReactive} onChange={e => send('audioReactive', e.target.checked)}/></label>
      <p className="hint audio-status">{p.audioStatus}</p>
      <details className="settings-help window-sound-help"><summary>{text('settings.windowSoundHelp')}</summary>
        <p className="hint">{i18n.t('desktopLyrics.audioProgressHint', { lng: 'zh-CN' })}</p>
        <p className="hint">{i18n.t('desktopLyrics.closeToTaskbarHint', { lng: 'zh-CN' })}</p>
        <p className="hint">{text('settings.soundCaptureHint')}</p></details></section>
    <OnlineLyricsPanel session={p.session} preferences={p.preferences} online={p.online}/>
    <section className="local-lyrics-settings" data-settings-section="local" aria-label={text('settings.localLyricsTitle')}><div className="section-label">{text('settings.localLyricsTitle')}</div>
      <div className="action-row"><button disabled={p.scan.active} onClick={() => send('addFolder')}><FolderPlus size={15}/>添加音乐目录</button><button onClick={() => send('import')}><FileUp size={15}/>导入歌词</button></div>
      <div className="library-summary"><span>{p.scan.active ? p.scan.text : `已索引 ${p.library.count} 个本地文件`}</span><button aria-label="重新扫描" disabled={p.scan.active || !p.library.folders.length} onClick={() => send('rescan')}><RefreshCw size={14}/></button></div>
      {p.library.folders.length ? <details><summary>{p.library.folders.length} 个已添加目录</summary><ul>{p.library.folders.map(f => <li key={f}>{f}</li>)}</ul></details> : null}
      <details className="settings-help local-formats-help"><summary>{text('settings.localFormatsHelp')}</summary>
        <p className="hint">可读取音乐内嵌歌词，以及 LRC、TTML、YRC、QRC、FIA 文件。普通逐行歌词不会自动变成精准逐字歌词。</p></details></section>
    <footer className="panel-footer">Folia 桌面歌词 · 0.4.30<br/>基于 Folia Major 原版动效 · AGPL-3.0</footer>
  </aside>;
}
