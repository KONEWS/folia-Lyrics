import { normalizeDesktopSettingsTarget, type DesktopNoticeData, type DesktopSettingsTarget } from '../types/desktopSettings';
import { normalizeMusicApps, normalizeMusicAppCandidates, normalizeMusicAppDiscovery, type MusicAppBinding, type MusicAppCandidate, type MusicAppDiscovery } from '../types/desktopMusicApps';

// src/desktopLyrics/bridge.ts
export type Clock = { position: number; duration: number; playing: boolean; rate: number; hasTimeline: boolean; received: number; key?: string; sessionId?: string; sequence?: number };
export type MediaCapabilities = { play: boolean; pause: boolean; toggle: boolean; previous: boolean; next: boolean };
export type MediaAction = 'play' | 'pause' | 'previous' | 'next';
export type Session = Clock & { key: string; title: string; artist: string; album?: string; cover: string; source: string; sessionId?: string; controls?: MediaCapabilities | null; sources: { id: string; label: string }[] };
export type LyricPacket = { key: string; title: string; artist: string; content: string; source: string; cover: string; embedded: boolean; format?: string; translation?: string; romanization?: string; fallbackContent?: string; fallbackTranslation?: string };
export type { MusicAppBinding } from '../types/desktopMusicApps';
export type Preferences = { topmost: boolean; closeToTaskbar: boolean; audioReactive: boolean; transparentBackground: boolean; coverTheme: boolean; autoImmersive: boolean; immersiveDelay: number; bottomHoverControls: boolean; source: string; onlineEnabled: boolean; onlineProviders: string[]; musicApps: MusicAppBinding[]; blockedMusicApps: MusicAppCandidate[]; showMusicAppAddButton: boolean; autoDiscoverMusicApps: boolean };
export const DEFAULT_PREFERENCES: Preferences = { topmost: false, closeToTaskbar: false, audioReactive: true, transparentBackground: false, coverTheme: true, autoImmersive: true, immersiveDelay: 30, bottomHoverControls: true, source: '', onlineEnabled: true, onlineProviders: ['qq', 'kugou', 'netease', 'lrclib'], musicApps: [], blockedMusicApps: [], showMusicAppAddButton: true, autoDiscoverMusicApps: true };
export type OnlineCandidate = { key: string; provider: string; id: string; title: string; artist: string; album: string; duration: number; quality: string; available: boolean; score: number; autoEligible: boolean };
export type OnlineState = { key: string; busy: boolean; message: string; candidates: OnlineCandidate[]; errors: string[]; selectedKey: string; phase?: 'idle' | 'matching' | 'ready' | 'choice' | 'failed' };
export const EMPTY_ONLINE: OnlineState = { key: '', busy: false, message: '播放歌曲后自动匹配在线歌词', candidates: [], errors: [], selectedKey: '' };
export type LibrarySummary = { folders: string[]; count: number };
export type Message = { type: 'windowState'; data: { maximized: boolean; fullscreen: boolean; clickThrough?: boolean } } | { type: 'session'; data: Session } | { type: 'clock'; data: Clock } | { type: 'lyrics'; data: LyricPacket }
  | { type: 'preferences'; data: Preferences } | { type: 'library'; data: LibrarySummary }
  | { type: 'online'; data: OnlineState }
  | { type: 'musicAppDiscovery'; data: MusicAppDiscovery }
  | { type: 'openSettings'; data: { target: DesktopSettingsTarget } }
  | { type: 'transport'; data: { requestId: string; success: boolean; message: string } }
  | { type: 'systemVolume'; data: { percent: number; muted: boolean } }
  | { type: 'spectrum'; data: { bins: string; sampleRate: number } } | { type: 'notice'; data: DesktopNoticeData }
  | { type: 'audioStatus' | 'connectionError'; data: { text: string } }
  | { type: 'appearance'; data: { acrylic: boolean; solid: boolean; highContrast: boolean; transparent?: boolean } }
  | { type: 'scan'; data: { active: boolean; text: string } } | { type: 'restore'; data: object };
type Native = { postMessage(value: object): void; addEventListener(name: string, fn: (event: { data: unknown }) => void): void;
  removeEventListener(name: string, fn: (event: { data: unknown }) => void): void };
const host = () => (window as unknown as { chrome?: { webview?: Native } }).chrome?.webview;
export const isDesktop = () => Boolean(host());
export const send = (type: string, value?: unknown) => host()?.postMessage(value === undefined ? { type } : { type, value });
const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
// 宿主消息来自本机原生进程，但宿主的缺陷（字段缺失、非有限数）不该拖垮界面：
// 这里只修正后续代码不加检查就会直接使用的字段，修不了的消息直接丢弃，其余内容原样透传。
export function normalizeMessage(raw: unknown): Message | null {
  if (!isRecord(raw) || typeof raw.type !== 'string' || !raw.type || !isRecord(raw.data)) return null;
  const data = raw.data;
  switch (raw.type) {
    case 'musicAppDiscovery': {
      const discovery = normalizeMusicAppDiscovery(data);
      return discovery ? { type: 'musicAppDiscovery', data: discovery } : null;
    }
    case 'openSettings': {
      const target = normalizeDesktopSettingsTarget(data.target);
      return target ? { type: 'openSettings', data: { target } } : null;
    }
    case 'notice':
      return typeof data.text === 'string' ? { type: 'notice', data: { text: data.text, target: normalizeDesktopSettingsTarget(data.target) } } : null;
    case 'preferences': {
      // Legacy and partial packets must keep the current discovery setting instead of resetting it.
      const preferences = { ...data };
      if (typeof preferences.autoDiscoverMusicApps !== 'boolean') delete preferences.autoDiscoverMusicApps;
      if (Array.isArray(preferences.musicApps)) preferences.musicApps = normalizeMusicApps(preferences.musicApps);
      else delete preferences.musicApps;
      if (Array.isArray(preferences.blockedMusicApps)) preferences.blockedMusicApps = normalizeMusicAppCandidates(preferences.blockedMusicApps);
      else delete preferences.blockedMusicApps;
      return { type: 'preferences', data: preferences as Preferences };
    }
    case 'session':
      return { type: 'session', data: { ...data, position: finite(data.position, 0), duration: finite(data.duration, 0), rate: finite(data.rate, 1) > 0 ? finite(data.rate, 1) : 1,
        sources: Array.isArray(data.sources) ? data.sources.filter(isRecord).map(s => ({ id: String(s.id ?? ''), label: String(s.label ?? '') })) : [] } as Session };
    case 'clock':
      return { type: 'clock', data: { ...data, position: finite(data.position, 0), duration: finite(data.duration, 0), rate: finite(data.rate, 1) > 0 ? finite(data.rate, 1) : 1 } as Clock };
    case 'spectrum':
      // 采样率异常时回退到常见的 48kHz，避免频段换算出 NaN；没有频谱数据的包没有意义。
      return typeof data.bins === 'string' ? { type: 'spectrum', data: { bins: data.bins, sampleRate: finite(data.sampleRate, 0) > 0 ? finite(data.sampleRate, 0) : 48000 } } : null;
    default:
      return raw as Message;
  }
}
export function listen(fn: (message: Message) => void) {
  const bridge = host(); const handler = (event: { data: unknown }) => { const message = normalizeMessage(event.data); if (message) fn(message); };
  bridge?.addEventListener('message', handler); return () => bridge?.removeEventListener('message', handler);
}
export const EMPTY: Session = { key: '', title: '', artist: '', cover: '', source: '', sources: [], position: 0, duration: 0, rate: 1, playing: false, hasTimeline: false, received: 0 };
