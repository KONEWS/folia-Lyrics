import { useEffect, useRef, useState, type RefObject } from 'react';

// src/desktopLyrics/useImmersiveToggleIdle.ts — the restore button has its own five-second idle deadline.
export function useImmersiveToggleIdle(root: RefObject<HTMLElement | null>, immersive: boolean) {
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(false);
  useEffect(() => {
    const surface = root.current;
    let timer = 0;
    const visibility = (value: boolean) => {
      if (hiddenRef.current === value) return;
      hiddenRef.current = value; setHidden(value);
    };
    // Real input restarts one timeout; only the visible/hidden boundary updates React.
    const wake = () => {
      window.clearTimeout(timer); visibility(false);
      if (!immersive || !surface) return;
      timer = window.setTimeout(() => {
        const toggle = surface.querySelector('.restore-controls');
        if (toggle?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
        visibility(true);
      }, 5000);
    };
    wake();
    if (!immersive || !surface) return;
    surface.addEventListener('pointermove', wake, { passive: true });
    surface.addEventListener('pointerdown', wake, { passive: true });
    surface.addEventListener('wheel', wake, { passive: true });
    surface.addEventListener('focusin', wake);
    window.addEventListener('keydown', wake, true);
    return () => {
      window.clearTimeout(timer);
      surface.removeEventListener('pointermove', wake); surface.removeEventListener('pointerdown', wake);
      surface.removeEventListener('wheel', wake); surface.removeEventListener('focusin', wake);
      window.removeEventListener('keydown', wake, true);
    };
  }, [root, immersive]);
  return hidden;
}
