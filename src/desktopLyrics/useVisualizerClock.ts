import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useMotionValue } from 'framer-motion';
import { findLatestActiveLineIndex } from '../utils/appPlaybackHelpers';
import type { Line } from '../types';
import type { Clock } from './bridge';
import { clockPosition, type ManualClock } from './clock';
import { DesktopClockValue } from './DesktopClockValue';

// src/desktopLyrics/useVisualizerClock.ts
export function useVisualizerClock(lines: Line[], clock: RefObject<Clock>, input: RefObject<{ bins: Uint8Array; sampleRate: number; received: number }>, manual: ManualClock, offset: number, reactive: boolean) {
  const [currentTime] = useState(() => new DesktopClockValue(0));
  const playbackTime = useMotionValue(0);
  const audioPower = useMotionValue(0), bass = useMotionValue(0), lowMid = useMotionValue(0), mid = useMotionValue(0), vocal = useMotionValue(0), treble = useMotionValue(0);
  const spectrum = useMotionValue(new Uint8Array(1024));
  const audioBands = useMemo(() => ({ bass, lowMid, mid, vocal, treble, spectrum }), [bass, lowMid, mid, vocal, treble, spectrum]);
  const [lineIndex, setLineIndex] = useState(-1); const lastLine = useRef(-1);
  useEffect(() => {
    let frame = 0, lastTime = NaN, audioReceived = -1, audioSampleRate = 0, audioLive: boolean | null = null, hz = 48000 / 2048;
    const raw = new Uint8Array(1024);
    const energy = (min: number, max: number, exponent: number) => {
      const start = Math.floor(min / hz), end = Math.min(1023, Math.floor(max / hz)); let sum = 0;
      for (let i = start; i <= end; i++) sum += raw[i]; return Math.pow(sum / Math.max(1, end - start + 1) / 255, exponent) * 255;
    };
    const tick = (now: number) => {
      const position = clockPosition(clock.current, now, manual); playbackTime.set(position);
      const time = Math.max(0, position + offset); currentTime.set(time);
      if (lastTime !== time) {
        lastTime = time;
        const index = findLatestActiveLineIndex(lines, time); if (lastLine.current !== index) { lastLine.current = index; setLineIndex(index); }
      }
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
      frame = requestAnimationFrame(tick);
    }; frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [lines, clock, input, manual, offset, reactive, currentTime, playbackTime, audioPower, bass, lowMid, mid, vocal, treble, spectrum]);
  return { currentTime, playbackTime, audioPower, audioBands, lineIndex };
}
