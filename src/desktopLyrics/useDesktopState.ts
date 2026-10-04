import { useEffect, useRef, useState } from 'react';
import { mergeDesktopPreferences, sameLyricPacket, sameSessionPresentation } from './desktopStateEquality';
import type { LyricData } from '../types';
import { EMPTY, EMPTY_ONLINE, DEFAULT_PREFERENCES, listen, send, type Clock, type LyricPacket, type LibrarySummary } from './bridge';

// src/desktopLyrics/useDesktopState.ts
export function useDesktopState() {
  const [session, setSession] = useState(EMPTY), sessionRef = useRef(EMPTY);
  const clock = useRef<Clock>(EMPTY), spectrum = useRef({ bins: new Uint8Array(1024), sampleRate: 48000, received: 0 });
  const [lyrics, setLyrics] = useState<LyricData>({ lines: [] }), [lyricInfo, setLyricInfo] = useState<LyricPacket | null>(null);
  const [lyricStatus, setLyricStatus] = useState<'idle' | 'parsing' | 'ready' | 'invalid'>('idle');
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES), [online, setOnline] = useState(EMPTY_ONLINE);
  const [library, setLibrary] = useState<LibrarySummary>({ folders: [], count: 0 });
  const [appearance, setAppearance] = useState<{ acrylic: boolean; solid: boolean; highContrast: boolean; transparent?: boolean }>({ acrylic: false, solid: false, highContrast: false });
  const [clickThrough, setClickThrough] = useState(false), [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState(''), [audioStatus, setAudioStatus] = useState('正在连接声音输出');
  const [lyricNotice, setLyricNotice] = useState('');
  const [scan, setScan] = useState({ active: false, text: '' }), [restore, setRestore] = useState(0), [connectionError, setConnectionError] = useState('');
  useEffect(() => {
    let revision = 0, disposed = false, acceptedPacket: LyricPacket | null = null;
    const unsubscribe = listen(message => {
      switch (message.type) {
        case 'windowState': setClickThrough(Boolean(message.data.clickThrough)); setFullscreen(message.data.fullscreen); break;
        case 'session':
          if (sessionRef.current.key !== message.data.key) { revision++; acceptedPacket = null; setLyrics({ lines: [] }); setLyricInfo(null); setLyricStatus('idle'); setLyricNotice(''); setOnline({ ...EMPTY_ONLINE, key: message.data.key }); }
          sessionRef.current = message.data; setSession(previous => sameSessionPresentation(previous, message.data) ? previous : message.data);
          clock.current = { ...message.data, received: performance.now() }; setConnectionError(previous => previous ? '' : previous); break;
        case 'clock': clock.current = { ...message.data, received: performance.now() }; setConnectionError(previous => previous ? '' : previous); break;
        case 'lyrics': {
          const packet = message.data;
          if (packet.key !== sessionRef.current.key || sameLyricPacket(acceptedPacket, packet)) break;
          acceptedPacket = packet;
          const token = ++revision; setLyricInfo(packet); setLyrics({ lines: [] }); setLyricStatus(packet.content ? 'parsing' : 'idle'); setLyricNotice('');
          if (!packet.content) break;
          void import('./parseDesktopLyrics').then(({ parseDesktopLyrics }) => {
            if (disposed || token !== revision || packet.key !== sessionRef.current.key) return null;
            return parseDesktopLyrics(packet);
          }).then(parsed => {
            if (disposed || token !== revision || packet.key !== sessionRef.current.key) return;
            if (!parsed?.lines.length) { acceptedPacket = null; setLyricStatus('invalid'); setLyricNotice('文件中未找到时间轴歌词，请导入 LRC、TTML、YRC、QRC 或 FIA。'); return; }
            setLyrics(parsed); setLyricStatus('ready'); setLyricNotice('');
          }).catch(error => { if (!disposed && revision === token) { acceptedPacket = null; setLyricStatus('invalid'); setLyricNotice(`歌词解析失败：${String(error)}`); } }); break;
        }
        case 'spectrum': {
          const raw = atob(message.data.bins); for (let i = 0; i < 1024; i++) spectrum.current.bins[i] = raw.charCodeAt(i) || 0;
          spectrum.current.sampleRate = message.data.sampleRate; spectrum.current.received = performance.now(); break;
        }
        case 'preferences': setPreferences(previous => mergeDesktopPreferences(previous, message.data)); break;
        case 'online': if (message.data.key === sessionRef.current.key) setOnline(message.data); break;
        case 'library': setLibrary(message.data); break;
        case 'appearance': setAppearance(message.data); break;
        case 'notice': setNotice(message.data.text); break;
        case 'audioStatus': setAudioStatus(previous => previous === message.data.text ? previous : message.data.text); break;
        case 'connectionError': setConnectionError(message.data.text); break;
        case 'scan': setScan(message.data); break;
        case 'restore': setRestore(n => n + 1); break;
      }
    }); send('ready'); return () => { disposed = true; revision++; unsubscribe(); };
  }, []);
  return { session, clock, spectrum, lyrics, lyricInfo, lyricStatus, preferences, library, online, appearance, clickThrough, fullscreen,
    notice: lyricNotice || notice, setNotice: (text: string) => { setLyricNotice(''); setNotice(text); }, audioStatus, scan, restore, connectionError };
}
