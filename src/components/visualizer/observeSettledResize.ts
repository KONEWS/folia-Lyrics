// src/components/visualizer/observeSettledResize.ts — let the browser scale an existing canvas during a drag, then allocate its final GPU surface once.
export const VISUALIZER_RESIZE_SETTLE_MS = 100;

// Runtime callers do their first synchronous layout before subscribing; repeated/zero-size observations do not rebuild that scene.
export function observeSettledResize(host: HTMLElement, resize: () => void): () => void {
  let width = host.clientWidth, height = host.clientHeight;
  let timer: ReturnType<typeof setTimeout> | undefined, active = true;
  const observer = new ResizeObserver(entries => {
    if (!active) return;
    const entry = entries.find(item => item.target === host);
    if (!entry) return;
    const nextWidth = Math.round(entry.contentRect.width), nextHeight = Math.round(entry.contentRect.height);
    if (width === nextWidth && height === nextHeight) return;
    width = nextWidth; height = nextHeight;
    clearTimeout(timer); timer = undefined;
    if (width <= 0 || height <= 0) return;
    timer = setTimeout(() => { timer = undefined; if (active) resize(); }, VISUALIZER_RESIZE_SETTLE_MS);
  });
  observer.observe(host);
  return () => { active = false; clearTimeout(timer); observer.disconnect(); };
}
