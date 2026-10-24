import { describe, expect, it } from 'vitest';
import { cancelUncappedAnimationFrame, restoreGlobalVisualizerFrameRateLimiter, createFrameRateLimitedRaf, installGlobalVisualizerFrameRateLimiter, parseVisualizerFrameRate, requestUncappedAnimationFrame, setGlobalVisualizerFrameRate, shouldProcessFrameAtRate } from '../../../src/utils/frameRateLimiter';

// test/unit/utils/frameRateLimiter.test.ts

describe('frameRateLimiter', () => {
    it('parses supported visualizer frame rates', () => {
        expect(parseVisualizerFrameRate(null)).toBe('off');
        expect(parseVisualizerFrameRate('off')).toBe('off');
        expect(parseVisualizerFrameRate('auto')).toBe('off');
        expect(parseVisualizerFrameRate('120')).toBe(120);
        expect(parseVisualizerFrameRate('90')).toBe(90);
        expect(parseVisualizerFrameRate('60')).toBe(60);
        expect(parseVisualizerFrameRate('30')).toBe('off');
        expect(parseVisualizerFrameRate('15')).toBe('off');
        expect(parseVisualizerFrameRate('24')).toBe('off');
    });

    it('skips frames until the target interval has elapsed', () => {
        expect(shouldProcessFrameAtRate(1000, 0, 60)).toBe(true);
        expect(shouldProcessFrameAtRate(1015, 1000, 60)).toBe(false);
        expect(shouldProcessFrameAtRate(1016, 1000, 60)).toBe(true);
    });

    it('always processes frames when disabled', () => {
        expect(shouldProcessFrameAtRate(1001, 1000, 'off')).toBe(true);
    });

    it('flushes all queued callbacks together on allowed frames', () => {
        const nativeCallbacks: FrameRequestCallback[] = [];
        const limiter = createFrameRateLimitedRaf(
            (callback) => {
                nativeCallbacks.push(callback);
                return nativeCallbacks.length;
            },
            () => undefined,
            60,
        );
        const processed: string[] = [];

        limiter.requestAnimationFrame(() => processed.push('a'));
        limiter.requestAnimationFrame(() => processed.push('b'));

        nativeCallbacks[0]?.(1000);
        expect(processed).toEqual(['a', 'b']);

        limiter.requestAnimationFrame(() => processed.push('c'));
        nativeCallbacks[1]?.(1015);
        expect(processed).toEqual(['a', 'b']);

        nativeCallbacks[2]?.(1016);
        expect(processed).toEqual(['a', 'b', 'c']);
    });

    it('continues flushing callbacks when one callback throws', () => {
        const originalConsoleError = console.error;
        const originalSetTimeout = globalThis.setTimeout;
        const nativeCallbacks: FrameRequestCallback[] = [];
        const reportedErrors: unknown[] = [];
        console.error = () => undefined;
        globalThis.setTimeout = ((callback: TimerHandler) => {
            try {
                if (typeof callback === 'function') {
                    callback();
                }
            } catch (error) {
                reportedErrors.push(error);
            }
            return 1 as unknown as ReturnType<typeof setTimeout>;
        }) as unknown as typeof setTimeout;

        try {
            const limiter = createFrameRateLimitedRaf(
                (callback) => {
                    nativeCallbacks.push(callback);
                    return nativeCallbacks.length;
                },
                () => undefined,
                60,
            );
            const error = new Error('boom');
            const processed: string[] = [];

            limiter.requestAnimationFrame(() => {
                throw error;
            });
            limiter.requestAnimationFrame(() => processed.push('after-error'));
            nativeCallbacks[0]?.(1000);

            expect(processed).toEqual(['after-error']);
            expect(reportedErrors).toEqual([error]);

            limiter.requestAnimationFrame(() => processed.push('next-frame'));
            nativeCallbacks[1]?.(1016);
            expect(processed).toEqual(['after-error', 'next-frame']);
        } finally {
            console.error = originalConsoleError;
            globalThis.setTimeout = originalSetTimeout;
        }
    });

    it('lets an earlier callback cancel a self-scheduling callback in the same frame', () => {
        const nativeCallbacks: FrameRequestCallback[] = [];
        const limiter = createFrameRateLimitedRaf(callback => {
            nativeCallbacks.push(callback);
            return nativeCallbacks.length;
        }, () => undefined);
        const processed: string[] = [];
        limiter.requestAnimationFrame(() => {
            processed.push('cancel');
            limiter.cancelAnimationFrame(rendererHandle);
        });
        const rendererHandle = limiter.requestAnimationFrame(() => {
            processed.push('renderer');
            limiter.requestAnimationFrame(() => processed.push('orphan'));
        });
        nativeCallbacks[0](1000);
        expect(processed).toEqual(['cancel']);
        expect(nativeCallbacks).toHaveLength(1);
    });

    it('cancels the native frame when the last queued callback is removed', () => {
        const cancelled: number[] = [];
        let requests = 0;
        const limiter = createFrameRateLimitedRaf(() => ++requests, handle => cancelled.push(handle));
        const first = limiter.requestAnimationFrame(() => undefined);
        const second = limiter.requestAnimationFrame(() => undefined);
        limiter.cancelAnimationFrame(first);
        expect(cancelled).toEqual([]);
        limiter.cancelAnimationFrame(second);
        expect(cancelled).toEqual([1]);
        limiter.requestAnimationFrame(() => undefined);
        expect(requests).toBe(2);
    });

    it('defers callbacks scheduled during a flush until the next frame', () => {
        const nativeCallbacks: FrameRequestCallback[] = [];
        const limiter = createFrameRateLimitedRaf(callback => { nativeCallbacks.push(callback); return nativeCallbacks.length; }, () => undefined);
        const processed: string[] = [];
        limiter.requestAnimationFrame(() => {
            processed.push('first');
            limiter.requestAnimationFrame(() => processed.push('next'));
        });
        nativeCallbacks[0](1000); expect(processed).toEqual(['first']);
        nativeCallbacks[1](1016); expect(processed).toEqual(['first', 'next']);
    });

    it('keeps pending callback handles stable when uncapping globally', () => {
        const previousWindow = (globalThis as { window?: Window; }).window;
        const originalRequestAnimationFrame = () => 1;
        const originalCancelAnimationFrame = () => undefined;
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: {
                requestAnimationFrame: originalRequestAnimationFrame,
                cancelAnimationFrame: originalCancelAnimationFrame,
                localStorage: { getItem: () => null },
            },
        });

        try {
            installGlobalVisualizerFrameRateLimiter(60);
            expect(globalThis.window.requestAnimationFrame).not.toBe(originalRequestAnimationFrame);

            setGlobalVisualizerFrameRate('off');
            expect(globalThis.window.requestAnimationFrame).not.toBe(originalRequestAnimationFrame);
            expect(globalThis.window.cancelAnimationFrame).not.toBe(originalCancelAnimationFrame);
            restoreGlobalVisualizerFrameRateLimiter();
            expect(globalThis.window.requestAnimationFrame).toBe(originalRequestAnimationFrame);
        } finally {
            Object.defineProperty(globalThis, 'window', {
                configurable: true,
                value: previousWindow,
            });
        }
    });

    it('reaches every display frame through the uncapped request while the cap is on', () => {
        const previousWindow = (globalThis as { window?: Window; }).window;
        const displayQueue = new Map<number, FrameRequestCallback>();
        let nextDisplayHandle = 1;
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: {
                requestAnimationFrame: (callback: FrameRequestCallback) => {
                    displayQueue.set(nextDisplayHandle, callback);
                    nextDisplayHandle += 1;
                    return nextDisplayHandle - 1;
                },
                cancelAnimationFrame: (handle: number) => {
                    displayQueue.delete(handle);
                },
                localStorage: { getItem: () => null },
            },
        });
        const runDisplayFrame = (timestamp: number) => {
            const callbacks = Array.from(displayQueue.values());
            displayQueue.clear();
            callbacks.forEach(callback => callback(timestamp));
        };

        try {
            // Asked for before the cap is switched on and cancelled after it: the handle is the display's own.
            let cancelledRan = false;
            const cancelled = requestUncappedAnimationFrame(() => {
                cancelledRan = true;
            });
            installGlobalVisualizerFrameRateLimiter(60);
            cancelUncappedAnimationFrame(cancelled);

            let capped = 0;
            let uncapped = 0;
            const countCapped = () => {
                capped += 1;
                globalThis.window.requestAnimationFrame(countCapped);
            };
            const countUncapped = () => {
                uncapped += 1;
                requestUncappedAnimationFrame(countUncapped);
            };
            globalThis.window.requestAnimationFrame(countCapped);
            requestUncappedAnimationFrame(countUncapped);

            // Twelve frames of a 120 Hz display under a cap of 60.
            for (let frame = 1; frame <= 12; frame += 1) {
                runDisplayFrame(frame * (1000 / 120));
            }

            expect(cancelledRan).toBe(false);
            expect(uncapped).toBe(12);
            expect(capped).toBe(6);
        } finally {
            restoreGlobalVisualizerFrameRateLimiter();
            Object.defineProperty(globalThis, 'window', {
                configurable: true,
                value: previousWindow,
            });
        }
    });
});

// Simulate physical refresh clocks independently from the target; fractional ratios must not silently reduce the chosen FPS.
describe('frame budget phase and cancellation', () => {
  function harness(rate: 60 | 90 | 120) {
    let id = 0;
    const native = new Map<number, FrameRequestCallback>();
    const limiter = createFrameRateLimitedRaf(callback => { native.set(++id, callback); return id; }, handle => { native.delete(handle); }, rate);
    const tick = (time: number) => { const callbacks = [...native.values()]; native.clear(); callbacks.forEach(callback => callback(time)); };
    return { native, limiter, tick };
  }
  for (const display of [60, 75, 90, 120, 144, 165, 240]) for (const rate of [60, 90, 120] as const) {
    it('maintains '+rate+' FPS budget on a '+display+' Hz display', () => {
      const { limiter, tick } = harness(rate); let frames = 0;
      const draw = () => { frames++; limiter.requestAnimationFrame(draw); };
      limiter.requestAnimationFrame(draw);
      for (let i = 0; i < display * 5; i++) tick(1000 + i * 1000 / display);
      expect(Math.abs(frames - Math.min(rate, display) * 5)).toBeLessThanOrEqual(1);
    });
  }
  it('cancels another callback in the same flush and cancels the last unused native request', () => {
    const { limiter, tick, native } = harness(60); let second = 0; const called: string[] = [];
    limiter.requestAnimationFrame(() => { called.push('first'); limiter.cancelAnimationFrame(second); });
    second = limiter.requestAnimationFrame(() => called.push('cancelled')); tick(1000);
    expect(called).toEqual(['first']);
    const pending = limiter.requestAnimationFrame(() => called.push('late'));
    expect(native.size).toBe(1); limiter.cancelAnimationFrame(pending); expect(native.size).toBe(0);
  });
  it('switches cap/off/cap without losing cancellation or stacking native requests', () => {
    const { limiter, tick, native } = harness(60); const called: number[] = [];
    const cancelled = limiter.requestAnimationFrame(() => called.push(-1));
    limiter.setFrameRate('off'); limiter.cancelAnimationFrame(cancelled); expect(native.size).toBe(0);
    const draw = (now: number) => { called.push(now); limiter.requestAnimationFrame(draw); };
    limiter.requestAnimationFrame(draw); tick(1000); tick(1006); expect(called).toHaveLength(2);
    limiter.setFrameRate(60); expect(native.size).toBe(1); tick(1012); tick(1018); expect(called).toHaveLength(3);
  });
  it('resumes from a long suspension with one current frame, without catch-up bursts', () => {
    const { limiter, tick } = harness(60); const called: number[] = [];
    const draw = (now: number) => { called.push(now); limiter.requestAnimationFrame(draw); };
    limiter.requestAnimationFrame(draw); tick(1000); tick(1010); tick(6000);
    expect(called).toEqual([1000, 6000]); tick(6007); expect(called).toHaveLength(2);
  });
});
