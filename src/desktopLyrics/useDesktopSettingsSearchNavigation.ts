import { useLayoutEffect, useState, type RefObject } from 'react';
import i18n from '../i18n/config';
import { normalizeSearchText } from '../components/command-palette/search/normalize';
import type { DesktopSettingsSearchRequest } from '../types/desktopSettingsSearch';
import { revealDesktopSettingsControl } from './useDesktopSettingsNavigation';

// src/desktopLyrics/useDesktopSettingsSearchNavigation.ts — reveal translated control labels after lazy or conditional panels mount.
const controls = 'input:not([type=hidden]):not([type=file]),button,select,textarea,[role=combobox],summary';
const labels = '[aria-label],[title],[placeholder],label,span,strong,div,button,summary,h3,h4,p';
const available = (element: HTMLElement) => !element.matches('input[type=file],input[type=hidden]')
  && !element.closest('[hidden],.hidden,[aria-hidden=true]');
const firstControl = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>(controls))
  .find(element => available(element) && !element.matches(':disabled'));
function findLabel(root: HTMLElement, label: string): HTMLElement | undefined {
  const normalized = normalizeSearchText(label);
  const items = Array.from(root.querySelectorAll<HTMLElement>(labels)).filter(element => available(element) && !element.closest('.desktop-settings-search'));
  return items.find(element => normalizeSearchText(element.getAttribute('aria-label') ?? '') === normalized)
    ?? items.find(element => normalizeSearchText(element.getAttribute('title') ?? '') === normalized)
    ?? items.find(element => normalizeSearchText(element.getAttribute('placeholder') ?? '') === normalized)
    ?? items.find(element => normalizeSearchText(element.textContent ?? '') === normalized)
    ?? items.find(element => normalizeSearchText(element.textContent ?? '').startsWith(`${normalized} `));
}
// Shared original panels often put a translated span next to the input instead of an HTML label.
function controlFor(label: HTMLElement, root: HTMLElement) {
  if (label.matches(controls) && !label.matches(':disabled')) return label;
  for (let parent: HTMLElement | null = label; parent && parent !== root; parent = parent.parentElement) {
    const input = firstControl(parent);
    if (input) return input;
    if (parent.querySelector(controls)) return parent;
    const sibling = parent.nextElementSibling;
    if (sibling instanceof HTMLElement && available(sibling)) {
      if (sibling.matches(controls) && !sibling.matches(':disabled')) return sibling;
      const adjacent = firstControl(sibling);
      if (adjacent) return adjacent;
    }
  }
  return label;
}
function contextRoot(root: HTMLElement, context?: string) {
  if (!context) return root;
  const heading = findLabel(root, context);
  const fieldset = heading?.closest<HTMLElement>('fieldset');
  if (fieldset) return fieldset;
  const group = heading?.parentElement;
  return group?.querySelector(controls) ? group : heading?.closest<HTMLElement>('fieldset,section,.desktop-visual-card') ?? root;
}
export function useDesktopSettingsSearchNavigation(panel: RefObject<HTMLElement | null>, request?: DesktopSettingsSearchRequest, renderedSection?: string) {
  const [hint, setHint] = useState('');
  useLayoutEffect(() => {
    setHint('');
    const root = panel.current;
    if (!root || !request || renderedSection && renderedSection !== request.entry.section) return;
    const entry = request.entry;
    let highlighted: HTMLElement | undefined;
    const expanded = new WeakSet<HTMLElement>();
    const reveal = () => {
      const area = contextRoot(root, entry.context);
      const target = entry.section === 'main' ? root.querySelector<HTMLElement>(`[data-settings-target="${entry.key.slice(5)}"]`)
        : entry.background && entry.key === `background.${entry.background}` ? root.querySelector<HTMLElement>(`[data-background-settings="${entry.background}"]`) : null;
      const label = findLabel(area, entry.label) ?? (entry.key === 'main.manual-start' ? findLabel(area, '暂停计时') : undefined) ?? target;
      const findPrerequisite = (value: string) => findLabel(area, value);
      const prerequisiteLabel = !label ? [entry.fallback, ...(entry.fallbacks ?? [])]
        .find(value => value && findPrerequisite(value)) : undefined;
      const prerequisite = prerequisiteLabel ? findPrerequisite(prerequisiteLabel) : undefined;
      // Original panels mount nested controls only after a disclosure opens. This does not toggle the effect itself.
      const disclosureArea = entry.context ? area : prerequisiteLabel ? contextRoot(root, prerequisiteLabel) : undefined;
      const disclosure = !label ? disclosureArea?.querySelector<HTMLElement>('button[aria-expanded=false][aria-controls]') : undefined;
      if (disclosure && !expanded.has(disclosure)) { expanded.add(disclosure); disclosure.click(); return false; }
      const found = label ?? prerequisite;
      if (!found) return false;
      const control = target && found === target ? firstControl(target) ?? target : controlFor(found, root);
      revealDesktopSettingsControl(root, control);
      highlighted = control;
      control.classList.add('desktop-settings-search-target');
      if (prerequisite) setHint(i18n.t('desktopLyrics.settingsSearch.prerequisite', { lng: 'zh-CN', label: entry.label, control: prerequisiteLabel }));
      return true;
    };
    // Observe only the settings surface while this request waits; stop as soon as its controls exist.
    const observer = new MutationObserver(() => { if (reveal()) observer.disconnect(); });
    if (!reveal()) observer.observe(root, { childList: true, subtree: true });
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      if (highlighted) return;
      const group = entry.context ? contextRoot(root, entry.context) : root.querySelector<HTMLElement>('.desktop-visual-original-panel') ?? root;
      const control = firstControl(group) ?? group;
      revealDesktopSettingsControl(root, control);
      highlighted = control; control.classList.add('desktop-settings-search-target');
      setHint(i18n.t('desktopLyrics.settingsSearch.unavailable', { lng: 'zh-CN', label: entry.label }));
    }, 2500);
    return () => { observer.disconnect(); window.clearTimeout(timeout); highlighted?.classList.remove('desktop-settings-search-target'); };
  }, [panel, request, renderedSection]);
  return hint;
}
