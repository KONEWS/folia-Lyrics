import type { Clock } from './bridge';

// src/desktopLyrics/clock.ts
export type ManualClock = { enabled: boolean; playing: boolean; position: number; received: number };
export function clockPosition(clock: Clock, now: number, manual: ManualClock): number {
  if (manual.enabled) return Math.max(0, manual.position + (manual.playing ? Math.max(0, now - manual.received) / 1000 : 0));
  if (!clock.hasTimeline) return 0;
  const elapsed = clock.playing ? Math.min(2, Math.max(0, now - clock.received) / 1000) * clock.rate : 0;
  const value = Math.max(0, clock.position + elapsed); return clock.duration > 0 ? Math.min(clock.duration, value) : value;
}
export const timeLabel = (time: number) => `${Math.floor(Math.max(0, time) / 60)}:${String(Math.floor(Math.max(0, time) % 60)).padStart(2, '0')}`;
