import { afterEach, describe, expect, it, vi } from 'vitest';
import { listen, type Message } from '../../../src/desktopLyrics/bridge';

// test/unit/desktop/bridgeDispatch.test.ts — one normalized host packet reaches every live subscriber without duplicating native work.
const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(stop => stop()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function mockHost() {
  const handlers = new Set<(event: { data: unknown }) => void>();
  const bridge = { postMessage: vi.fn(),
    addEventListener: vi.fn((_name: string, handler: (event: { data: unknown }) => void) => handlers.add(handler)),
    removeEventListener: vi.fn((_name: string, handler: (event: { data: unknown }) => void) => handlers.delete(handler)) };
  const connect = () => vi.stubGlobal('window', { chrome: { webview: bridge } });
  connect();
  return { bridge, connect, handlerCount: () => handlers.size, emit: (data: unknown) => [...handlers].forEach(handler => handler({ data })) };
}
const subscribe = (receive: (message: Message) => void) => { const stop = listen(receive); cleanups.push(stop); return stop; };
const online = { type: 'online', data: { key: 'song' } };

describe('shared desktop message receiver', () => {
  it('normalizes an incoming session once and delivers the same packet through one native handler', () => {
    const host = mockHost(), displays = Array.from({ length: 5 }, () => vi.fn());
    displays.forEach(subscribe);
    expect(host.handlerCount()).toBe(1);
    const sourceId = vi.fn(() => 'player');
    const source = { get id() { return sourceId(); }, label: 'Player' };
    host.emit({ type: 'session', data: { key: 'song', position: NaN, duration: 60, rate: 1, sources: [source] } });
    expect(sourceId).toHaveBeenCalledTimes(1);
    const packet = displays[0].mock.calls[0][0];
    expect(packet.data).toMatchObject({ position: 0, sources: [{ id: 'player', label: 'Player' }] });
    for (const display of displays) {
      expect(display).toHaveBeenCalledTimes(1);
      expect(display.mock.calls[0][0]).toBe(packet);
    }
    host.emit({ type: 'spectrum', data: { bins: 42, sampleRate: 48000 } });
    for (const display of displays) expect(display).toHaveBeenCalledTimes(1);
  });

  it('retains independent subscriptions for one callback and removes the native listener only after the last one leaves', () => {
    const host = mockHost(), receive = vi.fn(), stopFirst = subscribe(receive), stopLast = subscribe(receive);
    host.emit(online); expect(receive).toHaveBeenCalledTimes(2);
    stopFirst(); stopFirst();
    host.emit(online); expect(receive).toHaveBeenCalledTimes(3);
    expect(host.handlerCount()).toBe(1);
    stopLast(); expect(host.handlerCount()).toBe(0);
    expect(host.bridge.removeEventListener).toHaveBeenCalledTimes(1);
    const stopReplayed = subscribe(receive);
    expect(host.handlerCount()).toBe(1);
    host.emit(online); expect(receive).toHaveBeenCalledTimes(4);
    stopReplayed(); expect(host.handlerCount()).toBe(0);
  });

  it('starts newly added subscriptions on the next packet and skips those removed during dispatch', () => {
    const host = mockHost(), removed = vi.fn(), added = vi.fn();
    let stopRemoved: () => void = () => undefined, stopAdded: (() => void) | undefined;
    subscribe(() => { stopRemoved(); stopAdded ??= subscribe(added); });
    stopRemoved = subscribe(removed);
    host.emit(online); expect(removed).not.toHaveBeenCalled(); expect(added).not.toHaveBeenCalled();
    host.emit(online); expect(removed).not.toHaveBeenCalled(); expect(added).toHaveBeenCalledExactlyOnceWith(online);
  });

  it('reports one subscriber failure while continuing clock and transport delivery to other subscribers', () => {
    const host = mockHost(), failure = new Error('subscriber failed'), report = vi.fn(), receive = vi.fn();
    vi.stubGlobal('reportError', report);
    subscribe(() => { throw failure; }); subscribe(receive);
    host.emit(online);
    expect(report).toHaveBeenCalledExactlyOnceWith(failure);
    expect(receive).toHaveBeenCalledExactlyOnceWith(online);
  });

  it('keeps listeners isolated when the native connection is replaced', () => {
    const first = mockHost(), oldDisplay = vi.fn(), stopOld = subscribe(oldDisplay);
    const second = mockHost(), newDisplay = vi.fn(); subscribe(newDisplay);
    first.emit(online); expect(oldDisplay).toHaveBeenCalledTimes(1); expect(newDisplay).not.toHaveBeenCalled();
    stopOld(); expect(first.handlerCount()).toBe(0); expect(second.handlerCount()).toBe(1);
    second.emit(online); expect(newDisplay).toHaveBeenCalledExactlyOnceWith(online);
  });

  it('supports an absent native bridge without registering a listener', () => {
    vi.stubGlobal('window', {});
    const stop = subscribe(vi.fn());
    expect(() => { stop(); stop(); }).not.toThrow();
  });
});
