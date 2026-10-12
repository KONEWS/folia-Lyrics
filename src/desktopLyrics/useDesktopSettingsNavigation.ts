import { useLayoutEffect, type RefObject } from 'react';
import type { DesktopSettingsRequest, DesktopSettingsTarget } from '../types/desktopSettings';

// src/desktopLyrics/useDesktopSettingsNavigation.ts — reveal a requested control without replacing the settings form.
const focusable = 'input:not(:disabled),button:not(:disabled),select:not(:disabled),textarea:not(:disabled),[role="combobox"],summary';

function findTarget(panel: HTMLElement, target: DesktopSettingsTarget) {
  if (target.id === 'music-app-binding') return panel.querySelector<HTMLElement>(`[data-music-app-binding="${target.slot}"]`)
    ?? panel.querySelector<HTMLElement>('[data-settings-target="music-app-add"]');
  return panel.querySelector<HTMLElement>(`[data-settings-target="${target.id}"]`);
}

// Open enclosing disclosures first, then scroll each settings-owned viewport from the inside out.
export function revealDesktopSettingsTarget(panel: HTMLElement, target: DesktopSettingsTarget) {
  const element = findTarget(panel, target);
  if (!element) return false;
  for (const disclosure of panel.querySelectorAll<HTMLDetailsElement>(`details[data-settings-expand="${target.id}"]`)) disclosure.open = true;
  for (let ancestor: HTMLElement | null = element; ancestor && ancestor !== panel; ancestor = ancestor.parentElement)
    if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
  const sourceControl = target.id === 'online-sources' ? element.querySelector<HTMLElement>('input:not(:disabled)')
    ?? panel.querySelector<HTMLElement>('[data-settings-online-enabled]') : null;
  const control = sourceControl ?? (element.matches(focusable) ? element : element.matches(':disabled') ? element.closest<HTMLElement>('section') ?? panel
    : element.querySelector<HTMLElement>(focusable) ?? element);
  if (!control.matches(focusable)) control.tabIndex = -1;
  control.focus({ preventScroll: true });
  for (let viewport: HTMLElement | null = control.parentElement; viewport; viewport = viewport.parentElement) {
    if (viewport === panel || /auto|scroll/.test(getComputedStyle(viewport).overflowY)) {
      const bounds = viewport.getBoundingClientRect(), controlBounds = control.getBoundingClientRect();
      viewport.scrollTop += controlBounds.top - bounds.top - viewport.clientTop - 12;
    }
    if (viewport === panel) break;
  }
  return true;
}

export function useDesktopSettingsNavigation(scroll: RefObject<HTMLElement | null>, request?: DesktopSettingsRequest) {
  useLayoutEffect(() => {
    if (scroll.current && request) revealDesktopSettingsTarget(scroll.current, request.target);
  }, [scroll, request]);
}
