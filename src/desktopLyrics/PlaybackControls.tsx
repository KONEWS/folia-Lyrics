import { useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward, LoaderCircle } from 'lucide-react';
import { isDesktop, listen, send, type MediaAction, type Session } from './bridge';

// src/desktopLyrics/PlaybackControls.tsx
export default function PlaybackControls({ session, disconnected }: { session: Session; disconnected: boolean }) {
  const request = useRef(''), deadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [pending, setPending] = useState(false), [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  useEffect(() => {
    request.current = ''; setPending(false); setFeedback(null);
    const unsubscribe = listen(message => {
      if (message.type !== 'transport' || !request.current || message.data.requestId !== request.current) return;
      request.current = ''; clearTimeout(deadline.current); setPending(false);
      setFeedback({ text: message.data.message, error: !message.data.success });
    });
    return () => { unsubscribe(); clearTimeout(deadline.current); request.current = ''; };
  }, [session.sessionId, session.key]);
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 6000);
    return () => clearTimeout(timer);
  }, [feedback]);
  const connected = isDesktop() && Boolean(session.sessionId) && !disconnected;
  const caps = session.controls;
  const canPlayPause = Boolean(caps && (caps.toggle || (session.playing ? caps.pause : caps.play)));
  const unavailable = !connected || pending;
  const playLabel = session.playing ? '暂停音乐' : '继续播放音乐';
  const control = (action: MediaAction) => {
    if (unavailable || request.current) return;
    const requestId = crypto.randomUUID();
    request.current = requestId; setPending(true); setFeedback(null);
    deadline.current = setTimeout(() => {
      if (request.current !== requestId) return;
      request.current = ''; setPending(false); setFeedback({ text: '未收到播放器回复，请确认实际播放状态。', error: true });
    }, 6500);
    send('mediaControl', { requestId, sessionId: session.sessionId, songKey: session.key, action });
  };
  const title = (enabled: boolean, label: string) => !connected ? '请先连接音乐播放器'
    : pending ? '正在等待播放器响应' : enabled ? `${label} · ${session.source}` : '当前播放器未开放这项控制';
  return <div className="playback-controls" role="group" aria-label="外部播放器控制" aria-busy={pending}>
    <div className="transport-buttons">
      <button aria-label="上一首" title={title(Boolean(caps?.previous), '上一首')} disabled={unavailable || !caps?.previous} onClick={() => control('previous')}><SkipBack size={17}/></button>
      <button className="transport-primary" aria-label={playLabel} title={title(canPlayPause, playLabel)} disabled={unavailable || !canPlayPause} onClick={() => control(session.playing ? 'pause' : 'play')}>
        {pending ? <LoaderCircle size={20} className="transport-spinner"/> : session.playing ? <Pause size={20}/> : <Play size={20}/>}</button>
      <button aria-label="下一首" title={title(Boolean(caps?.next), '下一首')} disabled={unavailable || !caps?.next} onClick={() => control('next')}><SkipForward size={17}/></button>
    </div>
    <span className={`transport-caption ${feedback?.error ? 'error' : ''}`} role="status" title={feedback?.text || session.source}>
      {feedback?.text || (pending ? '正在等待播放器响应…' : !connected ? '等待连接播放器' : !canPlayPause && !caps?.previous && !caps?.next ? '播放器未开放媒体控制' : '控制外部播放器')}
    </span>
  </div>;
}
