import type { Clock } from './bridge';

// src/desktopLyrics/frameDemand.ts — lets host messages wake the clock's animation loop after it parked because nothing on screen was changing.
export type FrameDemandReason = 'clock' | 'spectrum';
export type FrameDemand = { request: (reason?: FrameDemandReason) => void; subscribe: (listener: (reason: FrameDemandReason) => void) => () => void };

// The clock loop subscribes while it is mounted; the message handlers call request() when new host data could change what the loop publishes.
// Clock requests publish the accepted anchor immediately; spectrum requests only restart a parked loop for the next RAF.
export function createFrameDemand(): FrameDemand {
  const listeners = new Set<(reason: FrameDemandReason) => void>();
  return {
    request: (reason = 'clock') => { for (const listener of listeners) listener(reason); },
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

// A host clock packet matters to the loop only when it moves the position or changes how that position is extrapolated or clamped.
// The host repeats an unchanged packet every 500 ms while paused; those repeats must not keep a parked loop awake. `received` is ignored.
export function clockNeedsFrames(previous: Clock, next: Clock): boolean {
  return previous.playing !== next.playing || previous.hasTimeline !== next.hasTimeline || previous.position !== next.position
    || previous.duration !== next.duration || previous.rate !== next.rate;
}
