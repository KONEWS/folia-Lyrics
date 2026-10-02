import { useEffect, useRef } from 'react';

// src/desktopLyrics/useGlassHighlights.ts
export function useGlassHighlights() {
  const surface = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = surface.current;
    if (!root) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let active: HTMLElement | null = null, trigger: HTMLButtonElement | null = null, frame = 0, x = 0, y = 0;
    const clear = () => {
      cancelAnimationFrame(frame); frame = 0;
      active?.style.removeProperty('--light-opacity'); active = null; trigger = null;
    };
    // One delegated highlight per pointer frame; continuous motion never enters React state.
    const move = (event: PointerEvent) => {
      if (reducedMotion.matches || event.pointerType === 'touch') { clear(); return; }
      const target = event.target instanceof Element ? event.target : null;
      const capsule = target?.closest<HTMLElement>('.topbar-mode-picker') ?? null;
      const button = capsule?.querySelector<HTMLButtonElement>('.desktop-glass-select button') ?? target?.closest('button');
      if (!(button instanceof HTMLButtonElement) || button.disabled || !button.closest('.window-chrome,.desktop-topbar-shell,.waiting-screen,.desktop-statusbar,.control-panel,.desktop-notice,.desktop-glass-menu')) { clear(); return; }
      // Compound selects share one surface, so icon, label and arrow use the capsule's coordinates.
      const highlight = capsule ?? button;
      if (active !== highlight) { clear(); active = highlight; }
      trigger = button;
      x = event.clientX; y = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!active?.isConnected || !trigger?.isConnected || trigger.disabled) { clear(); return; }
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
