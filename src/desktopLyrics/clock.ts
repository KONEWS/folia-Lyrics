import type { Clock } from './bridge';
import type { Line } from '../types';
import { findLatestActiveLineIndex } from '../utils/appPlaybackHelpers';

// src/desktopLyrics/clock.ts
export type ManualClock = { enabled: boolean; playing: boolean; position: number; received: number };
export function clockPosition(clock: Clock, now: number, manual: ManualClock): number {
  if (manual.enabled) return Math.max(0, manual.position + (manual.playing ? Math.max(0, now - manual.received) / 1000 : 0));
  if (!clock.hasTimeline) return 0;
  const elapsed = clock.playing ? Math.min(2, Math.max(0, now - clock.received) / 1000) * clock.rate : 0;
  const value = Math.max(0, clock.position + elapsed); return clock.duration > 0 ? Math.min(clock.duration, value) : value;
}
export const timeLabel = (time: number) => `${Math.floor(Math.max(0, time) / 60)}:${String(Math.floor(Math.max(0, time) % 60)).padStart(2, '0')}`;

// Reuse the playback resolver between lyric boundaries; seeks and exact inclusive end times still use its original rules.
export function createDesktopLineResolver(lines: Line[]) {
    const boundaries = [...new Set(lines.flatMap(line => [line.startTime, line.renderHints?.renderEndTime ?? line.endTime]))]
        .filter(Number.isFinite).sort((left, right) => left - right);
    let lower = Infinity, upper = -Infinity, index = -1;
    return (time: number) => {
        if (!Number.isFinite(time)) return findLatestActiveLineIndex(lines, time);
        if (time > lower && time < upper) return index;
        index = findLatestActiveLineIndex(lines, time);
        let start = 0, end = boundaries.length;
        while (start < end) {
            const middle = (start + end) >>> 1;
            if (boundaries[middle] < time) start = middle + 1;
            else end = middle;
        }
        upper = boundaries[start] ?? Infinity;
        lower = upper === time ? time : boundaries[start - 1] ?? -Infinity;
        return index;
    };
}
