import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

// src/desktopLyrics/useDesktopSettingsDismiss.ts — dismiss desktop settings one pointer layer at a time.
type Gesture = { outside: boolean; shield: HTMLElement | null };

export function useDesktopSettingsDismiss(panel: RefObject<HTMLElement | null>, onClose: () => void) {
  const latestClose = useRef(onClose);
  useLayoutEffect(() => { latestClose.current = onClose; }, [onClose]);
  useEffect(() => {
    let gesture: Gesture | null = null;
    const asset = () => Array.from(document.querySelectorAll<HTMLElement>('.desktop-visual-asset-dialog')).at(-1) ?? null;
    const menu = (owner: HTMLElement | null) => {
      if (!owner) return null;
      const nested = owner.querySelector<HTMLElement>('[role="menu"]');
      if (nested) return nested;
      for (const trigger of owner.querySelectorAll('[aria-controls]')) {
        const popup = document.getElementById(trigger.getAttribute('aria-controls') ?? '');
        if (popup?.matches('.desktop-glass-menu')) return popup;
      }
      return null;
    };
    // Remember the layer before upstream mousedown/blur handlers remove a menu. A release that
    // started in a slider or dialog never becomes an outside click, and text-field blur commits first.
    const begin = (event: PointerEvent) => {
      gesture = null;
      const target = event.target, surface = panel.current;
      if (!(target instanceof Element) || !surface) return;
      const child = asset(), popup = menu(child ?? surface);
      const outside = !surface.contains(target) && !target.closest('[data-settings-trigger]');
      if (event.button !== 0) {
        if (outside && !child && !popup) {
          const focused = document.activeElement;
          if (focused instanceof HTMLElement && surface.contains(focused)) focused.blur();
          event.preventDefault(); latestClose.current();
        }
        return;
      }
      gesture = { outside: outside && !child && !popup,
        shield: child && popup && target === child ? child : null };
    };
    const finish = (event: MouseEvent) => {
      const started = gesture;
      gesture = null;
      if (!started || event.button !== 0 || event.detail === 0) return;
      // An import menu owns the first backdrop click; do not also invoke its parent dialog's
      // original backdrop handler after that menu has disappeared on mousedown.
      if (started.shield && event.target === started.shield) {
        event.preventDefault(); event.stopPropagation(); return;
      }
      const target = event.target, surface = panel.current;
      if (!started.outside || !(target instanceof Element) || !surface || surface.contains(target)
        || target.closest('[data-settings-trigger]') || asset() || menu(surface)) return;
      latestClose.current();
      // Consume blank-space dismissal so the same click cannot reach the lyric/player surface.
      if (!target.closest('button,a,input,textarea,select,[role="combobox"],[role="menuitem"]')) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    const cancel = () => { gesture = null; };
    document.addEventListener('pointerdown', begin, true);
    document.addEventListener('pointercancel', cancel, true);
    document.addEventListener('click', finish, true);
    return () => {
      document.removeEventListener('pointerdown', begin, true);
      document.removeEventListener('pointercancel', cancel, true);
      document.removeEventListener('click', finish, true);
    };
  }, [panel]);
}
