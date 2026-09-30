import { useEffect, useRef, useState } from 'react';
import { parseDesktopLyrics } from './parseDesktopLyrics';
import type { LyricData } from '../types';
import { EMPTY, EMPTY_ONLINE, DEFAULT_PREFERENCES, listen, send, type Clock, type LyricPacket, type LibrarySummary } from './bridge';

// src/desktopLyrics/useDesktopState.ts
export function useDesktopState() {
  const [session, setSession] = useState(EMPTY), sessionRef = useRef(EMPTY);
  const clock = useRef<Clock>(EMPTY), spectrum = useRef({ bins: new Uint8Array(1024), sampleRate: 48000, received: 0 });
  const [lyrics, setLyrics] = useState<LyricData>({ lines: [] }), [lyricInfo, setLyricInfo] = useState<LyricPacket | null>(null);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES), [online, setOnline] = useState(EMPTY_ONLINE);
  const [library, setLibrary] = useState<LibrarySummary>({ folders: [], count: 0 });
  const [appearance, setAppearance] = useState({ acrylic: false, solid: false, highContrast: false });
  const [notice, setNotice] = useState(''), [audioStatus, setAudioStatus] = useState('正在连接声音输出');
  const [scan, setScan] = useState({ active: false, text: '' }), [restore, setRestore] = useState(0), [connectionError, setConnectionError] = useState('');
  useEffect(() => {
    let revision = 0, disposed = false;
    const unsubscribe = listen(message => {
      switch (message.type) {
        case 'session':
          if (sessionRef.current.key !== message.data.key) { revision++; setLyrics({ lines: [] }); setLyricInfo(null); setOnline({ ...EMPTY_ONLINE, key: message.data.key }); }
          sessionRef.current = message.data; setSession(message.data); clock.current = { ...message.data, received: performance.now() }; setConnectionError(''); break;
        case 'clock': clock.current = { ...message.data, received: performance.now() }; setConnectionError(previous => previous ? '' : previous); break;
        case 'lyrics': {
          const packet = message.data;
          if (packet.key !== sessionRef.current.key) break;
          const token = ++revision; setLyricInfo(packet); setLyrics({ lines: [] });
          if (!packet.content) break;
          void parseDesktopLyrics(packet).then(parsed => {
            if (disposed || token !== revision || packet.key !== sessionRef.current.key) return;
            if (!parsed?.lines.length) { setNotice('文件中未找到时间轴歌词，请导入 LRC、TTML、YRC、QRC 或 FIA。'); return; }
            setLyrics(parsed); setNotice('');
          }).catch(error => { if (!disposed && revision === token) setNotice(`歌词解析失败：${String(error)}`); }); break;
        }
        case 'spectrum': {
          const raw = atob(message.data.bins); for (let i = 0; i < 1024; i++) spectrum.current.bins[i] = raw.charCodeAt(i) || 0;
          spectrum.current.sampleRate = message.data.sampleRate; spectrum.current.received = performance.now(); break;
        }
        case 'preferences': setPreferences(previous => ({ ...previous, ...message.data })); break;
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
  return { session, clock, spectrum, lyrics, lyricInfo, preferences, library, online, appearance, notice, setNotice, audioStatus, scan, restore, connectionError };
}
