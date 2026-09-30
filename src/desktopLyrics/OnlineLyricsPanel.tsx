import { useEffect, useState } from 'react';
import { Search, LoaderCircle, Check, Globe2 } from 'lucide-react';
import { send, type OnlineState, type Preferences, type Session } from './bridge';
import { timeLabel } from './clock';

// src/desktopLyrics/OnlineLyricsPanel.tsx
const SOURCES = [
  { id: 'kugou', name: '酷狗音乐', detail: '优先获取 KRC 逐字歌词' },
  { id: 'qq', name: 'QQ 音乐', detail: 'QRC 逐字 · 逐行回退 · 译文' },
  { id: 'netease', name: '网易云音乐', detail: '逐字 / 逐行 · 译文 · 罗马音' },
  { id: 'lrclib', name: 'LRCLIB', detail: '社区同步歌词库' },
];
export default function OnlineLyricsPanel({ session, preferences, online }: { session: Session; preferences: Preferences; online: OnlineState }) {
  const [title, setTitle] = useState(session.title), [artist, setArtist] = useState(session.artist);
  useEffect(() => { setTitle(session.title); setArtist(session.artist); }, [session.key, session.title, session.artist]);
  return <section className="online-lyrics-panel" aria-label="在线歌词">
    <div className="section-label"><span className="online-heading"><Globe2 size={13}/>在线歌词</span><span>自动匹配 / 手动选词</span></div>
    <label className="toggle"><span>自动匹配在线歌词</span><input type="checkbox" checked={preferences.onlineEnabled} onChange={e => send('onlineEnabled', e.target.checked)}/></label>
    <div className="lyric-sources">{SOURCES.map(source => <label key={source.id} className="lyric-source">
      <div><strong>{source.name}</strong><small>{source.detail}</small></div>
      <input type="checkbox" aria-label={`启用${source.name}歌词源`} checked={preferences.onlineProviders.includes(source.id)} disabled={!preferences.onlineEnabled}
        onChange={e => send('onlineProvider', { id: source.id, enabled: e.target.checked })}/></label>)}</div>
    <p className="hint">找不到本地歌词时自动联网。只发送歌名、歌手、专辑和时长，不上传音频。已匹配歌词会缓存；关闭联网后仍可使用缓存。</p>
    <form className="online-search" onSubmit={e => { e.preventDefault(); send('searchOnline', { title: title.trim(), artist: artist.trim() }); }}>
      <label>歌名<input aria-label="在线搜索歌名" value={title} maxLength={200} placeholder="输入歌名" onChange={e => setTitle(e.target.value)}/></label>
      <label>歌手<input aria-label="在线搜索歌手" value={artist} maxLength={200} placeholder="可留空，手动选择版本" onChange={e => setArtist(e.target.value)}/></label>
      <div className="action-row"><button type="submit" disabled={!preferences.onlineEnabled || !title.trim() || online.busy || !preferences.onlineProviders.length}>
        {online.busy ? <LoaderCircle className="online-spinner" size={14}/> : <Search size={14}/>}搜索在线歌词</button>
        <button type="button" disabled={!session.title || online.busy} onClick={() => send('resetOnline')}>重新自动匹配</button></div>
    </form>
    <p className={`online-status ${online.busy ? 'busy' : ''}`} role="status">{online.message}</p>
    {online.errors.length > 0 ? <details className="online-errors"><summary>部分歌词源暂不可用</summary>{online.errors.map((error, i) => <p key={i}>{error}</p>)}</details> : null}
    <div className="online-results">{online.candidates.map(candidate => <button key={candidate.key} className={`online-result ${candidate.key === online.selectedKey ? 'chosen' : ''}`}
      disabled={online.busy || !preferences.onlineEnabled || !preferences.onlineProviders.includes(candidate.provider) || !candidate.available}
      onClick={() => send('selectOnline', { id: candidate.key, songKey: session.key })} aria-label={`使用歌词：${candidate.title} / ${candidate.artist} / ${candidate.id}`}>
      <span className="result-heading"><strong>{candidate.title}</strong>{candidate.key === online.selectedKey ? <Check size={14}/> : <span>{candidate.duration > 0 ? timeLabel(candidate.duration) : '时长未知'}</span>}</span>
      <span className="result-artist">{candidate.artist || '歌手未知'}{candidate.album ? ` · ${candidate.album}` : ''}</span>
      <span className="result-meta">{SOURCES.find(s => s.id === candidate.provider)?.name} · {candidate.quality}{candidate.autoEligible ? ' · 信息吻合' : ''}</span>
    </button>)}</div>
    <p className="hint">逐字时间轴由歌词源提供；逐行歌词不会自动变成精准逐字歌词。</p>
  </section>;
}
