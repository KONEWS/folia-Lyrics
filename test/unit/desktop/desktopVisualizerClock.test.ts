import { afterEach, describe, expect, it, vi } from 'vitest';
import { MotionValue } from 'framer-motion';
import { useVisualizerClock } from '../../../src/desktopLyrics/useVisualizerClock';
import { EMPTY } from '../../../src/desktopLyrics/bridge';
import type { ManualClock } from '../../../src/desktopLyrics/clock';
import { createFrameDemand, type FrameDemand } from '../../../src/desktopLyrics/frameDemand';

// test/unit/desktop/desktopVisualizerClock.test.ts — drive the real desktop clock without reducing its frame cadence.
const hooks = vi.hoisted(() => ({ effects: [] as (() => (() => void) | void)[], states: [] as unknown[] }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useLayoutEffect: (effect: () => (() => void) | void) => hooks.effects.push(effect),
  useMemo: (create: () => unknown) => create(),
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => {
    const value = typeof initial === 'function' ? initial() : initial;
    hooks.states.push(value); return [value, vi.fn()];
  },
}));
vi.mock('framer-motion', async importOriginal => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useMotionValue: (value: unknown) => new actual.MotionValue(value) };
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); hooks.effects.length = 0; hooks.states.length = 0; });

// The RAF stub executes each requested frame once and exposes cleanup cancellation.
function mount(reactive: boolean, demand?: FrameDemand, lyricKey?: string, presentationReady = true) {
  const scheduled = new Map<number, FrameRequestCallback>(); let identifier = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { scheduled.set(++identifier, callback); return identifier; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => scheduled.delete(id));
  const clock = { current: { ...EMPTY, hasTimeline: true, position: 2, duration: 180, received: 1000 } };
  const input = { current: { bins: new Uint8Array(1024).fill(128), sampleRate: 48000, received: 1000 } };
  const manual: ManualClock = { enabled: false, playing: false, position: 0, received: 1000 };
  const runtime = useVisualizerClock([], clock, input, manual, 0, reactive, demand, lyricKey, presentationReady);
  const cleanup = hooks.effects.at(-1)!();
  const tick = (now: number) => {
    const pending = scheduled.entries().next().value!;
    scheduled.delete(pending[0]); pending[1](now);
  };
  return { clock, input, runtime, tick, cleanup, scheduled };
}
describe('desktop clock audio work', () => {
  it('publishes an already ready paused scene before its first animation frame', () => {
    const mounted = mount(false);
    expect(mounted.runtime.currentTime.get()).toBe(2); expect(mounted.runtime.playbackTime.get()).toBe(2);
    mounted.cleanup?.();
  });
  it('holds lyric time even for the new key until its font and presentation are ready', () => {
    const demand = createFrameDemand(), mounted = mount(false, demand, '', false);
    mounted.clock.current = { ...mounted.clock.current, position: 43 };
    demand.request(); mounted.tick(1000);
    expect(mounted.runtime.currentTime.get()).toBe(0); expect(mounted.runtime.playbackTime.get()).toBe(43);
    mounted.cleanup?.();
  });
  it('freezes the outgoing lyric clock while transport follows a new song, and still supports legacy clocks', () => {
    const demand = createFrameDemand(), mounted = mount(false, demand, 'visible-song');
    mounted.clock.current = { ...mounted.clock.current, key: 'visible-song' }; mounted.tick(1000);
    expect(mounted.runtime.currentTime.get()).toBe(2);
    mounted.clock.current = { ...mounted.clock.current, key: 'new-song', position: 43, playing: true };
    vi.stubGlobal('performance', { now: () => 1000 }); demand.request(); mounted.tick(1100);
    expect(mounted.runtime.currentTime.get()).toBe(2); expect(mounted.runtime.playbackTime.get()).toBeCloseTo(43.1);
    mounted.clock.current = { ...mounted.clock.current, key: undefined, position: 6, playing: false };
    demand.request(); expect(mounted.runtime.currentTime.get()).toBe(6);
    mounted.cleanup?.();
  });
  it('coalesces active audio requests into the next RAF without publishing extra lyric clock changes', () => {
    const demand = createFrameDemand(), mounted = mount(true, demand);
    mounted.clock.current = { ...mounted.clock.current, playing: true };
    mounted.tick(1000);
    const changed = vi.fn(), unsubscribe = mounted.runtime.playbackTime.on('change', changed);
    vi.stubGlobal('performance', { now: () => 1100 });
    for (let packet = 0; packet < 20; packet++) {
      mounted.input.current.received = 1100;
      mounted.input.current.bins.fill(200);
      demand.request('spectrum');
    }
    expect(mounted.runtime.currentTime.get()).toBe(2);
    expect(changed).not.toHaveBeenCalled();
    expect(mounted.scheduled.size).toBe(1);
    mounted.tick(1117);
    expect(mounted.runtime.currentTime.get()).toBeCloseTo(2.117, 12);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(mounted.runtime.audioBands.spectrum.get()[0]).toBe(200);
    unsubscribe(); mounted.cleanup?.();
  });
  it('publishes the exact pause and seek positions synchronously before a renderer stops its draw loop', () => {
    const demand = createFrameDemand(), mounted = mount(false, demand);
    mounted.clock.current = { ...mounted.clock.current, position: 42, playing: true };
    mounted.tick(1500);
    expect(mounted.runtime.currentTime.get()).toBe(42.5);
    mounted.clock.current = { ...mounted.clock.current, position: 42.8, playing: false, received: 1800 };
    vi.stubGlobal('performance', { now: () => 1800 });
    demand.request();
    // A renderer's setPaused/renderOnce can now read the final timestamp before the pending desktop RAF runs.
    expect(mounted.runtime.currentTime.get()).toBe(42.8);
    expect(mounted.runtime.playbackTime.get()).toBe(42.8);
    expect(mounted.scheduled.size).toBe(1);
    mounted.tick(5000);
    expect(mounted.runtime.currentTime.get()).toBe(42.8);
    mounted.clock.current = { ...mounted.clock.current, position: 4 };
    demand.request();
    expect(mounted.runtime.currentTime.get()).toBe(4);
    mounted.cleanup?.();
  });
  it('keeps 60 immutable spectrum snapshots and exact band values while scanning only 20 new FFT packets', () => {
    const mounted = mount(true), pow = vi.spyOn(Math, 'pow');
    const snapshots: Uint8Array[] = [];
    const unsubscribe = mounted.runtime.audioBands.spectrum.on('change', bins => snapshots.push(bins));
    for (let frame = 0; frame < 60; frame++) {
      const now = 1000 + frame * 1000 / 60;
      if (frame % 3 === 0) mounted.input.current.received = now;
      mounted.tick(now);
    }
    expect(pow).toHaveBeenCalledTimes(20 * 8);
    expect(snapshots).toHaveLength(60);
    expect(new Set(snapshots).size).toBe(60);
    expect(mounted.runtime.audioBands.bass.get()).toBeCloseTo((128 / 255) ** 1.8 * 255, 12);
    expect(mounted.runtime.audioBands.lowMid.get()).toBeCloseTo((128 / 255) ** 2 * 255, 12);
    expect(mounted.runtime.audioBands.vocal.get()).toBeCloseTo((128 / 255) ** 1.5 * 255, 12);
    expect(mounted.runtime.audioPower.get()).toBeCloseTo((128 / 255) ** 3 * 255, 12);
    mounted.input.current.bins.fill(255); mounted.input.current.received = 2000; mounted.tick(2000);
    expect(snapshots[0][0]).toBe(128);
    expect(snapshots.at(-1)?.[0]).toBe(255);
    expect(mounted.runtime.audioBands.bass.get()).toBe(255);
    unsubscribe(); mounted.cleanup?.(); expect(mounted.scheduled.size).toBe(0);
  });
  it('clears stale input at 500ms and reacts immediately to a new sample rate and packet', () => {
    const mounted = mount(true); mounted.tick(1000);
    expect(mounted.runtime.audioPower.get()).toBeGreaterThan(0);
    mounted.tick(1500);
    expect(mounted.runtime.audioPower.get()).toBe(0);
    expect([...mounted.runtime.audioBands.spectrum.get()].every(value => value === 0)).toBe(true);
    mounted.input.current.sampleRate = 44100; mounted.input.current.received = 1501;
    mounted.tick(1501); expect(mounted.runtime.audioPower.get()).toBeGreaterThan(0);
    mounted.cleanup?.();
  });
  it('disabled audio stays silent without rescanning zeros on every animation frame', () => {
    const mounted = mount(false), pow = vi.spyOn(Math, 'pow');
    for (let frame = 0; frame < 60; frame++) mounted.tick(1000 + frame * 1000 / 60);
    expect(pow).toHaveBeenCalledTimes(8);
    expect(mounted.runtime.audioPower.get()).toBe(0);
    expect([...mounted.runtime.audioBands.spectrum.get()].every(value => value === 0)).toBe(true);
    expect(mounted.runtime.currentTime).toBeInstanceOf(MotionValue);
    expect(mounted.runtime.currentTime.get()).toBe(2);
    mounted.cleanup?.();
  });
});
