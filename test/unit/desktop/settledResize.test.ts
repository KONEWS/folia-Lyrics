import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeSettledResize, VISUALIZER_RESIZE_SETTLE_MS } from '../../../src/components/visualizer/observeSettledResize';

// test/unit/desktop/settledResize.test.ts — expensive GPU resize work waits for a stable, visible viewport and is cancelled on teardown.
let notify: ResizeObserverCallback;
const disconnect = vi.fn();
const host = { clientWidth: 1280, clientHeight: 800 } as HTMLElement;
function size(width: number, height: number) {
  notify([{ target: host, contentRect: { width, height } } as unknown as ResizeObserverEntry], {} as ResizeObserver);
}
beforeEach(() => {
  vi.useFakeTimers(); disconnect.mockClear();
  vi.stubGlobal('ResizeObserver', class { constructor(callback: ResizeObserverCallback) { notify = callback; } observe() {} disconnect = disconnect; });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('settled visualizer viewport', () => {
  it('coalesces a continuous drag and only rebuilds once after it ends', () => {
    const resize = vi.fn(), stop = observeSettledResize(host, resize);
    size(1280, 800); vi.advanceTimersByTime(200); expect(resize).not.toHaveBeenCalled();
    for (let i = 0; i < 100; i++) { size(900 + i, 600 + i); vi.advanceTimersByTime(8); }
    expect(resize).not.toHaveBeenCalled();
    vi.advanceTimersByTime(VISUALIZER_RESIZE_SETTLE_MS); expect(resize).toHaveBeenCalledTimes(1);
    size(999, 699); vi.advanceTimersByTime(200); expect(resize).toHaveBeenCalledTimes(1);
    stop(); expect(disconnect).toHaveBeenCalledOnce();
  });
  it('equal observer notifications do not postpone the final resize', () => {
    const resize = vi.fn(), stop = observeSettledResize(host, resize);
    size(1000, 700); vi.advanceTimersByTime(90); size(1000, 700); vi.advanceTimersByTime(10);
    expect(resize).toHaveBeenCalledOnce(); stop();
  });
  it('hidden zero-size observations cancel stale work and restore can resize again', () => {
    const resize = vi.fn(), stop = observeSettledResize(host, resize);
    size(1000, 700); size(0, 0); vi.advanceTimersByTime(200); expect(resize).not.toHaveBeenCalled();
    size(1100, 740); vi.advanceTimersByTime(100); expect(resize).toHaveBeenCalledOnce(); stop();
  });
  it('unmount cancels a pending rebuild and ignores late observer deliveries', () => {
    const resize = vi.fn(), stop = observeSettledResize(host, resize);
    size(1000, 700); stop(); size(1100, 740); vi.advanceTimersByTime(200);
    expect(resize).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});
