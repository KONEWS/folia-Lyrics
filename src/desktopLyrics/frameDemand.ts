import type { Clock } from './bridge';

// src/desktopLyrics/frameDemand.ts — lets host messages wake the clock's animation loop after it parked because nothing on screen was changing.
export type FrameDemand = { request: () => void; subscribe: (listener: () => void) => () => void };

// The clock loop subscribes while it is mounted; the message handlers call request() when new host data could change what the loop publishes.
export function createFrameDemand(): FrameDemand {
  const listeners = new Set<() => void>();
  return {
    request: () => { for (const listener of listeners) listener(); },
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

// A host clock packet matters to the loop only when it moves the position or changes how that position is extrapolated or clamped.
// The host repeats an unchanged packet every 500 ms while paused; those repeats must not keep a parked loop awake. `received` is ignored.
export function clockNeedsFrames(previous: Clock, next: Clock): boolean {
  return previous.playing !== next.playing || previous.hasTimeline !== next.hasTimeline || previous.position !== next.position
    || previous.duration !== next.duration || previous.rate !== next.rate;
}
