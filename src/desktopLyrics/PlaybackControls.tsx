import { Pause, Play, SkipBack, SkipForward, LoaderCircle } from 'lucide-react';
import type { Session } from './bridge';
import type { MediaControls } from './useMediaControls';

// src/desktopLyrics/PlaybackControls.tsx
export default function PlaybackControls({ session, controls }: { session: Session; controls: MediaControls }) {
  const { connected, pending, feedback, caps, canPlayPause, control } = controls;
  const unavailable = !connected || pending;
  const playLabel = session.playing ? '暂停音乐' : '继续播放音乐';
  const title = (enabled: boolean, label: string) => !connected ? '请先连接音乐播放器'
    : pending ? '正在等待播放器响应' : enabled ? `${label} · ${session.source}` : '当前播放器未开放这项控制';
  return <div className="playback-controls" role="group" aria-label="外部播放器控制" aria-busy={pending}>
    <div className="transport-buttons">
      <button aria-label="上一首" title={title(Boolean(caps?.previous), '上一首')} disabled={unavailable || !caps?.previous} onClick={() => control('previous')}><SkipBack size={17}/></button>
      <button className="transport-primary" aria-label={playLabel} title={title(canPlayPause, playLabel)} disabled={unavailable || !canPlayPause} onClick={() => control(session.playing ? 'pause' : 'play')}>
        {pending ? <LoaderCircle size={20} className="transport-spinner"/> : session.playing ? <Pause size={20}/> : <Play size={20}/>}</button>
      <button aria-label="下一首" title={title(Boolean(caps?.next), '下一首')} disabled={unavailable || !caps?.next} onClick={() => control('next')}><SkipForward size={17}/></button>
    </div>
    {feedback?.error ? <span className="transport-caption error" role="alert" title={feedback.text}>{feedback.text}</span> : null}
  </div>;
}
