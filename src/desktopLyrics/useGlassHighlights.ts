import { useEffect, useRef } from 'react';

// src/desktopLyrics/useGlassHighlights.ts
export function useGlassHighlights() {
  const surface = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = surface.current;
    if (!root) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let active: HTMLButtonElement | null = null, frame = 0, x = 0, y = 0;
    const clear = () => {
      cancelAnimationFrame(frame); frame = 0;
      active?.style.removeProperty('--light-opacity'); active = null;
    };
    // One delegated highlight per pointer frame; continuous motion never enters React state.
    const move = (event: PointerEvent) => {
      if (reducedMotion.matches || event.pointerType === 'touch') { clear(); return; }
      const button = event.target instanceof Element ? event.target.closest('button') : null;
      if (!(button instanceof HTMLButtonElement) || button.disabled || !button.closest('.window-chrome,.desktop-topbar,.waiting-screen,.desktop-statusbar,.control-panel,.desktop-notice')) { clear(); return; }
      if (active !== button) { clear(); active = button; }
      x = event.clientX; y = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!active?.isConnected || active.disabled) { clear(); return; }
        const bounds = active.getBoundingClientRect();
        active.style.setProperty('--light-x', `${x - bounds.left}px`);
        active.style.setProperty('--light-y', `${y - bounds.top}px`);
        active.style.setProperty('--light-opacity', '1');
      });
    };
    root.addEventListener('pointermove', move, { passive: true }); root.addEventListener('pointerleave', clear);
    window.addEventListener('blur', clear); reducedMotion.addEventListener('change', clear);
    return () => {
      clear(); root.removeEventListener('pointermove', move); root.removeEventListener('pointerleave', clear);
      window.removeEventListener('blur', clear); reducedMotion.removeEventListener('change', clear);
    };
  }, []);
  return surface;
}
