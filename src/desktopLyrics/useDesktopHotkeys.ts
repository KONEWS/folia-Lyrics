import { useEffect } from 'react';
import { send } from './bridge';

// src/desktopLyrics/useDesktopHotkeys.ts — Escape exits native fullscreen and restores desktop controls.
export function useDesktopHotkeys(fullscreen: boolean, restoreControls: () => void) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'F11') { event.preventDefault(); return; }
      if (event.key !== 'Escape') return;
      if (event.defaultPrevented) return;
      event.preventDefault();
      if (event.repeat) return;
      if (fullscreen) send('exitFullscreen');
      restoreControls();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [fullscreen, restoreControls]);
}
