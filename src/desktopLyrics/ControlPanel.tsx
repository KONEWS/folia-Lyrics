import { useRef, type Dispatch, type SetStateAction } from 'react';
import { useMotionValueEvent, type MotionValue } from 'framer-motion';
import { FolderPlus, FileUp, RefreshCw, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { VISUALIZER_REGISTRY } from '../components/visualizer/registry';
import type { VisualizerMode } from '../types';
import { EMPTY, send, type LibrarySummary, type Preferences, type Session, type OnlineState } from './bridge';
import { clockPosition, timeLabel, type ManualClock } from './clock';
import OnlineLyricsPanel from './OnlineLyricsPanel';

// src/desktopLyrics/ControlPanel.tsx
export const MODES = VISUALIZER_REGISTRY.filter(entry => entry.mode !== 'still');
export function ClockReadout({ time, duration }: { time: MotionValue<number>; duration: number }) {
  const label = useRef<HTMLSpanElement>(null), previous = useRef(-1);
  useMotionValueEvent(time, 'change', value => { if (label.current && Math.floor(value) !== previous.current) { previous.current = Math.floor(value); label.current.textContent = timeLabel(value); } });
  return <div className="clock-readout"><span ref={label}>{timeLabel(time.get())}</span><span> / {duration > 0 ? timeLabel(duration) : '—:—'}</span></div>;
}
type Props = { mode: VisualizerMode; onMode: (mode: VisualizerMode) => void; session: Session; preferences: Preferences;
  library: LibrarySummary; online: OnlineState; scan: { active: boolean; text: string }; offset: number; onOffset: (value: number) => void;
  translated: boolean; onTranslated: (value: boolean) => void; manual: ManualClock; setManual: Dispatch<SetStateAction<ManualClock>>; audioStatus: string; onClose: () => void };
export default function ControlPanel(p: Props) {
  const toggleClock = () => p.setManual(old => ({ ...old, playing: !old.playing, position: clockPosition(EMPTY, performance.now(), old), received: performance.now() }));
  return <aside className="control-panel" aria-label="歌词设置">
    <div className="panel-heading"><div><span>歌词设置</span><small>让音乐，以你喜欢的方式呈现</small></div><button aria-label="关闭设置" onClick={p.onClose}><X size={18}/></button></div>
    <section><div className="section-label">歌词动效 <span>{MODES.length} 种</span></div><div className="effect-grid">{MODES.map((entry, i) => <button key={entry.mode}
      className={`effect ${p.mode === entry.mode ? 'active' : ''}`} aria-pressed={p.mode === entry.mode} onClick={() => p.onMode(entry.mode)}>
      <small>{String(i + 1).padStart(2, '0')}</small><span>{entry.labelFallback}</span></button>)}</div></section>
    <OnlineLyricsPanel session={p.session} preferences={p.preferences} online={p.online}/>
    <section><div className="section-label">播放器与本地歌词</div><select aria-label="选择播放器" value={p.preferences.source} onChange={e => send('source', e.target.value)}>
      <option value="">自动跟随正在播放的应用</option>
      {p.preferences.source && !p.session.sources.some(s => s.id === p.preferences.source) ? <option value={p.preferences.source}>{p.preferences.source}（未连接）</option> : null}
      {p.session.sources.map(s => <option value={s.id} key={s.id}>{s.label}</option>)}</select>
      <p className="hint">底部按钮控制这里选中的播放器，可暂停、继续和切换歌曲。歌词跟随它的实际进度；按钮灰色表示尚未连接或播放器不支持该操作。</p>
      <div className="action-row"><button disabled={p.scan.active} onClick={() => send('addFolder')}><FolderPlus size={15}/>添加音乐目录</button><button onClick={() => send('import')}><FileUp size={15}/>导入歌词</button></div>
      <div className="library-summary"><span>{p.scan.active ? p.scan.text : `已索引 ${p.library.count} 个本地文件`}</span><button aria-label="重新扫描" disabled={p.scan.active || !p.library.folders.length} onClick={() => send('rescan')}><RefreshCw size={14}/></button></div>
      {p.library.folders.length ? <details><summary>{p.library.folders.length} 个已添加目录</summary><ul>{p.library.folders.map(f => <li key={f}>{f}</li>)}</ul></details> : null}
      <p className="hint">可读取音乐内嵌歌词，以及 LRC、TTML、YRC、QRC、FIA 文件。普通逐行歌词不会自动变成精准逐字歌词。</p></section>
    <section><div className="section-label">歌词同步</div><div className="offset-row">
      <button aria-label="歌词延后 0.2 秒" onClick={() => p.onOffset(p.offset - .2)}><Minus size={16}/></button>
      <span>{p.offset === 0 ? '时间无偏移' : `${p.offset > 0 ? '提前' : '延后'} ${Math.abs(p.offset).toFixed(1)} 秒`}</span>
      <button aria-label="歌词提前 0.2 秒" onClick={() => p.onOffset(p.offset + .2)}><Plus size={16}/></button><button aria-label="重置歌词偏移" onClick={() => p.onOffset(0)}><RotateCcw size={14}/></button></div>
      <label className="toggle"><span>显示译文</span><input type="checkbox" checked={p.translated} onChange={e => p.onTranslated(e.target.checked)}/></label>
      <details><summary>播放器没有提供进度？</summary><p className="hint">开启手动歌词时钟，在外部播放器开始播放时点“开始计时”。这里只推进歌词，不播放音乐。</p>
        <label className="toggle"><span>手动歌词时钟</span><input type="checkbox" checked={p.manual.enabled} onChange={e => p.setManual({ enabled: e.target.checked, playing: false, position: 0, received: performance.now() })}/></label>
        {p.manual.enabled ? <div className="manual-controls"><button onClick={toggleClock}>{p.manual.playing ? '暂停计时' : '开始计时'}</button><label>定位到 <input aria-label="手动定位秒数" type="number" min="0" step=".1" defaultValue="0"
          onChange={e => { const position = Number(e.target.value); if (Number.isFinite(position)) p.setManual(old => ({ ...old, position: Math.max(0, position), received: performance.now() })); }}/> 秒</label></div> : null}</details></section>
    <section><div className="section-label">窗口与声音</div><label className="toggle"><span>窗口置顶</span><input type="checkbox" checked={p.preferences.topmost} onChange={e => send('topmost', e.target.checked)}/></label>
      <label className="toggle"><span>跟随系统声音变化</span><input type="checkbox" checked={p.preferences.audioReactive} onChange={e => send('audioReactive', e.target.checked)}/></label>
      <p className="hint">{p.audioStatus}。仅在内存中分析默认输出设备的混合声音。</p><button className="wide-button" onClick={() => send('clickThrough')}>启用鼠标穿透</button>
      <p className="hint">Ctrl + Alt + L 或双击托盘图标恢复操作。F11 切换全屏。</p></section>
    <footer className="panel-footer">Folia 桌面歌词 · 0.4.2<br/>基于 Folia Major 原版动效 · AGPL-3.0</footer>
  </aside>;
}
