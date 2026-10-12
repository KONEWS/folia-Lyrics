import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDesktopState } from '../../../src/desktopLyrics/useDesktopState';

// test/unit/desktop/desktopStateFrameDemand.test.ts — which host messages wake a parked clock loop. The real message handler runs against a fake host.
const hooks = vi.hoisted(() => ({ effects: [] as (() => (() => void) | void)[] }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: (effect: () => (() => void) | void) => hooks.effects.push(effect),
  useCallback: (callback: unknown) => callback,
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
}));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); hooks.effects.length = 0; });

function connect() {
  const listeners = new Set<(event: { data: unknown }) => void>(), posted: object[] = [];
  vi.stubGlobal('window', { chrome: { webview: { postMessage: (message: object) => posted.push(message),
    addEventListener: (_name: string, handler: (event: { data: unknown }) => void) => listeners.add(handler),
    removeEventListener: (_name: string, handler: (event: { data: unknown }) => void) => listeners.delete(handler) } } });
  const state = useDesktopState(), cleanup = hooks.effects.at(-1)!() as () => void;
  const wakes = vi.fn(); state.frameDemand.subscribe(wakes);
  const emit = (type: string, data: unknown) => listeners.forEach(handler => handler({ data: { type, data } }));
  return { state, cleanup, wakes, emit, listeners, posted };
}
const clock = { position: 12, duration: 180, rate: 1, playing: false, hasTimeline: true };
const session = { ...clock, key: 'song', title: 'Title', artist: 'Artist', cover: '', source: 'Player', sources: [], sessionId: 's1' };
const spectrum = { bins: btoa(String.fromCharCode(...new Uint8Array(1024).fill(90))), sampleRate: 48000 };

describe('host messages that wake the clock loop', () => {
  it('announces itself to the host and exposes one stable wake signal', () => {
    const { posted, state } = connect();
    expect(posted).toEqual([{ type: 'ready' }]);
    expect(typeof state.frameDemand.request).toBe('function');
  });

  it('wakes on a clock packet only when something it publishes changed', () => {
    const { emit, wakes, state } = connect();
    emit('clock', clock);
    expect(wakes).toHaveBeenCalledTimes(1);                   // EMPTY -> a real timeline
    emit('clock', { ...clock }); emit('clock', { ...clock }); emit('clock', { ...clock });
    expect(wakes).toHaveBeenCalledTimes(1);                   // the host repeats an unchanged packet every 500 ms while paused
    expect(state.clock.current.position).toBe(12);
    expect(state.clock.current.received).toBeGreaterThan(0);  // the packet is still stored, so extrapolation stays anchored
    emit('clock', { ...clock, position: 90 }); expect(wakes).toHaveBeenCalledTimes(2);
    emit('clock', { ...clock, position: 90, playing: true }); expect(wakes).toHaveBeenCalledTimes(3);
    emit('clock', { ...clock, position: 91, playing: true }); expect(wakes).toHaveBeenCalledTimes(4);
    emit('clock', { ...clock, position: 91, playing: true, duration: 181 }); expect(wakes).toHaveBeenCalledTimes(5);
    emit('clock', { ...clock, position: 91, playing: true, duration: 181, rate: 2 }); expect(wakes).toHaveBeenCalledTimes(6);
  });

  it('wakes on a session packet that changes the clock, not on a repeat', () => {
    const { emit, wakes } = connect();
    emit('session', session); expect(wakes).toHaveBeenCalledTimes(1);
    emit('session', { ...session }); expect(wakes).toHaveBeenCalledTimes(1);
    emit('session', { ...session, playing: true }); expect(wakes).toHaveBeenCalledTimes(2);
    emit('session', { ...session, key: 'next', title: 'Next', playing: true }); expect(wakes).toHaveBeenCalledTimes(2);   // same numbers, new song: nothing new to publish
    emit('session', { ...session, key: 'next', playing: true, position: 0 }); expect(wakes).toHaveBeenCalledTimes(3);
  });

  it('wakes on every valid spectrum packet and ignores a malformed one', () => {
    const { emit, wakes, state } = connect();
    emit('spectrum', spectrum); emit('spectrum', spectrum); emit('spectrum', spectrum);
    expect(wakes).toHaveBeenCalledTimes(3);
    expect(state.spectrum.current.bins[0]).toBe(90);
    expect(state.spectrum.current.received).toBeGreaterThan(0);
    emit('spectrum', { bins: '***not base64***', sampleRate: 48000 });
    expect(wakes).toHaveBeenCalledTimes(3);
  });

  it('does not wake for messages that cannot change the clock loop', () => {
    const { emit, wakes } = connect();
    emit('preferences', { audioReactive: true }); emit('notice', { text: 'hello' }); emit('audioStatus', { text: 'ok' });
    emit('windowState', { maximized: false, fullscreen: false }); emit('library', { folders: [], count: 0 }); emit('appearance', { acrylic: false, solid: false, highContrast: false });
    emit('connectionError', { text: 'x' }); emit('scan', { active: false, text: '' }); emit('restore', {});
    expect(wakes).not.toHaveBeenCalled();
  });

  it('stops listening to the host when the page state is torn down', () => {
    const { cleanup, listeners, emit, wakes } = connect();
    expect(listeners.size).toBeGreaterThan(0);
    cleanup();
    expect(listeners.size).toBe(0);
    emit('clock', { ...clock, position: 77 });
    expect(wakes).not.toHaveBeenCalled();
  });
});
