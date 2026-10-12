import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useMotionValue } from 'framer-motion';
import { findLatestActiveLineIndex } from '../utils/appPlaybackHelpers';
import type { Line } from '../types';
import type { Clock } from './bridge';
import { clockPosition, type ManualClock } from './clock';
import { DesktopClockValue } from './DesktopClockValue';
import type { FrameDemand } from './frameDemand';

// src/desktopLyrics/useVisualizerClock.ts
// With a FrameDemand, a loop that has nothing to publish parks itself after this long without any change. It has to outlast the progress
// bars' fade to silence (about 1.7 s at their 180 ms decay) so the last frame they draw is already flat.
export const IDLE_PARK_MS = 2500;
// Each tick contributes at most this many ms to the idle budget, matching the decay cap in audioProgressSpectrum.ts so that the budget
// grows no faster than decay can clear residual levels. A suspended gap (minimize, background tab) contributes only one capped step
// on the resumed tick, preventing suspended time from counting toward the park threshold.
export const IDLE_BUDGET_STEP_MS = 100;
export function useVisualizerClock(lines: Line[], clock: RefObject<Clock>, input: RefObject<{ bins: Uint8Array; sampleRate: number; received: number }>, manual: ManualClock, offset: number, reactive: boolean, demand?: FrameDemand) {
  const [currentTime] = useState(() => new DesktopClockValue(0));
  const playbackTime = useMotionValue(0);
  const audioPower = useMotionValue(0), bass = useMotionValue(0), lowMid = useMotionValue(0), mid = useMotionValue(0), vocal = useMotionValue(0), treble = useMotionValue(0);
  const spectrum = useMotionValue(new Uint8Array(1024));
  const audioBands = useMemo(() => ({ bass, lowMid, mid, vocal, treble, spectrum }), [bass, lowMid, mid, vocal, treble, spectrum]);
  const [lineIndex, setLineIndex] = useState(-1); const lastLine = useRef(-1);
  useEffect(() => {
    let frame = 0, lastTime = NaN, audioReceived = -1, audioSampleRate = 0, audioLive: boolean | null = null, hz = 48000 / 2048, prevTick = NaN, idleBudget = 0, woken = false;
    const raw = new Uint8Array(1024);
    const energy = (min: number, max: number, exponent: number) => {
      const start = Math.floor(min / hz), end = Math.min(1023, Math.floor(max / hz)); let sum = 0;
      for (let i = start; i <= end; i++) sum += raw[i]; return Math.pow(sum / Math.max(1, end - start + 1) / 255, exponent) * 255;
    };
    // Publish the accepted host time before React applies paused props, so stopped renderers can draw their final frame.
    const publishClock = (now: number) => {
      const position = clockPosition(clock.current, now, manual); playbackTime.set(position);
      const time = Math.max(0, position + offset); currentTime.set(time);
      const timeChanged = lastTime !== time;
      if (timeChanged) {
        lastTime = time;
        const index = findLatestActiveLineIndex(lines, time); if (lastLine.current !== index) { lastLine.current = index; setLineIndex(index); }
      }
      return timeChanged;
    };
    const tick = (now: number) => {
      frame = 0;
      const timeChanged = publishClock(now);
      const source = input.current, live = reactive && now - source.received < 500;
      const audioChanged = live !== audioLive || live && (source.received !== audioReceived || source.sampleRate !== audioSampleRate);
      if (audioChanged) {
        audioLive = live; audioReceived = source.received; audioSampleRate = source.sampleRate; hz = source.sampleRate / 2048;
        if (live) raw.set(source.bins); else raw.fill(0);
      }
      // Immutable spectrum snapshots keep every original animation frame; unchanged FFT bands need no rescanning.
      spectrum.set(raw.slice());
      if (audioChanged) {
        bass.set(energy(20, 150, 1.8)); lowMid.set(energy(150, 400, 2)); mid.set(energy(400, 1200, 2)); vocal.set(energy(1000, 3500, 1.5)); treble.set(energy(3500, 12000, 2));
        audioPower.set(Math.pow((energy(20, 150, 1) + energy(150, 400, 1)) / 510, 3) * 255);
      }
      // Only without lyrics (no renderer is mounted to consume frames): park after IDLE_PARK_MS of accumulated idle budget.
      // The budget advances by min(delta, IDLE_BUDGET_STEP_MS) per tick — matching the decay cap in audioProgressSpectrum.ts — so a
      // suspended RAF gap (minimize, background tab) contributes only one capped step on the resumed tick, never the full elapsed time.
      // Activity or a wake signal resets the budget to zero so decay has time to complete before the next park.
      if (demand && lines.length === 0) {
        const advancing = manual.enabled ? manual.playing : clock.current.playing && clock.current.hasTimeline;
        if (woken || advancing || live || audioChanged || timeChanged) { idleBudget = 0; woken = false; }
        else { const delta = Number.isNaN(prevTick) ? 0 : now - prevTick; idleBudget += Math.min(delta, IDLE_BUDGET_STEP_MS); }
        prevTick = now;
        if (idleBudget >= IDLE_PARK_MS) { prevTick = NaN; return; }
      }
      frame = requestAnimationFrame(tick);
    };
    const wake = () => { publishClock(performance.now()); woken = true; if (!frame) frame = requestAnimationFrame(tick); };
    const unsubscribe = demand?.subscribe(wake);
    frame = requestAnimationFrame(tick);
    return () => { unsubscribe?.(); cancelAnimationFrame(frame); };
  }, [lines, clock, input, manual, offset, reactive, demand, currentTime, playbackTime, audioPower, bass, lowMid, mid, vocal, treble, spectrum]);
  return { currentTime, playbackTime, audioPower, audioBands, lineIndex };
}
