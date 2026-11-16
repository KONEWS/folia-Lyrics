import { useLayoutEffect, useState, type RefObject } from 'react';
import i18n from '../i18n/config';
import { normalizeSearchText } from '../utils/settingsSearchText';
import type { DesktopSettingsSearchRequest } from '../types/desktopSettingsSearch';
import { revealDesktopSettingsControl } from './useDesktopSettingsNavigation';

// src/desktopLyrics/useDesktopSettingsSearchNavigation.ts — reveal translated control labels after lazy or conditional panels mount.
const controls = 'input:not([type=hidden]):not([type=file]),button,select,textarea,[role=combobox],summary';
const labels = '[aria-label],[title],[placeholder],label,span,strong,div,button,summary,h3,h4,p';
const available = (element: HTMLElement) => !element.matches('input[type=file],input[type=hidden]')
  && !element.closest('[hidden],.hidden,[aria-hidden=true],[inert],.st-unfold:not([data-open])');
const firstControl = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>(controls))
  .find(element => available(element) && !element.matches(':disabled'));
function findLabel(root: HTMLElement, label: string): HTMLElement | undefined {
  const normalized = normalizeSearchText(label);
  const items = Array.from(root.querySelectorAll<HTMLElement>(labels)).filter(element => available(element) && !element.closest('.desktop-settings-search'));
  return items.find(element => normalizeSearchText(element.getAttribute('aria-label') ?? '') === normalized)
    ?? items.find(element => normalizeSearchText(element.getAttribute('title') ?? '') === normalized)
    ?? items.find(element => normalizeSearchText(element.getAttribute('placeholder') ?? '') === normalized)
    ?? items.find(element => element.id && normalizeSearchText(element.textContent ?? '') === normalized)
    ?? items.find(element => normalizeSearchText(element.textContent ?? '') === normalized
      && !Array.from(element.children).some(child => normalizeSearchText(child.textContent ?? '') === normalized))
    ?? items.find(element => normalizeSearchText(element.textContent ?? '').startsWith(`${normalized} `));
}
// Shared original panels often put a translated span next to the input instead of an HTML label.
function controlFor(label: HTMLElement, root: HTMLElement) {
  if (label.matches(controls) && !label.matches(':disabled')) return label;
  const named = label.id ? Array.from(root.querySelectorAll<HTMLElement>(controls)).find(element =>
    element.getAttribute('aria-labelledby')?.split(/\s+/).includes(label.id) && available(element) && !element.matches(':disabled')) : undefined;
  if (named) return named;
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
  const effect = heading?.closest<HTMLElement>('[data-beat-effect]');
  if (effect) return effect;
  const fieldset = heading?.closest<HTMLElement>('fieldset');
  if (fieldset) return fieldset;
  const group = heading?.parentElement;
  return group?.querySelector(controls) ? group : heading?.closest<HTMLElement>('fieldset,section,.desktop-visual-card') ?? root;
}
export function useDesktopSettingsSearchNavigation(panel: RefObject<HTMLElement | null>, request?: DesktopSettingsSearchRequest, renderedSection?: string, contentSelector?: string) {
  const [hint, setHint] = useState('');
  useLayoutEffect(() => {
    setHint('');
    const root = panel.current;
    if (!root || !request || renderedSection && renderedSection !== request.entry.section) return;
    const entry = request.entry;
    let highlighted: HTMLElement | undefined;
    let frame = 0;
    const expanded = new WeakSet<HTMLElement>();
    const reveal = () => {
      const content = contentSelector ? root.querySelector<HTMLElement>(contentSelector) : root;
      if (!content) return false;
      const area = contextRoot(content, entry.context);
      const target = entry.key === 'common.ui.sceneSeat' ? content.querySelector<HTMLElement>('[data-scene-seat]')
        : entry.section === 'main' ? content.querySelector<HTMLElement>(`[data-settings-target="${entry.key.slice(5)}"]`)
        : entry.background && entry.key === `background.${entry.background}` ? content.querySelector<HTMLElement>(`[data-background-settings="${entry.background}"]`)
        : entry.mode && entry.key === `visualizer.${entry.mode}` ? content.querySelector<HTMLElement>(`[data-visualizer-settings="${entry.mode}"]`) : null;
      let label = findLabel(area, entry.label) ?? (entry.key === 'main.manual-start' ? findLabel(area, '暂停计时') : undefined) ?? target;
      // A group's heading must not bypass the prerequisite for its hidden controls.
      if (entry.fallback && label?.matches('h3,h4,[data-settings-anchor]') && !target) label = null;
      const findPrerequisite = (value: string) => findLabel(area, value);
      const prerequisiteLabel = !label ? [entry.fallback, ...(entry.fallbacks ?? [])]
        .find(value => value && findPrerequisite(value)) : undefined;
      const prerequisite = prerequisiteLabel ? findPrerequisite(prerequisiteLabel) : undefined;
      // Original panels mount nested controls only after a disclosure opens. This does not toggle the effect itself.
      const disclosureArea = entry.context ? area : prerequisiteLabel ? contextRoot(content, prerequisiteLabel) : undefined;
      // Only an explicit option fieldset is a foldable settings group; comboboxes and note buttons are not prerequisites.
      const disclosure = !label && disclosureArea?.matches('fieldset')
        ? disclosureArea.querySelector<HTMLElement>('button[aria-expanded=false]:not([role=combobox])') : undefined;
      if (disclosure && !expanded.has(disclosure)) { expanded.add(disclosure); disclosure.click(); return false; }
      const found = label ?? prerequisite;
      if (!found) return false;
      const control = target && found === target ? firstControl(target) ?? target : controlFor(found, content);
      // A newly opened group can already contain its control while its height is still changing.
      for (let ancestor = control.parentElement; ancestor && ancestor !== root; ancestor = ancestor.parentElement) {
        if (ancestor.matches('.st-unfold') && ancestor.getAnimations().some(animation => animation.playState === 'running')) {
          schedule();
          return false;
        }
      }
      revealDesktopSettingsControl(root, control);
      highlighted = control;
      control.classList.add('desktop-settings-search-target');
      if (prerequisite) setHint(i18n.t('desktopLyrics.settingsSearch.prerequisite', { lng: 'zh-CN', label: entry.label, control: prerequisiteLabel }));
      return true;
    };
    // Defer clicks until the effect is committed; StrictMode can replay an effect before a toggle renders.
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; if (reveal()) observer.disconnect(); });
    };
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-open', 'aria-expanded'] });
    schedule();
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      frame = 0;
      if (highlighted) return;
      const content = contentSelector ? root.querySelector<HTMLElement>(contentSelector) ?? root : root;
      const group = entry.context ? contextRoot(content, entry.context) : content.querySelector<HTMLElement>('.desktop-visual-original-panel') ?? content;
      const control = firstControl(group) ?? group;
      revealDesktopSettingsControl(root, control);
      highlighted = control; control.classList.add('desktop-settings-search-target');
      setHint(i18n.t('desktopLyrics.settingsSearch.unavailable', { lng: 'zh-CN', label: entry.label }));
    }, 2500);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.clearTimeout(timeout); highlighted?.classList.remove('desktop-settings-search-target'); };
  }, [panel, request, renderedSection, contentSelector]);
  return hint;
}
