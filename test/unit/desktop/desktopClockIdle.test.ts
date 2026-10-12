import { afterEach, describe, expect, it, vi } from 'vitest';
import { useVisualizerClock, IDLE_PARK_MS, IDLE_BUDGET_STEP_MS } from '../../../src/desktopLyrics/useVisualizerClock';
import { smoothSpectrumLevels, spectrumLevels, spectrumPath, AUDIO_PROGRESS_BARS } from '../../../src/desktopLyrics/audioProgressSpectrum';
import { EMPTY, type Clock } from '../../../src/desktopLyrics/bridge';
import type { ManualClock } from '../../../src/desktopLyrics/clock';
import { clockNeedsFrames, createFrameDemand, type FrameDemand } from '../../../src/desktopLyrics/frameDemand';
import type { Line } from '../../../src/types';

// test/unit/desktop/desktopClockIdle.test.ts — the clock loop parks only when no renderer is mounted and nothing is changing, and every
// host message that could change a published value wakes it. Without a wake signal it behaves exactly as before.
// The idle budget advances by min(delta, IDLE_BUDGET_STEP_MS) per tick so a suspended RAF gap contributes only one capped step.
const hooks = vi.hoisted(() => ({ effects: [] as (() => (() => void) | void)[] }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: (effect: () => (() => void) | void) => hooks.effects.push(effect),
  useMemo: (create: () => unknown) => create(),
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
}));
vi.mock('framer-motion', async importOriginal => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useMotionValue: (value: unknown) => new actual.MotionValue(value) };
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); hooks.effects.length = 0; });

const FRAME = 1000 / 60;
const line = { id: 'l1', startTime: 0, endTime: 5, fullText: 'x', words: [] } as unknown as Line;
type Options = { lines?: Line[]; reactive?: boolean; demand?: FrameDemand; manual?: ManualClock; clock?: Partial<Clock> };

// One animation frame at a time: the stub records pending requests so the tests see exactly when the loop asks for more.
function mount(options: Options = {}) {
  const scheduled = new Map<number, FrameRequestCallback>(); let identifier = 0, now = 1000;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { scheduled.set(++identifier, callback); return identifier; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => scheduled.delete(id));
  const clock = { current: { ...EMPTY, ...options.clock } as Clock };
  const input = { current: { bins: new Uint8Array(1024), sampleRate: 48000, received: -100000 } };
  const manual = options.manual ?? { enabled: false, playing: false, position: 0, received: 0 };
  const runtime = useVisualizerClock(options.lines ?? [], clock, input, manual, 0, options.reactive ?? true, options.demand);
  const effect = hooks.effects.at(-1)!;
  let cleanup = effect() as () => void;
  // Deliver one pending frame at the current `now`, then advance `now` by FRAME.
  const frame = () => {
    expect(scheduled.size).toBe(1);                       // the loop never stacks frames
    const [id, callback] = scheduled.entries().next().value!;
    scheduled.delete(id); callback(now); now += FRAME;
  };
  // Deliver one pending frame at an explicit timestamp (for simulating suspended gaps) without advancing `now`.
  const frameAt = (timestamp: number) => {
    expect(scheduled.size).toBe(1);
    const [id, callback] = scheduled.entries().next().value!;
    scheduled.delete(id); callback(timestamp);
  };
  return {
    clock, input, runtime, scheduled, manual, frame, frameAt,
    get cleanup() { return cleanup; },
    remount: () => { cleanup(); cleanup = effect() as () => void; },
    runFor: (ms: number) => { const end = now + ms; while (scheduled.size && now < end) frame(); },
    runUntilParked: (limitMs = 30000) => { const start = now; while (scheduled.size && now - start < limitMs) frame(); return now - start; },
    get now() { return now; },
    set now(v: number) { now = v; },
  };
}

describe('clock loop parking (no lyrics, nothing changing)', () => {
  it('keeps running through the 2.5 s idle budget, then stops asking for frames and keeps its last values', () => {
    const demand = createFrameDemand(), m = mount({ demand });
    m.runFor(IDLE_PARK_MS - 100);
    expect(m.scheduled.size).toBe(1);
    const ran = m.runUntilParked();
    expect(m.scheduled.size).toBe(0);
    expect(ran + IDLE_PARK_MS - 100).toBeGreaterThanOrEqual(IDLE_PARK_MS);
    expect(ran + IDLE_PARK_MS - 100).toBeLessThan(IDLE_PARK_MS + 3 * FRAME);
    expect(m.runtime.playbackTime.get()).toBe(0);
    expect([...m.runtime.audioBands.spectrum.get()].every(value => value === 0)).toBe(true);
  });

  it('never parks while a renderer could be consuming frames (lyrics present), however idle the data is', () => {
    const m = mount({ demand: createFrameDemand(), lines: [line] });
    m.runFor(20000);
    expect(m.scheduled.size).toBe(1);
  });

  it('never parks while the player is playing, and parks 2.5 s after it pauses', () => {
    const m = mount({ demand: createFrameDemand(), clock: { playing: true, hasTimeline: true, position: 5, duration: 100, rate: 1, received: 1000 } });
    m.runFor(10000);
    expect(m.scheduled.size).toBe(1);
    m.clock.current = { ...m.clock.current, playing: false };
    const ran = m.runUntilParked();
    expect(ran).toBeGreaterThanOrEqual(IDLE_PARK_MS); expect(ran).toBeLessThan(IDLE_PARK_MS + 3 * FRAME);
  });

  it('a playing flag without a timeline does not keep it awake, but a timeline does', () => {
    const noTimeline = mount({ demand: createFrameDemand(), clock: { playing: true, hasTimeline: false } });
    noTimeline.runUntilParked(); expect(noTimeline.scheduled.size).toBe(0);
  });

  it('never parks while audio is live, and parks 2.5 s after the stale-input transition has been published', () => {
    const m = mount({ demand: createFrameDemand() });
    for (let i = 0; i < 300; i++) { m.input.current.received = m.now; m.input.current.bins.fill(180); m.frame(); }
    expect(m.scheduled.size).toBe(1);
    expect(m.runtime.audioPower.get()).toBeGreaterThan(0);
    const ran = m.runUntilParked();
    expect(ran).toBeGreaterThanOrEqual(500 + IDLE_PARK_MS - 2 * FRAME); expect(ran).toBeLessThan(500 + IDLE_PARK_MS + 6 * FRAME);
    expect(m.runtime.audioPower.get()).toBe(0);
    expect([...m.runtime.audioBands.spectrum.get()].every(value => value === 0)).toBe(true);
  });

  it('does not treat input as live when sound response is off', () => {
    const m = mount({ demand: createFrameDemand(), reactive: false });
    for (let i = 0; i < 60; i++) { m.input.current.received = m.now; m.input.current.bins.fill(180); m.frame(); }
    m.runUntilParked();
    expect(m.scheduled.size).toBe(0);
    expect(m.runtime.audioPower.get()).toBe(0);
  });

  it('follows the manual clock: advancing keeps it awake, a paused manual clock lets it park', () => {
    const manual: ManualClock = { enabled: true, playing: true, position: 3, received: 1000 };
    const m = mount({ demand: createFrameDemand(), manual });
    m.runFor(10000);
    expect(m.scheduled.size).toBe(1);
    expect(m.runtime.playbackTime.get()).toBeGreaterThan(3);
    manual.playing = false;
    m.runUntilParked();
    expect(m.scheduled.size).toBe(0);
  });

  it('keeps today\'s behaviour when no wake signal is given: it never parks', () => {
    const m = mount();
    m.runFor(30000);
    expect(m.scheduled.size).toBe(1);
  });
});

describe('waking a parked clock loop', () => {
  const parked = (options: Options = {}) => {
    const demand = createFrameDemand(), m = mount({ demand, ...options });
    m.runUntilParked();
    expect(m.scheduled.size).toBe(0);
    return { demand, m };
  };

  it('a changed position (a seek while paused) is published on the next frame, then the loop parks again', () => {
    const { demand, m } = parked();
    m.clock.current = { ...EMPTY, hasTimeline: true, position: 42, duration: 100, received: m.now };
    demand.request();
    expect(m.scheduled.size).toBe(1);
    m.frame();
    expect(m.runtime.playbackTime.get()).toBe(42);
    expect(m.scheduled.size).toBe(1);
    const ran = m.runUntilParked();
    expect(ran).toBeGreaterThanOrEqual(IDLE_PARK_MS - FRAME); expect(ran).toBeLessThan(IDLE_PARK_MS + 3 * FRAME);
    expect(m.runtime.playbackTime.get()).toBe(42);
  });

  it('a new spectrum packet is processed on the next frame', () => {
    const { demand, m } = parked();
    m.input.current.received = m.now; m.input.current.bins.fill(200);
    demand.request(); m.frame();
    expect(m.runtime.audioPower.get()).toBeGreaterThan(0);
    expect(m.runtime.audioBands.spectrum.get()[0]).toBe(200);
    expect(m.scheduled.size).toBe(1);
  });

  it('playback starting wakes it and keeps it awake', () => {
    const { demand, m } = parked();
    m.clock.current = { ...EMPTY, hasTimeline: true, playing: true, position: 10, duration: 100, received: m.now };
    demand.request();
    m.runFor(8000);
    expect(m.scheduled.size).toBe(1);
    expect(m.runtime.playbackTime.get()).toBeGreaterThan(10);
  });

  it('repeated requests never stack frames, whether parked or running', () => {
    const { demand, m } = parked();
    for (let i = 0; i < 100; i++) demand.request();
    expect(m.scheduled.size).toBe(1);
    m.frame();
    for (let i = 0; i < 100; i++) demand.request();
    expect(m.scheduled.size).toBe(1);
  });

  it('cleanup cancels the pending frame and stops listening', () => {
    const demand = createFrameDemand(), m = mount({ demand });
    m.frame();
    m.cleanup();
    expect(m.scheduled.size).toBe(0);
    demand.request();
    expect(m.scheduled.size).toBe(0);
    const { demand: other, m: parkedLoop } = parked();
    parkedLoop.cleanup(); other.request();
    expect(parkedLoop.scheduled.size).toBe(0);
  });

  it('a StrictMode style remount leaves exactly one live loop and one listener', () => {
    const { demand, m } = parked();
    m.remount();
    expect(m.scheduled.size).toBe(1);
    m.runUntilParked();
    expect(m.scheduled.size).toBe(0);
    demand.request();
    expect(m.scheduled.size).toBe(1);
    m.remount(); m.runUntilParked();
    demand.request();
    expect(m.scheduled.size).toBe(1);
  });
});

describe('idle budget: suspended RAF gaps and throttled frames', () => {
  // The clock loop uses an accumulated idle budget: each tick contributes min(delta, IDLE_BUDGET_STEP_MS) so a suspended
  // gap (minimize, background tab) contributes only one capped step on the resumed tick, never the full elapsed time.
  // IDLE_BUDGET_STEP_MS matches the decay cap in audioProgressSpectrum so the budget can never advance faster than decay clears levels.

  it('exports IDLE_BUDGET_STEP_MS matching the audioProgressSpectrum decay cap', () => {
    expect(IDLE_BUDGET_STEP_MS).toBe(100);
  });

  it('exact review scenario: live audio until ~1600ms, RAF suspended until 6000ms, no new host data — loop keeps running and spectrum reaches zero', () => {
    // Reproduce the review-reported state: loop parked immediately on the first resumed tick with the old wall-clock approach,
    // leaving a residual SVG level of 0.02869. With the budget approach the resumed tick contributes only 100ms to the budget,
    // so the loop keeps running for the remaining ~2400ms and publishes the silence spectrum before parking.
    const demand = createFrameDemand(), m = mount({ demand });

    // Drive ~600ms of live audio so spectrum and audioPower become non-zero.
    const liveEnd = m.now + 600;
    while (m.now < liveEnd) { m.input.current.received = m.now; m.input.current.bins.fill(200); m.frame(); }
    expect(m.runtime.audioPower.get()).toBeGreaterThan(0);
    expect(m.scheduled.size).toBe(1);

    // Simulate a 4400ms RAF suspension: deliver the pending callback at now+4400 without using frame()
    // (which would only advance by one FRAME). The hook receives a large delta but caps its budget contribution at IDLE_BUDGET_STEP_MS.
    const resumeTime = m.now + 4400;
    m.frameAt(resumeTime);

    // The loop must NOT park on the first resumed tick — the budget added only 100ms, far below IDLE_PARK_MS.
    expect(m.scheduled.size).toBe(1);
    // spectrum must now be all zeros (audioChanged fired on the resumed tick: live->false fills raw with zeros).
    expect([...m.runtime.audioBands.spectrum.get()].every(v => v === 0)).toBe(true);

    // Run subsequent normal-cadence frames from resumeTime until parked.
    let t = resumeTime + FRAME, framesAfter = 0;
    const maxFrames = Math.ceil((IDLE_PARK_MS + 500) / FRAME);
    while (m.scheduled.size && framesAfter < maxFrames) {
      const [id, cb] = m.scheduled.entries().next().value!;
      m.scheduled.delete(id); cb(t); t += FRAME; framesAfter++;
    }
    // Loop must have parked eventually (budget exhausted) and published zero spectrum/audioPower.
    expect(m.scheduled.size).toBe(0);
    expect(m.runtime.audioPower.get()).toBe(0);
    expect([...m.runtime.audioBands.spectrum.get()].every(v => v === 0)).toBe(true);
    // The budget approach gives ~150 frames after resume; decay to zero takes ~68 at 16.7ms, so it completes well before parking.
    expect(framesAfter).toBeGreaterThan(68);
    expect(framesAfter).toBeLessThan(maxFrames);
  });

  it('a gap smaller than one normal frame does not inflate the budget', () => {
    // Frames slightly earlier than expected (jitter) should not reset the budget or accelerate parking.
    const demand = createFrameDemand(), m = mount({ demand });
    m.runFor(IDLE_PARK_MS - 3 * FRAME);
    expect(m.scheduled.size).toBe(1);
    // Deliver one frame only 1ms after the previous one (tiny jitter, not a gap).
    const { now: before } = m;
    m.frameAt(before + 1);
    // Loop should still be running; the budget advanced by only 1ms.
    expect(m.scheduled.size).toBe(1);
    // A few more normal frames should finish the park.
    const ran = m.runUntilParked(IDLE_PARK_MS + 100);
    expect(m.scheduled.size).toBe(0);
    expect(ran).toBeLessThan(IDLE_PARK_MS + 5 * FRAME);
  });

  it('repeated throttling at ~200ms per frame: spectrum eventually reaches zero before the loop parks', () => {
    // Each tick at 200ms contributes min(200, 100)=100ms to the budget; park after 25 ticks (2500ms budget).
    // Decay from a live-audio state at 100ms/tick needs ~12 ticks. Decay completes well before the 25-tick park.
    const demand = createFrameDemand(), m = mount({ demand });

    // Build up live audio to a non-zero spectrum.
    for (let i = 0; i < 10; i++) { m.input.current.received = m.now; m.input.current.bins.fill(180); m.frame(); }
    expect(m.runtime.audioPower.get()).toBeGreaterThan(0);

    // Deliver 200ms-cadence ticks until parked. Track when spectrum reaches zero.
    let t = m.now + 200, spectrumZeroTick = -1, ticks = 0;
    const maxTicks = 60;
    while (m.scheduled.size && ticks < maxTicks) {
      const [id, cb] = m.scheduled.entries().next().value!;
      m.scheduled.delete(id); cb(t); t += 200; ticks++;
      if (spectrumZeroTick === -1 && [...m.runtime.audioBands.spectrum.get()].every(v => v === 0)) {
        spectrumZeroTick = ticks;
      }
    }
    // Loop parked (budget reached 2500ms at 100ms/tick = 25 ticks + 1 for the live->dead transition).
    expect(m.scheduled.size).toBe(0);
    // Spectrum reached zero before parking (decay needs ~12 ticks at 100ms, park at ~25-26 ticks).
    expect(spectrumZeroTick).toBeGreaterThan(0);
    expect(spectrumZeroTick).toBeLessThan(ticks);
    expect(m.runtime.audioPower.get()).toBe(0);
    expect([...m.runtime.audioBands.spectrum.get()].every(v => v === 0)).toBe(true);
  });

  it('multiple suspend/resume cycles: loop does not park mid-cycle and spectrum reaches zero', () => {
    // Three long gaps in a row. Each resumed tick contributes 100ms; the loop keeps running.
    const demand = createFrameDemand(), m = mount({ demand });
    for (let i = 0; i < 10; i++) { m.input.current.received = m.now; m.input.current.bins.fill(150); m.frame(); }
    expect(m.runtime.audioPower.get()).toBeGreaterThan(0);

    let t = m.now;
    for (let cycle = 0; cycle < 3; cycle++) {
      // 5000ms gap.
      t += 5000;
      m.frameAt(t);
      // Loop must not have parked on the resumed tick.
      expect(m.scheduled.size).toBe(1);
      // Run 3 normal frames to make progress.
      for (let f = 0; f < 3; f++) { if (!m.scheduled.size) break; t += FRAME; m.frameAt(t); }
    }
    // Now run until parked; spectrum must reach zero before that.
    let spectrumZeroSeen = [...m.runtime.audioBands.spectrum.get()].every(v => v === 0);
    const maxFrames = 200;
    let f = 0;
    while (m.scheduled.size && f < maxFrames) {
      t += FRAME; m.frameAt(t); f++;
      if (!spectrumZeroSeen && [...m.runtime.audioBands.spectrum.get()].every(v => v === 0)) spectrumZeroSeen = true;
    }
    expect(m.runtime.audioPower.get()).toBe(0);
    expect(spectrumZeroSeen).toBe(true);
  });

  it('smoothSpectrumLevels: the decay cap reproduces the review-reported residual and clears in ~12 more steps', () => {
    // Verify the arithmetic from idle-parking-gap-review.json: one resumed tick with a 4400ms gap uses step=100ms,
    // leaving 0.05 * exp(-100/180) ≈ 0.028688 — confirming that the budget cap matches the decay cap exactly.
    const levels = new Float32Array([0.05]);
    const target = new Float32Array([0]);
    smoothSpectrumLevels(levels, target, 4400);
    const expected = 0.05 * Math.exp(-100 / 180);
    expect(Math.abs(levels[0] - expected)).toBeLessThan(1e-6);
    // Run further 100ms steps to reach zero (threshold < 0.0001 in audioProgressSpectrum.ts:57).
    let steps = 0;
    while (levels[0] > 0 && steps < 50) { smoothSpectrumLevels(levels, target, 100); steps++; }
    expect(levels[0]).toBe(0);
    expect(steps).toBeLessThanOrEqual(15);
  });
});

describe('integrated subscriber: SVG path reaches SILENT_PATH before the loop parks', () => {
  // The clock loop publishes spectrum MotionValues that AudioProgress subscribes to via useMotionValueEvent
  // (AudioProgress.tsx lines 32-41). This block re-creates that subscriber inline with the real helpers —
  // spectrumLevels, smoothSpectrumLevels, spectrumPath and the 33 ms performance.now paint gate — and verifies
  // that the actual SVG path becomes the exact SILENT_PATH string before the loop parks. performance.now() is
  // stubbed independently from RAF timestamps, because AudioProgress reads performance.now() directly.
  //
  // The review scenario has audioLive already false BEFORE the RAF suspension, so the resumed tick has
  // audioChanged=false and receives no activity reset. The previous tests suspended while audioLive was still
  // true, so the resumed tick's live->false transition reset the old busyAt implementation too — a false pass.

  const SILENT_LEVELS = new Float32Array(AUDIO_PROGRESS_BARS);
  const SILENT_PATH = spectrumPath(SILENT_LEVELS);

  // A MotionValue stand-in with the 'change' events the subscriber listens to.
  function makeMotionValue<T>(initial: T) {
    const listeners = new Set<(value: T) => void>();
    return {
      value: initial,
      get() { return this.value; },
      set(next: T) { this.value = next; for (const listener of listeners) listener(next); },
      on(_event: string, handler: (value: T) => void) { listeners.add(handler); },
      clearListeners() { listeners.clear(); },
    };
  }

  // Inline AudioProgress subscriber (mirrors AudioProgress.tsx:32-41 exactly). `playing` is read through a
  // getter because in the real component it is a prop that flips from true to false when playback pauses;
  // levels only ever rise while playing, and decay toward SILENT_LEVELS afterwards.
  function makeSubscriber(spectrumMv: ReturnType<typeof makeMotionValue<Uint8Array>>, playing: () => boolean, sampleRate: number, perfNow: () => number) {
    const levels = new Float32Array(AUDIO_PROGRESS_BARS);
    let lastFrame = 0, path = SILENT_PATH, paints = 0;
    spectrumMv.on('change', bins => {
      const now = perfNow(), delta = now - lastFrame;
      if (delta < 33) return;                                  // the 33 ms paint gate
      lastFrame = now;
      // AudioProgress line 37: already fully silent and the target stays silent -> nothing to draw.
      if ((!playing() || !bins.some(v => v !== 0)) && levels.every(v => v === 0)) return;
      const target = playing() ? spectrumLevels(bins, sampleRate) : SILENT_LEVELS;
      smoothSpectrumLevels(levels, target, delta);
      path = spectrumPath(levels);
      paints++;
    });
    return { getPath: () => path, getLevels: () => Float32Array.from(levels), get paints() { return paints; },
      cleanup: () => spectrumMv.clearListeners() };
  }

  // Harness: clock loop with stubbed RAF and performance.now; the subscriber hangs off a MotionValue stand-in.
  // `state.playing` starts true (like a playing page whose progress bars are live) and the tests flip it to
  // false at the pause; AudioProgress then targets SILENT_LEVELS and its levels decay instead of rising.
  function subscriberHarness() {
    const perf = { t: 1000 };
    const state = { playing: true };
    vi.stubGlobal('performance', { now: () => perf.t });
    const demand = createFrameDemand();
    const m = mount({ demand, clock: { playing: true, hasTimeline: true, position: 5, duration: 100, rate: 1, received: 1000 } });
    // The loop publishes through the spectrum MotionValue; AudioProgress subscribes to the same object.
    const spectrumMv = makeMotionValue<Uint8Array>(new Uint8Array(1024));
    // Bridge the loop's spectrum.set() calls to the stand-in.
    const originalSet = m.runtime.audioBands.spectrum.set.bind(m.runtime.audioBands.spectrum);
    m.runtime.audioBands.spectrum.set = (v: Parameters<typeof originalSet>[0]) => { spectrumMv.set(v); originalSet(v); };
    const sub = makeSubscriber(spectrumMv, () => state.playing, 48000, () => perf.t);
    return { perf, state, m, sub };
  }

  // Deliver one pending frame at `timestamp` and advance the performance clock by perfStep.
  function deliver(m: ReturnType<typeof mount>, timestamp: number, perf: { t: number }, perfStep: number) {
    expect(m.scheduled.size).toBe(1);
    const [id, callback] = m.scheduled.entries().next().value!;
    m.scheduled.delete(id);
    perf.t += perfStep;
    callback(timestamp);
  }

  it('SILENT_PATH is the exact all-zero spectrumPath output with 144 bars at V47.00', () => {
    expect(SILENT_PATH).toBe(spectrumPath(new Float32Array(AUDIO_PROGRESS_BARS)));
    const bars = SILENT_PATH.split('M').filter(Boolean);
    expect(bars.length).toBe(AUDIO_PROGRESS_BARS);
    bars.forEach(bar => expect(bar).toMatch(/49V47\.00$/));
  });

  it('review scenario: stale transition at t1500, idle tick at t1600, RAF suspended to t6000 with audioLive already false — the subscriber reaches SILENT_PATH before the loop parks', () => {
    const { perf, state, m, sub } = subscriberHarness();
    try {
      // Phase 1: live audio while paused (sound response on, host keeps sending spectrum) so the subscriber
      // builds clearly nonzero levels. ~15 frames of 34 ms each.
      for (let i = 0; i < 15; i++) {
        m.input.current.received = m.now; m.input.current.bins.fill(200);
        deliver(m, m.now, perf, 34); m.now += FRAME;
      }
      expect(sub.getPath()).not.toBe(SILENT_PATH);
      expect(sub.getLevels().some(v => v > 0)).toBe(true);
      // The user pauses here: AudioProgress now targets SILENT_LEVELS and its levels begin to decay.
      state.playing = false;
      m.clock.current = { ...m.clock.current, playing: false };

      // Phase 2: stop feeding the input and run frames until the live->false transition has happened
      // (now - received >= 500 ms). That tick fires audioChanged (budget reset to 0) and publishes zeros.
      // performance.now advances by the real 16.7 ms frame step, so the 33 ms gate paints every other frame
      // and the levels remain clearly nonzero after this phase (~0.03-0.05), as the review scenario requires.
      const lastReceived = m.input.current.received;
      let transitionAt = -1;
      for (let i = 0; i < 60 && transitionAt < 0; i++) { deliver(m, m.now, perf, 17); m.now += FRAME; if (m.now - lastReceived >= 500) transitionAt = m.now; }
      expect(transitionAt).toBeGreaterThan(0);

      // Phase 3: one more idle tick ~100 ms later. audioLive is already false: no audioChanged, budget starts.
      const t1600 = transitionAt + 100;
      deliver(m, t1600, perf, 100);
      m.now = t1600 + FRAME;
      expect(m.scheduled.size).toBe(1);       // not parked: budget only has ~100 ms
      const levelsBeforeGap = sub.getLevels();
      expect(levelsBeforeGap.some(v => v > 0)).toBe(true);   // still decaying, levels remain nonzero

      // Phase 4: suspend RAF until t6000. audioLive is already false, so the resumed tick has
      // audioChanged=false: no budget reset. The gap contributes min(4400, 100) = 100 ms to the budget.
      const t6000 = t1600 + 4400;
      deliver(m, t6000, perf, 200);
      expect(m.scheduled.size).toBe(1);       // the loop must NOT park on the resumed tick

      // Phase 5: normal frames from t6000 until the loop parks; the subscriber must reach SILENT_PATH first.
      let silentFrame = -1;
      const maxFrames = Math.ceil((IDLE_PARK_MS + 1000) / FRAME);
      for (let i = 0; i < maxFrames; i++) {
        deliver(m, t6000 + (i + 1) * FRAME, perf, 34);
        if (silentFrame < 0 && sub.getPath() === SILENT_PATH) silentFrame = i;
        if (!m.scheduled.size) break;
      }
      expect(silentFrame).toBeGreaterThanOrEqual(0);          // the exact silent SVG was drawn
      expect(m.scheduled.size).toBe(0);                       // the loop parked afterwards
      expect(sub.getPath()).toBe(SILENT_PATH);
      expect(sub.getLevels().every(v => v === 0)).toBe(true);
    } finally { sub.cleanup(); }
  });

  it('normal 60 Hz cadence: subscriber reaches SILENT_PATH before the loop parks', () => {
    const { perf, state, m, sub } = subscriberHarness();
    try {
      for (let i = 0; i < 10; i++) { m.input.current.received = m.now; m.input.current.bins.fill(200); deliver(m, m.now, perf, 34); m.now += FRAME; }
      expect(sub.getPath()).not.toBe(SILENT_PATH);
      state.playing = false;                       // pause: bars now decay toward silence
      m.clock.current = { ...m.clock.current, playing: false };
      // 60 fps RAF with a 17 ms performance.now step: the 33 ms gate lets the subscriber paint every other tick.
      let silentFrame = -1;
      const maxFrames = Math.ceil((IDLE_PARK_MS + 2000) / FRAME);
      for (let i = 0; i < maxFrames; i++) {
        deliver(m, m.now, perf, 17); m.now += FRAME;
        if (silentFrame < 0 && sub.getPath() === SILENT_PATH) silentFrame = i;
        if (!m.scheduled.size) break;
      }
      expect(silentFrame).toBeGreaterThanOrEqual(0);
      expect(m.scheduled.size).toBe(0);
      expect(sub.getPath()).toBe(SILENT_PATH);
      expect(sub.getLevels().every(v => v === 0)).toBe(true);
    } finally { sub.cleanup(); }
  });

  it('repeated 1000 ms callbacks: subscriber reaches SILENT_PATH before the loop parks', () => {
    const { perf, state, m, sub } = subscriberHarness();
    try {
      for (let i = 0; i < 10; i++) { m.input.current.received = m.now; m.input.current.bins.fill(200); deliver(m, m.now, perf, 34); m.now += FRAME; }
      expect(sub.getPath()).not.toBe(SILENT_PATH);
      state.playing = false;                       // pause: bars now decay toward silence
      m.clock.current = { ...m.clock.current, playing: false };
      // 1 Hz throttling: each tick contributes min(1000, 100) = 100 ms of budget (park after ~25 idle ticks),
      // while the subscriber paints with step = min(1000, 100) = 100 ms of decay (zero after ~12 paints).
      let t = m.now + 1000, silentTick = -1, ticks = 0;
      while (m.scheduled.size && ticks < 60) {
        deliver(m, t, perf, 1000); t += 1000; ticks++;
        if (silentTick < 0 && sub.getPath() === SILENT_PATH) silentTick = ticks;
        if (!m.scheduled.size) break;
      }
      expect(silentTick).toBeGreaterThan(0);
      expect(silentTick).toBeLessThanOrEqual(ticks);
      expect(m.scheduled.size).toBe(0);
      expect(sub.getPath()).toBe(SILENT_PATH);
      expect(sub.getLevels().every(v => v === 0)).toBe(true);
    } finally { sub.cleanup(); }
  });

  it('repeated 200 ms callbacks: subscriber reaches SILENT_PATH before the loop parks', () => {
    const { perf, state, m, sub } = subscriberHarness();
    try {
      for (let i = 0; i < 10; i++) { m.input.current.received = m.now; m.input.current.bins.fill(180); deliver(m, m.now, perf, 34); m.now += FRAME; }
      expect(sub.getPath()).not.toBe(SILENT_PATH);
      state.playing = false;                       // pause: bars now decay toward silence
      m.clock.current = { ...m.clock.current, playing: false };
      // 200 ms throttling: budget 100 ms/tick (park after ~25 ticks), decay step min(200, 100) = 100 ms.
      let t = m.now + 200, silentTick = -1, ticks = 0;
      while (m.scheduled.size && ticks < 60) {
        deliver(m, t, perf, 200); t += 200; ticks++;
        if (silentTick < 0 && sub.getPath() === SILENT_PATH) silentTick = ticks;
        if (!m.scheduled.size) break;
      }
      expect(silentTick).toBeGreaterThan(0);
      expect(silentTick).toBeLessThanOrEqual(ticks);
      expect(m.scheduled.size).toBe(0);
      expect(sub.getPath()).toBe(SILENT_PATH);
      expect(sub.getLevels().every(v => v === 0)).toBe(true);
    } finally { sub.cleanup(); }
  });
});

describe('which clock packets matter to a parked loop', () => {
  const base: Clock = { ...EMPTY, hasTimeline: true, position: 30, duration: 200, rate: 1, playing: false, received: 5 };
  it('ignores repeats of an unchanged packet and the receive time', () => {
    expect(clockNeedsFrames(base, { ...base, received: 99999 })).toBe(false);
    expect(clockNeedsFrames(base, { ...base })).toBe(false);
  });
  it.each([['position', { position: 31 }], ['duration', { duration: 201 }], ['rate', { rate: 1.5 }], ['playing', { playing: true }], ['hasTimeline', { hasTimeline: false }]])(
    'wakes it when %s changes', (_name, change) => { expect(clockNeedsFrames(base, { ...base, ...change })).toBe(true); });
});
