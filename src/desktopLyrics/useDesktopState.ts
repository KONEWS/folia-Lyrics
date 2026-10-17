import { useCallback, useEffect, useRef, useState } from 'react';
import { mergeDesktopPreferences, reuseMediaSources, sameLyricContent, sameLyricPacket, sameSessionPresentation } from './desktopStateEquality';
import type { LyricData } from '../types';
import { EMPTY, EMPTY_ONLINE, DEFAULT_PREFERENCES, listen, send, type Clock, type LyricPacket, type LibrarySummary } from './bridge';
import { clockNeedsFrames, createFrameDemand } from './frameDemand';
import type { DesktopNoticeData, DesktopSettingsRequest } from '../types/desktopSettings';
import { acceptClockPacket } from './clockPacket';

// src/desktopLyrics/useDesktopState.ts
const NOTICE_DURATION_MS = 5000;
const CONNECTION_ERROR_NOTICE_DURATION_MS = 2500;
const EMPTY_LYRICS: LyricData = { lines: [] };

export function useDesktopState() {
  const [session, setSession] = useState(EMPTY), sessionRef = useRef(EMPTY);
  const [frameDemand] = useState(createFrameDemand);
  const clock = useRef<Clock>(EMPTY), spectrum = useRef({ bins: new Uint8Array(1024), sampleRate: 48000, received: 0 });
  const [lyrics, setLyrics] = useState<LyricData>(EMPTY_LYRICS), [lyricInfo, setLyricInfo] = useState<LyricPacket | null>(null);
  const [lyricStatus, setLyricStatus] = useState<'idle' | 'parsing' | 'ready' | 'invalid'>('idle');
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES), [online, setOnline] = useState(EMPTY_ONLINE);
  const [library, setLibrary] = useState<LibrarySummary>({ folders: [], count: 0 });
  const [appearance, setAppearance] = useState<{ acrylic: boolean; solid: boolean; highContrast: boolean; transparent?: boolean }>({ acrylic: false, solid: false, highContrast: false });
  const [clickThrough, setClickThrough] = useState(false), [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState<DesktopNoticeData | null>(null), [audioStatus, setAudioStatus] = useState('正在连接声音输出');
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), noticeRevision = useRef(0);
  const connectionFailed = useRef(false);
  const [lyricNotice, setLyricNotice] = useState<DesktopNoticeData | null>(null);
  const [scan, setScan] = useState({ active: false, text: '' }), [restore, setRestore] = useState(0), [connectionError, setConnectionError] = useState('');
  const [settingsRequest, setSettingsRequest] = useState<DesktopSettingsRequest>();
  // 每条临时提示从最新一次消息重新计时，旧回调不能清除后来的提示。
  const acceptNotice = useCallback((value: DesktopNoticeData | string, duration = NOTICE_DURATION_MS) => {
    clearTimeout(noticeTimer.current); noticeTimer.current = undefined;
    const next = typeof value === 'string' ? { text: value } : value;
    const token = ++noticeRevision.current; setNotice(next.text ? next : null);
    if (next.text) noticeTimer.current = setTimeout(() => { if (noticeRevision.current === token) { noticeTimer.current = undefined; setNotice(null); } }, duration);
  }, []);
  useEffect(() => {
    let revision = 0, disposed = false, acceptedPacket: LyricPacket | null = null;
    // Retain only the latest successful parse; metadata updates and identical payloads from another player reuse it.
    let parsedPacket: LyricPacket | null = null, parsedLyrics: LyricData | null = null;
    const commitLyrics = (packet: LyricPacket, parsed: LyricData) => {
      parsedPacket = packet; parsedLyrics = parsed;
      setLyricInfo(packet); setLyrics(parsed); setLyricStatus('ready'); setLyricNotice(null);
    };
    // A clock packet always replaces the stored one (its receive time anchors extrapolation), but only wakes a parked frame loop when it changes something.
    const acceptClock = (data: Clock, identity = sessionRef.current) => {
      const previous = clock.current, accepted = acceptClockPacket(previous, data, identity, performance.now());
      if (!accepted) return false;
      clock.current = accepted;
      if (clockNeedsFrames(previous, clock.current)) frameDemand.request();
      return true;
    };
    const unsubscribe = listen(message => {
      switch (message.type) {
        case 'windowState': setClickThrough(Boolean(message.data.clickThrough)); setFullscreen(message.data.fullscreen); break;
        case 'session': {
          if (!acceptClock(message.data, message.data)) break;
          if (sessionRef.current.key !== message.data.key) { revision++; acceptedPacket = null; setLyrics(EMPTY_LYRICS); setLyricInfo(null); setLyricStatus('idle'); setLyricNotice(null); setOnline({ ...EMPTY_ONLINE, key: message.data.key }); }
          const nextSession = { ...message.data, sources: reuseMediaSources(sessionRef.current.sources, message.data.sources) };
          sessionRef.current = nextSession;
          setSession(previous => sameSessionPresentation(previous, nextSession) ? previous : nextSession);
          connectionFailed.current = false; setConnectionError(previous => previous ? '' : previous); break;
        }
        case 'clock': if (acceptClock(message.data)) { connectionFailed.current = false; setConnectionError(previous => previous ? '' : previous); } break;
        case 'lyrics': {
          const packet = message.data;
          if (packet.key !== sessionRef.current.key || sameLyricPacket(acceptedPacket, packet)) break;
          const samePendingContent = sameLyricContent(acceptedPacket, packet);
          acceptedPacket = packet;
          if (parsedLyrics && sameLyricContent(parsedPacket, packet)) { revision++; commitLyrics(packet, parsedLyrics); break; }
          if (samePendingContent) break;
          const token = ++revision; setLyricStatus(packet.content ? 'parsing' : 'idle'); setLyricNotice(null);
          // An empty lookup packet may precede a same-song replacement; keep the last valid scene until it is ready.
          if (!packet.content) { if (parsedPacket?.key !== packet.key) setLyricInfo(packet); break; }
          void import('./parseDesktopLyrics').then(({ parseDesktopLyrics }) => {
            if (disposed || token !== revision || packet.key !== sessionRef.current.key) return null;
            return parseDesktopLyrics(packet);
          }).then(parsed => {
            if (disposed || token !== revision || packet.key !== sessionRef.current.key) return;
            if (!parsed?.lines.length) { acceptedPacket = null; setLyricStatus('invalid'); setLyricNotice({ text: '文件中未找到时间轴歌词，请导入 LRC、TTML、YRC、QRC 或 FIA。', target: { id: 'local-import' } }); return; }
            commitLyrics(acceptedPacket ?? packet, parsed);
          }).catch(error => { if (!disposed && revision === token) { acceptedPacket = null; setLyricStatus('invalid'); setLyricNotice({ text: `歌词解析失败：${String(error)}`, target: { id: 'local-import' } }); } }); break;
        }
        case 'spectrum': {
          let raw: string; try { raw = atob(message.data.bins); } catch { break; } // 非法 base64 只丢弃这一帧。
          for (let i = 0; i < 1024; i++) spectrum.current.bins[i] = raw.charCodeAt(i) || 0;
          spectrum.current.sampleRate = message.data.sampleRate; spectrum.current.received = performance.now(); frameDemand.request('spectrum'); break;
        }
        case 'preferences': setPreferences(previous => mergeDesktopPreferences(previous, message.data)); break;
        case 'online': if (message.data.key === sessionRef.current.key) setOnline(message.data); break;
        case 'library': setLibrary(message.data); break;
        case 'appearance': setAppearance(message.data); break;
        case 'notice': acceptNotice(message.data); break;
        case 'audioStatus': setAudioStatus(previous => previous === message.data.text ? previous : message.data.text); break;
        case 'connectionError':
          setConnectionError(message.data.text);
          if (message.data.text && !connectionFailed.current)
            acceptNotice({ text: message.data.text, target: { id: 'player-source' } }, CONNECTION_ERROR_NOTICE_DURATION_MS);
          connectionFailed.current = Boolean(message.data.text);
          break;
        case 'scan': setScan(message.data); break;
        case 'restore': setRestore(n => n + 1); break;
        case 'openSettings': setRestore(n => n + 1); setSettingsRequest(previous => ({ sequence: (previous?.sequence ?? 0) + 1, target: message.data.target })); break;
      }
    }); send('ready'); return () => { disposed = true; revision++; noticeRevision.current++; clearTimeout(noticeTimer.current); unsubscribe(); };
  }, [acceptNotice]);
  // 引用保持稳定：此前每次渲染都生成新函数，凡是把它放进依赖数组的 effect 都会跟着反复重跑。
  const showNotice = useCallback((value: DesktopNoticeData | string) => { setLyricNotice(null); acceptNotice(value); }, [acceptNotice]);
  return { session, clock, spectrum, frameDemand, lyrics, lyricInfo, lyricStatus, preferences, library, online, appearance, clickThrough, fullscreen,
    notice: lyricNotice || notice, setNotice: showNotice, audioStatus, scan, restore, settingsRequest, connectionError };
}
