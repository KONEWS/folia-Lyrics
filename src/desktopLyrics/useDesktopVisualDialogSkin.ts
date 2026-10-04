import { useLayoutEffect, type RefObject } from 'react';
import type { Theme } from '../types';

// src/desktopLyrics/useDesktopVisualDialogSkin.ts — theme original body-portalled asset dialogs only while desktop settings are open.
const TOKENS = ['--glass-text', '--glass-muted', '--glass-line', '--glass-shadow', '--desktop-glass-base',
  '--desktop-glass-panel', '--desktop-glass-backdrop', '--desktop-glass-control', '--desktop-glass-rim', '--desktop-glass-inner',
  '--desktop-glass-hover', '--desktop-glass-selected', '--desktop-glass-accent', '--desktop-control-radius',
  '--desktop-control-font-size', '--desktop-control-line-height', '--desktop-control-padding',
  '--desktop-control-height', '--desktop-control-border', '--desktop-control-selected-border',
  '--desktop-surface-radius'] as const;

export function useDesktopVisualDialogSkin(panel: RefObject<HTMLElement | null>, theme: Theme, closeLabel: string) {
  useLayoutEffect(() => {
    const root = panel.current?.closest<HTMLElement>('.desktop-lyrics');
    if (!root) return;
    const body = document.body;
    const previous = TOKENS.map(token => [token, body.style.getPropertyValue(token), body.style.getPropertyPriority(token)] as const);
    const classes = ['desktop-visual-dialogs', 'desktop-visual-high-contrast', 'desktop-visual-solid'];
    const previousClasses = classes.map(value => [value, body.classList.contains(value)] as const);
    // Copy the same desktop tokens across portals; appearance classes change only at discrete state transitions.
    const syncSkin = () => {
      const computed = getComputedStyle(root);
      TOKENS.forEach(token => {
        const value = computed.getPropertyValue(token);
        if (body.style.getPropertyValue(token) !== value) body.style.setProperty(token, value);
      });
      body.classList.add('desktop-visual-dialogs');
      body.classList.toggle('desktop-visual-high-contrast', root.classList.contains('high-contrast'));
      body.classList.toggle('desktop-visual-solid', root.classList.contains('solid-surfaces'));
    };
    syncSkin();
    const skinned = new Map<Element, string[]>();
    const addSkin = (node: Element, className: string) => {
      if (node.classList.contains(className)) return;
      node.classList.add(className);
      skinned.set(node, [...(skinned.get(node) ?? []), className]);
    };
    const observer = new MutationObserver(records => {
      skinned.forEach((_values, node) => { if (!node.isConnected) skinned.delete(node); });
      records.forEach(record => record.addedNodes.forEach(node => { if (node instanceof Element) decorate(node); }));
    });
    // Upstream dialogs deliberately portal outside the transformed renderer; decorate only those windows.
    const decorate = (node: Element) => {
      const windows = node.matches('[data-folia-keyboard-window]') ? [node] : Array.from(node.querySelectorAll('[data-folia-keyboard-window]'));
      windows.forEach(window => {
        addSkin(window, 'desktop-visual-asset-dialog');
        const dialog = window.firstElementChild;
        if (!(dialog instanceof HTMLElement)) return;
        dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
        const title = dialog.querySelector('h2')?.textContent;
        if (title) dialog.setAttribute('aria-label', title);
        const close = Array.from(dialog.children).find(child => child instanceof HTMLButtonElement);
        if (close instanceof HTMLButtonElement) close.setAttribute('aria-label', closeLabel);
        observer.observe(window, { childList: true, subtree: true });
      });
      // Asset import menus stay inside their dialog and use the same skin as desktop selects.
      const menus = node.matches('[role="menu"]') ? [node] : Array.from(node.querySelectorAll('[role="menu"]'));
      menus.forEach(menu => {
        if (menu.closest('.desktop-visual-asset-dialog')) addSkin(menu, 'desktop-glass-menu');
      });
    };
    Array.from(body.children).forEach(decorate);
    observer.observe(body, { childList: true });
    const appearanceObserver = new MutationObserver(syncSkin);
    appearanceObserver.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => {
      observer.disconnect(); appearanceObserver.disconnect();
      previousClasses.forEach(([value, present]) => body.classList.toggle(value, present));
      skinned.forEach((values, node) => values.forEach(value => node.classList.remove(value)));
      previous.forEach(([token, value, priority]) => {
        if (value) body.style.setProperty(token, value, priority); else body.style.removeProperty(token);
      });
    };
  }, [panel, theme, closeLabel]);
}
