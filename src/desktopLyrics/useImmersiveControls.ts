import { useEffect, useRef, useState, type RefObject, type Dispatch, type SetStateAction } from 'react';
import type { Preferences } from './bridge';

// src/desktopLyrics/useImmersiveControls.ts — idle immersion and edge hover zones, without frame state.
type Options = { root: RefObject<HTMLElement | null>; immersive: boolean; setImmersive: Dispatch<SetStateAction<boolean>>;
  panel: boolean; hasLyrics: boolean; clickThrough: boolean; fullscreen: boolean; restore: number; preferences: Preferences };
export function useImmersiveControls({ root, immersive, setImmersive, panel, hasLyrics, clickThrough, fullscreen, restore, preferences }: Options) {
  const [cursorHidden, setCursorHidden] = useState(false), [controlsRevealed, setControlsRevealed] = useState(false);
  const [topControlsRevealed, setTopControlsRevealed] = useState(false);
  const flags = useRef({ cursor: false, controls: false, top: false });
  const { autoImmersive, immersiveDelay, bottomHoverControls } = preferences;
  useEffect(() => {
    const surface = root.current;
    if (!surface) return;
    let timer = 0;
    const cursor = (value: boolean) => { if (flags.current.cursor !== value) { flags.current.cursor = value; setCursorHidden(value); } };
    const controls = (value: boolean) => { if (flags.current.controls !== value) { flags.current.controls = value; setControlsRevealed(value); } };
    const topControls = (value: boolean) => { if (flags.current.top !== value) { flags.current.top = value; setTopControlsRevealed(value); } };
    const footerFocused = () => Boolean(surface.querySelector('.desktop-statusbar')?.contains(document.activeElement));
    const topFocused = () => Boolean(surface.querySelector('.desktop-topbar-shell')?.contains(document.activeElement) || surface.querySelector('.window-chrome')?.contains(document.activeElement)
      || surface.querySelector('.desktop-top-menu')?.contains(document.activeElement));
    const blurChrome = () => { if (footerFocused() || topFocused()) (document.activeElement as HTMLElement).blur(); };
    if (!immersive) { cursor(false); controls(false); topControls(false); }
    if (panel || !hasLyrics || clickThrough) { blurChrome(); cursor(false); controls(false); topControls(false); return; }
    if (fullscreen) { if (topFocused()) (document.activeElement as HTMLElement).blur(); topControls(false); }
    if (!bottomHoverControls) controls(false);
    const arm = () => {
      window.clearTimeout(timer);
      if (!autoImmersive && !immersive) return;
      const seconds = Number.isFinite(immersiveDelay) ? Math.min(3600, Math.max(1, immersiveDelay)) : 30;
      timer = window.setTimeout(() => {
        controls(false); topControls(false); cursor(true); blurChrome();
        if (autoImmersive) setImmersive(true);
      }, seconds * 1000);
    };
    // Only crossing visibility boundaries changes React state; pointer coordinates stay outside it.
    const pointer = (event: PointerEvent) => {
      cursor(false);
      const menu = event.target instanceof Element && Boolean(event.target.closest('.desktop-top-menu'));
      const bottom = !menu && event.clientY >= window.innerHeight - Math.min(160, window.innerHeight / 3);
      const top = !fullscreen && (menu || event.clientY <= Math.min(128, window.innerHeight / 3));
      if (!bottom && footerFocused()) (document.activeElement as HTMLElement).blur();
      if (!top && topFocused()) (document.activeElement as HTMLElement).blur();
      controls(immersive && bottomHoverControls && bottom);
      topControls(immersive && top);
      arm();
    };
    const activity = () => { cursor(false); if (immersive && footerFocused()) controls(true); if (immersive && !fullscreen && topFocused()) topControls(true); arm(); };
    const leave = () => {
      if (footerFocused()) (document.activeElement as HTMLElement).blur();
      controls(false);
      // The shared dropdown stays within this WebView; leaving the window releases its focus too.
      blurChrome(); topControls(false);
    };
    arm();
    surface.addEventListener('pointermove', pointer, { passive: true });
    surface.addEventListener('pointerdown', activity, { passive: true });
    surface.addEventListener('wheel', activity, { passive: true });
    surface.addEventListener('focusin', activity);
    surface.addEventListener('pointerleave', leave);
    window.addEventListener('keydown', activity, true);
    return () => {
      window.clearTimeout(timer);
      surface.removeEventListener('pointermove', pointer); surface.removeEventListener('pointerdown', activity);
      surface.removeEventListener('wheel', activity); surface.removeEventListener('focusin', activity); surface.removeEventListener('pointerleave', leave);
      window.removeEventListener('keydown', activity, true);
    };
  }, [root, immersive, setImmersive, panel, hasLyrics, clickThrough, fullscreen, restore, autoImmersive, immersiveDelay, bottomHoverControls]);
  return { cursorHidden, controlsRevealed, topControlsRevealed };
}
