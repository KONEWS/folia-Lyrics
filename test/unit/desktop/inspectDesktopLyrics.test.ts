import { afterEach, describe, expect, it, vi } from 'vitest';
import { inspectDesktopLyrics } from '../../../src/desktopLyrics/inspectDesktopLyrics';
import * as inspection from '../../../src/desktopLyrics/inspectDesktopLyrics';
import { listen, normalizeMessage, type LyricPacket } from '../../../src/desktopLyrics/bridge';

// test/unit/desktop/inspectDesktopLyrics.test.ts: Real offline provider content proves word timing through the existing parser and inspection bridge.
const base: LyricPacket = { key: 'song', title: 'Song', artist: 'Artist', source: 'test', cover: '', embedded: false, content: '' };
// Generated offline with the existing QQ cipher, then decrypted back to the stated timing content before recording these fixtures.
const wordQrc = 'd6a2be95d644737237d332720cff3b1cc97cf903179abc2c17e32a3ddd86eddf25a1be679edd3569';
const lineQrc = '32dabb4c5e9846fab6c9dcb03f55b7ad53faccbf9bfcebd2d2fa70a8869011da';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('downloaded lyric content inspection', () => {
  it.each([
    ['yrc', '[1000,2000](1000,1000,0)你(2000,1000,0)好'],
    ['qrc', '[1000,2000]你(1000,1000)好(2000,1000)'],
    ['krc', '[1000,2000]<0,1000,0>你<1000,1000,0>好'],
    ['krc', '\uFEFF[1000,2000]<0,1000,0>你<1000,1000,0>好'],
    ['lrc', '[00:01.000]<00:01.000>你<00:02.000>好<00:03.000>'],
  ] as const)('recognizes actual %s word timing', async (format, content) => {
    expect(await inspectDesktopLyrics({ ...base, format, content })).toEqual({ usable: true, wordTimed: true });
  });

  it.each([
    ['lrc', '[00:01.00]只有逐行'],
    ['krc', '[1000,2000]只有逐行'],
    ['krc', '[1000,2000]<0,0,0>没有有效逐字时间'],
  ] as const)('keeps %s line timing usable without mistaking synthesized or zero-duration words for precise timing', async (format, content) => {
    expect(await inspectDesktopLyrics({ ...base, format, content })).toEqual({ usable: true, wordTimed: false });
  });

  it('decrypts actual QQ word content before granting word priority', async () => {
    expect(await inspectDesktopLyrics({ ...base, format: 'qq-qrc', content: wordQrc, fallbackContent: '[00:01.00]备用逐行' }))
      .toEqual({ usable: true, wordTimed: true });
  });

  it('treats QQ ciphertext containing only LRC as line timing', async () => {
    expect(await inspectDesktopLyrics({ ...base, format: 'qq-qrc', content: lineQrc }))
      .toEqual({ usable: true, wordTimed: false });
  });

  it('retains usable QQ fallback after invalid ciphertext without granting word priority', async () => {
    expect(await inspectDesktopLyrics({ ...base, format: 'qq-qrc', content: 'deadbeef01234567deadbeef01234567', fallbackContent: '[00:01.00]备用逐行' }))
      .toEqual({ usable: true, wordTimed: false });
  });

  it.each([
    ['lrc', ''], ['lrc', '[ti:Only metadata]'], ['lrc', '[00:01.00]'], ['yrc', '[1000,2000]没有词时间'],
    ['qrc', '[1000,2000]没有词时间'], ['qq-qrc', 'deadbeef01234567deadbeef01234567'],
  ] as const)('rejects unusable %s content', async (format, content) => {
    expect(await inspectDesktopLyrics({ ...base, format, content })).toEqual({ usable: false, wordTimed: false });
  });
});

describe('content inspection request protocol', () => {
  function mockHost() {
    const handlers = new Set<(event: { data: unknown }) => void>();
    const postMessage = vi.fn();
    vi.stubGlobal('window', { chrome: { webview: { postMessage,
      addEventListener: (_name: string, handler: (event: { data: unknown }) => void) => handlers.add(handler),
      removeEventListener: (_name: string, handler: (event: { data: unknown }) => void) => handlers.delete(handler) } } });
    return { postMessage, handlerCount: () => handlers.size, emit: (data: unknown) => handlers.forEach(handler => handler({ data })) };
  }

  it('normalizes valid requests and rejects malformed inspection envelopes', () => {
    const valid = { type: 'inspectLyrics', data: { requestId: 'probe', packet: { ...base, content: '[00:01.00]歌词' } } };
    expect(normalizeMessage(valid)).toEqual(valid);
    for (const data of [{}, { requestId: '', packet: base }, { requestId: 'x'.repeat(81), packet: base },
      { requestId: 'probe', packet: null }, { requestId: 'probe', packet: { content: 1, key: 'k' } },
      { requestId: 'probe', packet: { content: '[00:01.00]歌词' } }]) expect(normalizeMessage({ type: 'inspectLyrics', data })).toBeNull();
  });

  it('returns parser classifications with each original request ID and song key while preserving normal messages', async () => {
    const host = mockHost(), display = vi.fn(), stop = listen(display);
    host.emit({ type: 'inspectLyrics', data: { requestId: 'word-request', packet: { ...base, key: 'word-song', format: 'yrc', content: '[1000,2000](1000,1000,0)你(2000,1000,0)好' } } });
    host.emit({ type: 'inspectLyrics', data: { requestId: 'line-request', packet: { ...base, key: 'line-song', format: 'lrc', content: '[00:01.00]歌词' } } });
    host.emit({ type: 'online', data: { key: 'display-song' } });
    await vi.waitFor(() => expect(host.postMessage).toHaveBeenCalledTimes(2));
    expect(host.postMessage).toHaveBeenCalledWith({ type: 'lyricInspection', value: { requestId: 'word-request', key: 'word-song', usable: true, wordTimed: true } });
    expect(host.postMessage).toHaveBeenCalledWith({ type: 'lyricInspection', value: { requestId: 'line-request', key: 'line-song', usable: true, wordTimed: false } });
    expect(display).toHaveBeenCalledExactlyOnceWith({ type: 'online', data: { key: 'display-song' } });
    stop();
  });

  it('does not send inspection results after the page listener is disposed', async () => {
    const host = mockHost(), stop = listen(vi.fn());
    host.emit({ type: 'inspectLyrics', data: { requestId: 'old', packet: { ...base, format: 'lrc', content: '[00:01.00]歌词' } } });
    stop(); await Promise.resolve(); await Promise.resolve();
    expect(host.postMessage).not.toHaveBeenCalled();
  });

  it('shares one real parser inspection across five subscriptions while delivering ordinary messages to all subscribers', async () => {
    const inspect = vi.spyOn(inspection, 'inspectDesktopLyrics');
    const host = mockHost(), displays = Array.from({ length: 5 }, () => vi.fn()), stops = displays.map(display => listen(display));
    expect(host.handlerCount()).toBe(1);
    host.emit({ type: 'inspectLyrics', data: { requestId: 'shared', packet: { ...base, format: 'qq-qrc', content: wordQrc } } });
    host.emit({ type: 'online', data: { key: 'display-song' } });
    await vi.waitFor(() => expect(host.postMessage).toHaveBeenCalledTimes(1));
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(host.postMessage).toHaveBeenCalledWith({ type: 'lyricInspection', value: { requestId: 'shared', key: base.key, usable: true, wordTimed: true } });
    for (const display of displays) expect(display).toHaveBeenCalledExactlyOnceWith({ type: 'online', data: { key: 'display-song' } });
    stops.forEach(stop => stop());
    expect(host.handlerCount()).toBe(0);
  });

  it('keeps an in-flight inspection active after one subscriber leaves and makes unsubscribe idempotent', async () => {
    let complete!: (quality: inspection.DesktopLyricInspection) => void;
    const inspect = vi.spyOn(inspection, 'inspectDesktopLyrics').mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const host = mockHost(), stopFirst = listen(vi.fn()), display = vi.fn(), stopLast = listen(display);
    host.emit({ type: 'inspectLyrics', data: { requestId: 'partial', packet: base } });
    stopFirst(); stopFirst();
    expect(host.handlerCount()).toBe(1);
    host.emit({ type: 'online', data: { key: 'still-active' } });
    complete({ usable: true, wordTimed: false });
    await Promise.resolve();
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(host.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'lyricInspection', value: { requestId: 'partial', key: base.key, usable: true, wordTimed: false } });
    expect(display).toHaveBeenCalledExactlyOnceWith({ type: 'online', data: { key: 'still-active' } });
    stopLast(); expect(host.handlerCount()).toBe(0);
  });

  it('drops pending replies after every subscriber leaves, even if the same connection is subscribed again', async () => {
    const completions: ((quality: inspection.DesktopLyricInspection) => void)[] = [];
    const inspect = vi.spyOn(inspection, 'inspectDesktopLyrics').mockImplementation(() => new Promise(resolve => { completions.push(resolve); }));
    const host = mockHost(), stops = Array.from({ length: 5 }, () => listen(vi.fn()));
    host.emit({ type: 'inspectLyrics', data: { requestId: 'cancelled', packet: base } });
    stops.forEach(stop => stop()); expect(host.handlerCount()).toBe(0);
    const stopNew = listen(vi.fn());
    completions[0]({ usable: true, wordTimed: true }); await Promise.resolve();
    expect(host.postMessage).not.toHaveBeenCalled();
    host.emit({ type: 'inspectLyrics', data: { requestId: 'new', packet: base } });
    expect(inspect).toHaveBeenCalledTimes(2);
    completions[1]({ usable: true, wordTimed: false }); await Promise.resolve();
    expect(host.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'lyricInspection', value: { requestId: 'new', key: base.key, usable: true, wordTimed: false } });
    stopNew(); expect(host.handlerCount()).toBe(0);
  });
});
