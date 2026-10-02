// src/desktopLyrics/bridge.ts
export type Clock = { position: number; duration: number; playing: boolean; rate: number; hasTimeline: boolean; received: number };
export type MediaCapabilities = { play: boolean; pause: boolean; toggle: boolean; previous: boolean; next: boolean };
export type MediaAction = 'play' | 'pause' | 'previous' | 'next';
export type Session = Clock & { key: string; title: string; artist: string; album?: string; cover: string; source: string; sessionId?: string; controls?: MediaCapabilities | null; sources: { id: string; label: string }[] };
export type LyricPacket = { key: string; title: string; artist: string; content: string; source: string; cover: string; embedded: boolean; format?: string; translation?: string; romanization?: string; fallbackContent?: string; fallbackTranslation?: string };
export type Preferences = { topmost: boolean; closeToTaskbar: boolean; audioReactive: boolean; transparentBackground: boolean; coverTheme: boolean; autoImmersive: boolean; immersiveDelay: number; bottomHoverControls: boolean; source: string; onlineEnabled: boolean; onlineProviders: string[] };
export const DEFAULT_PREFERENCES: Preferences = { topmost: false, closeToTaskbar: false, audioReactive: true, transparentBackground: false, coverTheme: true, autoImmersive: true, immersiveDelay: 30, bottomHoverControls: true, source: '', onlineEnabled: true, onlineProviders: ['kugou', 'qq', 'netease', 'lrclib'] };
export type OnlineCandidate = { key: string; provider: string; id: string; title: string; artist: string; album: string; duration: number; quality: string; available: boolean; score: number; autoEligible: boolean };
export type OnlineState = { key: string; busy: boolean; message: string; candidates: OnlineCandidate[]; errors: string[]; selectedKey: string };
export const EMPTY_ONLINE: OnlineState = { key: '', busy: false, message: '播放歌曲后自动匹配在线歌词', candidates: [], errors: [], selectedKey: '' };
export type LibrarySummary = { folders: string[]; count: number };
export type Message = { type: 'windowState'; data: { maximized: boolean; fullscreen: boolean; clickThrough?: boolean } } | { type: 'session'; data: Session } | { type: 'clock'; data: Clock } | { type: 'lyrics'; data: LyricPacket }
  | { type: 'preferences'; data: Preferences } | { type: 'library'; data: LibrarySummary }
  | { type: 'online'; data: OnlineState }
  | { type: 'transport'; data: { requestId: string; success: boolean; message: string } }
  | { type: 'systemVolume'; data: { percent: number; muted: boolean } }
  | { type: 'spectrum'; data: { bins: string; sampleRate: number } } | { type: 'notice' | 'audioStatus' | 'connectionError'; data: { text: string } }
  | { type: 'appearance'; data: { acrylic: boolean; solid: boolean; highContrast: boolean; transparent?: boolean } }
  | { type: 'scan'; data: { active: boolean; text: string } } | { type: 'restore'; data: object };
type Native = { postMessage(value: object): void; addEventListener(name: string, fn: (event: { data: Message }) => void): void;
  removeEventListener(name: string, fn: (event: { data: Message }) => void): void };
const host = () => (window as unknown as { chrome?: { webview?: Native } }).chrome?.webview;
export const isDesktop = () => Boolean(host());
export const send = (type: string, value?: unknown) => host()?.postMessage(value === undefined ? { type } : { type, value });
export function listen(fn: (message: Message) => void) {
  const bridge = host(); const handler = (event: { data: Message }) => { if (event.data?.type) fn(event.data); };
  bridge?.addEventListener('message', handler); return () => bridge?.removeEventListener('message', handler);
}
export const EMPTY: Session = { key: '', title: '', artist: '', cover: '', source: '', sources: [], position: 0, duration: 0, rate: 1, playing: false, hasTimeline: false, received: 0 };
