import { MotionValue, type MotionValueEventCallbacks } from 'framer-motion';

// src/desktopLyrics/DesktopClockValue.ts
// Original renderers subscribe after a lazy mode switch. Replay the real timestamp
// once to each new subscriber, including when the external player is paused.
export class DesktopClockValue extends MotionValue<number> {
  override on<EventName extends keyof MotionValueEventCallbacks<number>>(
    eventName: EventName, callback: MotionValueEventCallbacks<number>[EventName],
  ): VoidFunction {
    const unsubscribe = super.on(eventName, callback);
    if (eventName !== 'change') return unsubscribe;
    let active = true;
    queueMicrotask(() => { if (active) (callback as (value: number) => void)(this.get()); });
    return () => { active = false; unsubscribe(); };
  }
}
