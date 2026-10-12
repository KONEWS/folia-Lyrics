import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDesktopState } from '../../../src/desktopLyrics/useDesktopState';
import { getDesktopNoticeLines } from '../../../src/desktopLyrics/DesktopNotice';
import type { DesktopNoticeData, DesktopSettingsTarget } from '../../../src/types/desktopSettings';

// test/unit/desktop/desktopNotices.test.ts — real host handling with observable state and controlled notice deadlines.
const hooks = vi.hoisted(() => ({ effects: [] as (() => (() => void) | void)[], cells: [] as { value: unknown; writes: unknown[] }[] }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: (effect: () => (() => void) | void) => hooks.effects.push(effect),
  useCallback: (callback: unknown) => callback,
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => {
    const cell = { value: typeof initial === 'function' ? initial() : initial, writes: [] as unknown[] }; hooks.cells.push(cell);
    return [cell.value, (next: unknown) => { cell.value = typeof next === 'function' ? next(cell.value) : next; cell.writes.push(cell.value); }];
  },
}));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); hooks.effects.length = 0; hooks.cells.length = 0; });

function connect() {
  vi.useFakeTimers();
  const listeners = new Set<(event: { data: unknown }) => void>();
  vi.stubGlobal('window', { chrome: { webview: { postMessage: () => {},
    addEventListener: (_name: string, handler: (event: { data: unknown }) => void) => listeners.add(handler),
    removeEventListener: (_name: string, handler: (event: { data: unknown }) => void) => listeners.delete(handler) } } });
  const state = useDesktopState(), cleanup = hooks.effects.at(-1)!() as () => void;
  const emit = (type: string, text: string, target?: DesktopSettingsTarget) => listeners.forEach(handler => handler({ data: { type, data: { text, target } } }));
  const publish = (text: string, target?: DesktopSettingsTarget) => { emit('notice', text, target); return hooks.cells.find(cell => (cell.value as DesktopNoticeData | null)?.text === text)!; };
  return { state, cleanup, emit, publish, listeners };
}

describe('desktop notice deadlines', () => {
  it('keeps a host notice for five seconds and then dismisses it', () => {
    const { publish, cleanup } = connect(), notice = publish('已请求打开 foobar2000，请在播放器中播放歌曲。');
    vi.advanceTimersByTime(4999); expect((notice.value as DesktopNoticeData).text).toContain('foobar2000');
    vi.advanceTimersByTime(1); expect(notice.value).toBeNull(); expect(vi.getTimerCount()).toBe(0); cleanup();
  });

  it('gives a replacement notice its own five seconds without the previous deadline clearing it', () => {
    const { publish, cleanup } = connect(), notice = publish('first');
    vi.advanceTimersByTime(4000); publish('second');
    vi.advanceTimersByTime(1000); expect(notice.value).toMatchObject({ text: 'second' });
    vi.advanceTimersByTime(3999); expect(notice.value).toMatchObject({ text: 'second' });
    vi.advanceTimersByTime(1); expect(notice.value).toBeNull(); cleanup();
  });

  it('renews the deadline even when the same notice text is received twice', () => {
    const { publish, cleanup } = connect(), notice = publish('repeat');
    vi.advanceTimersByTime(4000); publish('repeat');
    vi.advanceTimersByTime(1000); expect(notice.value).toMatchObject({ text: 'repeat' });
    vi.advanceTimersByTime(4000); expect(notice.value).toBeNull(); cleanup();
  });

  it('also expires notices published by frontend actions', () => {
    const { state, cleanup } = connect(); state.setNotice('settings could not open');
    const notice = hooks.cells.find(cell => (cell.value as DesktopNoticeData | null)?.text === 'settings could not open')!;
    vi.advanceTimersByTime(5000); expect(notice.value).toBeNull(); cleanup();
  });

  it('immediately clears a dismissed notice and cancels its pending timer', () => {
    const { publish, state, cleanup } = connect(), notice = publish('open settings');
    vi.advanceTimersByTime(2000); state.setNotice(''); expect(notice.value).toBeNull(); expect(vi.getTimerCount()).toBe(0);
    const writes = notice.writes.length; vi.advanceTimersByTime(10000); expect(notice.writes).toHaveLength(writes); cleanup();
  });

  it('cancels pending notice work and host listeners on unmount', () => {
    const { publish, cleanup, listeners } = connect(), notice = publish('pending'); cleanup();
    expect(listeners.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
    const writes = notice.writes.length; vi.advanceTimersByTime(10000); expect(notice.writes).toHaveLength(writes);
  });

  it('leaves persistent connection errors intact when a transient notice expires', () => {
    const { publish, emit, cleanup } = connect(); emit('connectionError', 'connection remains unavailable');
    const connection = hooks.cells.find(cell => cell.value === 'connection remains unavailable')!, notice = publish('launch requested');
    vi.advanceTimersByTime(5000); expect(notice.value).toBeNull(); expect(connection.value).toBe('connection remains unavailable'); cleanup();
  });

  it('keeps the precise target with the message and replaces it even when the text repeats', () => {
    const { publish, cleanup } = connect();
    const notice = publish('绑定失败', { id: 'music-app-binding', slot: 2 });
    expect(notice.value).toEqual({ text: '绑定失败', target: { id: 'music-app-binding', slot: 2 } });
    publish('绑定失败', { id: 'music-app-binding', slot: 8 });
    expect(notice.value).toEqual({ text: '绑定失败', target: { id: 'music-app-binding', slot: 8 } });
    vi.advanceTimersByTime(5000); expect(notice.value).toBeNull(); cleanup();
  });
});

describe('desktop launch notice lines', () => {
  it('uses a semantic break before the playback instruction', () => {
    expect(getDesktopNoticeLines('已请求打开 foobar2000 应用程序，请在播放器中播放歌曲。'))
      .toEqual(['已请求打开 foobar2000 应用程序', '请在播放器中播放歌曲。']);
    expect(getDesktopNoticeLines('已请求打开 名称，包含，标点，请在播放器中播放歌曲。'))
      .toEqual(['已请求打开 名称，包含，标点', '请在播放器中播放歌曲。']);
  });

  it('preserves other notices and errors without arbitrary string splitting', () => {
    for (const text of ['无法打开 foobar2000：路径不存在。', '已绑定 QQ 音乐，可从首页打开。', '播放器未公开进度，请切换播放器。'])
      expect(getDesktopNoticeLines(text)).toEqual([text]);
  });
});
