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
    // Keep the small gap between the trigger and its portaled menu inside the immersive hover area.
    const menuBridge = (event: PointerEvent) => {
      const button = surface.querySelector('.desktop-topbar-shell button[aria-expanded="true"][aria-controls]');
      const trigger = button?.closest('.topbar-mode-picker,.topbar-more-control') ?? button;
      const controlled = button ? document.getElementById(button.getAttribute('aria-controls') || '') : null;
      const menu = controlled?.closest('.desktop-top-menu') ?? controlled;
      if (!trigger || !menu || !surface.contains(menu) || !menu.classList.contains('desktop-top-menu')) return false;
      const anchor = trigger.getBoundingClientRect(), bounds = menu.getBoundingClientRect();
      const between = bounds.top >= anchor.bottom ? event.clientY >= anchor.bottom && event.clientY <= bounds.top
        : bounds.bottom <= anchor.top && event.clientY >= bounds.bottom && event.clientY <= anchor.top;
      return between && event.clientX >= Math.min(anchor.left, bounds.left) && event.clientX <= Math.max(anchor.right, bounds.right);
    };
    const blurChrome = () => { if (footerFocused() || topFocused()) (document.activeElement as HTMLElement).blur(); };
    if (!immersive) { cursor(false); controls(false); topControls(false); }
    if (panel || clickThrough) { blurChrome(); cursor(false); controls(false); topControls(false); return; }
    if (fullscreen) { if (immersive && topFocused()) (document.activeElement as HTMLElement).blur(); topControls(false); }
    if (!bottomHoverControls) controls(false);
    const arm = () => {
      window.clearTimeout(timer);
      // Loading lyrics must not interrupt revealed controls; empty waiting pages only skip entering immersion automatically.
      if ((!autoImmersive || !hasLyrics) && !immersive) return;
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
      const topChrome = event.target instanceof Element && Boolean(event.target.closest('.desktop-topbar-shell,.window-chrome,.desktop-top-menu'));
      const bottom = !menu && event.clientY >= window.innerHeight - Math.min(160, window.innerHeight / 3);
      const top = !fullscreen && (topChrome || event.clientY <= Math.min(128, window.innerHeight / 3) || immersive && menuBridge(event));
      if (immersive && !bottom && footerFocused()) (document.activeElement as HTMLElement).blur();
      if (immersive && !top && !menu && topFocused()) (document.activeElement as HTMLElement).blur();
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
