import { useCallback, useEffect, useRef, useState } from 'react';
import { isDesktop, listen, send, type MediaAction, type Session } from './bridge';

// src/desktopLyrics/useMediaControls.ts
export function useMediaControls(session: Session, disconnected: boolean) {
  const request = useRef(''), deadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [pending, setPending] = useState(false), [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  useEffect(() => {
    request.current = ''; clearTimeout(deadline.current); setPending(false); setFeedback(null);
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
  // 按钮和快捷输入共享请求锁，并在发送前按当前会话重新检查控制能力。
  const control = useCallback((action: MediaAction) => {
    const enabled = caps && (action === 'previous' || action === 'next' ? caps[action] : caps[action] || caps.toggle);
    if (!connected || !enabled || request.current) return;
    const requestId = crypto.randomUUID();
    request.current = requestId; setPending(true); setFeedback(null);
    deadline.current = setTimeout(() => {
      if (request.current !== requestId) return;
      request.current = ''; setPending(false); setFeedback({ text: '未收到播放器回复，请确认实际播放状态。', error: true });
    }, 6500);
    send('mediaControl', { requestId, sessionId: session.sessionId, songKey: session.key, action });
  }, [connected, caps, session.sessionId, session.key]);
  return { connected, pending, feedback, caps, canPlayPause, control };
}
export type MediaControls = ReturnType<typeof useMediaControls>;
