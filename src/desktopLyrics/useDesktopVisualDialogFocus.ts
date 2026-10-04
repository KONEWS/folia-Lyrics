import { useLayoutEffect, type RefObject } from 'react';

// src/desktopLyrics/useDesktopVisualDialogFocus.ts — isolate keyboard focus inside original body-portalled asset dialogs.
// Closed details can retain layout rectangles; only their visible summary belongs in the Tab loop.
export const getDesktopVisualFocusableElements = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>(
  'button:not(:disabled),input:not(:disabled):not([type=hidden]),textarea:not(:disabled),select:not(:disabled),summary,a[href],[tabindex="0"]',
)).filter(element => {
  if (!element.getClientRects().length) return false;
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor instanceof HTMLDetailsElement && !ancestor.open
      && !ancestor.querySelector(':scope > summary')?.contains(element)) return false;
  }
  return getComputedStyle(element).visibility === 'visible';
});

export function useDesktopVisualDialogFocus(panel: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const entries = new Map<HTMLElement, HTMLElement | null>();
    const windows = () => Array.from(document.body.querySelectorAll<HTMLElement>('.desktop-visual-asset-dialog'));
    const current = () => windows().at(-1) ?? null;
    const enter = (window: HTMLElement, last = false) => {
      const controls = getDesktopVisualFocusableElements(window);
      const target = last ? controls.at(-1) : controls[0];
      if (target) target.focus();
      else if (window.firstElementChild instanceof HTMLElement) {
        window.firstElementChild.tabIndex = -1; window.firstElementChild.focus();
      }
    };
    // Capture the opener before moving focus. Track removal after the upstream exit animation.
    const sync = () => {
      for (const window of windows()) {
        if (entries.has(window)) continue;
        entries.set(window, document.activeElement instanceof HTMLElement ? document.activeElement : null);
        enter(window);
      }
      for (const [window, opener] of entries) {
        if (window.isConnected) continue;
        entries.delete(window);
        if (opener?.isConnected) opener.focus();
      }
    };
    const keyboard = (event: KeyboardEvent) => {
      const window = current();
      if (!window || event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') {
        // The original import submenu owns its document-level Escape listener.
        if (window.querySelector('[role="menu"]')) return;
        event.preventDefault(); event.stopPropagation();
        if (event.repeat) return;
        const close = window.firstElementChild ? Array.from(window.firstElementChild.children).find(child => child instanceof HTMLButtonElement) : null;
        if (close instanceof HTMLButtonElement && !close.disabled) close.click();
      }
      if (event.key !== 'Tab') return;
      const controls = getDesktopVisualFocusableElements(window), first = controls[0], last = controls.at(-1);
      if (!controls.length || !window.contains(document.activeElement)) { event.preventDefault(); enter(window, event.shiftKey); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const keepFocus = (event: FocusEvent) => {
      const window = current();
      if (window && !window.contains(event.target as Node | null)) enter(window);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true });
    document.addEventListener('keydown', keyboard, true);
    document.addEventListener('focusin', keepFocus, true);
    return () => {
      observer.disconnect(); document.removeEventListener('keydown', keyboard, true); document.removeEventListener('focusin', keepFocus, true);
      for (const opener of entries.values()) if (opener?.isConnected && panel.current?.contains(opener)) opener.focus();
    };
  }, [panel]);
}
