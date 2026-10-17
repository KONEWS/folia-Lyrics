import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDesktopState } from '../../../src/desktopLyrics/useDesktopState';
import { parseDesktopLyrics } from '../../../src/desktopLyrics/parseDesktopLyrics';
import type { LyricData } from '../../../src/types';
import { EMPTY, type LyricPacket } from '../../../src/desktopLyrics/bridge';

// test/unit/desktop/desktopLyricReplacement.test.ts — deferred real host events must never blank or overwrite the current lyric scene.
const hooks = vi.hoisted(() => ({ effects: [] as (() => (() => void) | void)[], cells: [] as { value: unknown }[] }));
vi.mock('../../../src/desktopLyrics/parseDesktopLyrics', () => ({ parseDesktopLyrics: vi.fn() }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useEffect: (effect: () => (() => void) | void) => hooks.effects.push(effect),
  useCallback: (callback: unknown) => callback,
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => {
    const cell = { value: typeof initial === 'function' ? initial() : initial }; hooks.cells.push(cell);
    return [cell.value, (next: unknown) => { cell.value = typeof next === 'function' ? next(cell.value) : next; }];
  },
}));
const parse = vi.mocked(parseDesktopLyrics), cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup()); hooks.cells.length = 0; hooks.effects.length = 0;
  vi.unstubAllGlobals(); parse.mockReset();
});
const data = (text: string): LyricData => ({ isWordByWord: false, lines: [{ fullText: text, words: [], startTime: 1, endTime: 10 }] });
const packet = (content: string, changes: Partial<LyricPacket> = {}): LyricPacket => ({ key: 'song', title: 'Title', artist: 'Artist',
  source: 'local', cover: '', embedded: false, format: 'lrc', content, ...changes });
const settle = async () => { await vi.dynamicImportSettled(); for (let step = 0; step < 4; step++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve };
}
function connect() {
  const listeners = new Set<(event: { data: unknown }) => void>();
  vi.stubGlobal('window', { chrome: { webview: { postMessage() {},
    addEventListener: (_name: string, handler: (event: { data: unknown }) => void) => listeners.add(handler),
    removeEventListener: (_name: string, handler: (event: { data: unknown }) => void) => listeners.delete(handler) } } });
  const state = useDesktopState(); cleanups.push(hooks.effects.at(-1)!() as () => void);
  const lyrics = hooks.cells.find(cell => cell.value === state.lyrics)!;
  const info = hooks.cells[hooks.cells.indexOf(lyrics) + 1], status = hooks.cells[hooks.cells.indexOf(lyrics) + 2];
  const emit = (type: string, value: unknown) => listeners.forEach(handler => handler({ data: { type, data: value } }));
  const session = (key = 'song') => emit('session', { ...EMPTY, key, title: key, sessionId: key, hasTimeline: true });
  session(); return { lyrics, info, status, emit, session };
}

describe('desktop lyric replacement', () => {
  it('keeps current lines and metadata while a replacement parses, deduplicates pending content, then commits both', async () => {
    const current = data('current'), next = data('next'); parse.mockResolvedValueOnce(current);
    const host = connect(); host.emit('lyrics', packet('initial')); await settle();
    expect(host.lyrics.value).toBe(current);
    const held = deferred<LyricData>(); parse.mockReturnValueOnce(held.promise);
    host.emit('lyrics', packet('replacement', { source: 'new' })); await settle();
    expect(host.lyrics.value).toBe(current); expect(host.info.value).toMatchObject({ source: 'local' });
    host.emit('lyrics', packet('replacement', { source: 'latest description' })); await settle();
    expect(parse).toHaveBeenCalledTimes(2);
    held.resolve(next); await settle();
    expect(host.lyrics.value).toBe(next); expect(host.info.value).toMatchObject({ source: 'latest description' }); expect(host.status.value).toBe('ready');
  });
  it('reuses exact parsed content after metadata updates, empty matching packets and a player-key change', async () => {
    const current = data('current'); parse.mockResolvedValue(current);
    const host = connect(); host.emit('lyrics', packet('same')); await settle();
    host.emit('lyrics', packet('same', { source: 'renamed', cover: 'new-cover', title: 'Renamed' })); await settle();
    expect(host.lyrics.value).toBe(current); expect(host.info.value).toMatchObject({ source: 'renamed' });
    host.emit('lyrics', packet('')); expect(host.lyrics.value).toBe(current);
    host.emit('lyrics', packet('same')); await settle();
    host.session('other-player'); expect((host.lyrics.value as LyricData).lines).toHaveLength(0);
    host.emit('lyrics', packet('same', { key: 'other-player' })); await settle();
    expect(host.lyrics.value).toBe(current); expect(parse).toHaveBeenCalledTimes(1);
  });
  it('keeps valid lyrics after an invalid same-song replacement and allows retry', async () => {
    const current = data('current'); parse.mockResolvedValueOnce(current).mockResolvedValueOnce({ lines: [] }).mockResolvedValueOnce(data('retry'));
    const host = connect(); host.emit('lyrics', packet('initial')); await settle();
    host.emit('lyrics', packet('bad')); await settle();
    expect(host.lyrics.value).toBe(current); expect(host.status.value).toBe('invalid'); expect(host.info.value).toMatchObject({ content: 'initial' });
    host.emit('lyrics', packet('bad')); await settle(); expect(host.status.value).toBe('ready');
  });
  it('rejects late parse results and old-key packets after switching songs', async () => {
    const held = deferred<LyricData>(); parse.mockReturnValueOnce(held.promise).mockResolvedValueOnce(data('new song'));
    const host = connect(); host.emit('lyrics', packet('old')); await settle();
    host.session('new'); host.emit('lyrics', packet('new', { key: 'new' })); await settle();
    const current = host.lyrics.value; held.resolve(data('obsolete')); await settle();
    host.emit('lyrics', packet('old')); await settle();
    expect(host.lyrics.value).toBe(current); expect((current as LyricData).lines[0].fullText).toBe('new song'); expect(parse).toHaveBeenCalledTimes(2);
  });
});
