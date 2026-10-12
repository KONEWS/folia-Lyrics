import zhCN from '../i18n/locales/zh-CN';
import { normalizeSearchText, splitWords } from '../components/command-palette/search/normalize';
import type { DesktopSettingsSearchEntry } from '../types/desktopSettingsSearch';
import { buildDesktopMainSearchEntries, DESKTOP_COMMON_SEARCH_KEYS, DESKTOP_SUBTITLE_SEARCH_KEYS } from './desktopSettingsSearchMain';
import { DESKTOP_BACKGROUND_SEARCH_CATALOG, DESKTOP_MODE_SEARCH_CATALOG, desktopVisualSearchCondition } from './desktopSettingsSearchVisual';

// src/desktopLyrics/desktopSettingsSearchIndex.ts — pure desktop search, independent of active panels and renderer imports.
const SECTION_WORDS = {
  main: ['设置', '主设置', '歌词设置', 'main', 'settings'],
  common: ['通用', '字体', '歌词样式', 'common', 'typography'],
  visualizer: ['歌词动画', '动画', '歌词样式', '参数', 'visualizer', 'animation'],
  subtitle: ['字幕', '翻译', '罗马音', 'subtitle', 'translation', 'romanization'],
  background: ['背景', '桌面背景', '背景设置', 'background', 'wallpaper'],
} as const;

function labelFor(key: string): string {
  let value: unknown = zhCN;
  for (const part of key.split('.')) value = value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined;
  return typeof value === 'string' ? value : key;
}

/** Index every destination before any lazily loaded settings panel is opened. */
export function buildDesktopSettingsSearchIndex(): DesktopSettingsSearchEntry[] {
  const entries = buildDesktopMainSearchEntries();
  const modeNames = new Map(DESKTOP_MODE_SEARCH_CATALOG.map(catalog => [catalog.mode, labelFor(catalog.labelKey)]));
  const backgroundNames = new Map(DESKTOP_BACKGROUND_SEARCH_CATALOG.map(catalog => [catalog.background, labelFor(catalog.labelKey)]));
  for (const section of ['common', 'subtitle'] as const) {
    for (const labelKey of section === 'common' ? DESKTOP_COMMON_SEARCH_KEYS : DESKTOP_SUBTITLE_SEARCH_KEYS) {
      const font = /fontFamily|fontFallback|fontWeight|customFontFamily/.test(labelKey);
      const fallback = labelKey === 'options.fontWeight' ? labelFor('options.fontWeightAuto')
        : section === 'subtitle' && font ? labelFor('options.subtitleFontInheritsLyrics') : undefined;
      const fallbacks = section === 'subtitle' && labelKey === 'options.fontWeight' ? [labelFor('options.subtitleFontInheritsLyrics')] : undefined;
      entries.push({ key: `${section}.${labelKey}`, label: labelFor(labelKey), section, keywords: [labelKey], fallback, fallbacks,
        breadcrumb: `歌词样式设置 · ${section === 'common' ? '通用' : '字幕'}` });
    }
  }
  entries.push({ key: 'background.enabled', label: labelFor('desktopVisual.originalBackground'), section: 'background', keywords: ['启用背景', '原版背景'] },
    { key: 'background.type', label: labelFor('options.visualizerBackgroundMode'), section: 'background', keywords: ['背景类型', '背景模式'] });
  for (const catalog of DESKTOP_MODE_SEARCH_CATALOG) {
    const modeLabel = labelFor(catalog.labelKey);
    const keywords = [modeLabel, catalog.mode, ...catalog.keys.filter(key => key.endsWith('Settings')).map(labelFor), ...SECTION_WORDS.visualizer];
    entries.push({ key: `visualizer.${catalog.mode}`, label: modeLabel, section: 'visualizer', mode: catalog.mode, keywords });
    for (const labelKey of catalog.keys) {
      const condition = desktopVisualSearchCondition(labelKey, catalog.mode);
      entries.push({ key: `visualizer.${catalog.mode}.${labelKey}`, label: labelFor(labelKey), section: 'visualizer', mode: catalog.mode,
        keywords: [...keywords, labelKey], fallback: condition.fallbackKey && labelFor(condition.fallbackKey), context: condition.contextKey && labelFor(condition.contextKey) });
    }
  }
  for (const catalog of DESKTOP_BACKGROUND_SEARCH_CATALOG) {
    const backgroundLabel = labelFor(catalog.labelKey);
    const keywords = [backgroundLabel, catalog.background, ...catalog.keys.filter(key => key.endsWith('Settings')).map(labelFor), ...SECTION_WORDS.background];
    entries.push({ key: `background.${catalog.background}`, label: backgroundLabel, section: 'background', background: catalog.background, keywords });
    for (const labelKey of catalog.keys) {
      const condition = desktopVisualSearchCondition(labelKey, undefined, catalog.background);
      entries.push({ key: `background.${catalog.background}.${labelKey}`, label: labelFor(labelKey), section: 'background', background: catalog.background,
        keywords: [...keywords, labelKey], fallback: condition.fallbackKey && labelFor(condition.fallbackKey), context: condition.contextKey && labelFor(condition.contextKey) });
    }
  }
  for (const group of ['Dithering', 'Mesh']) for (const labelKey of ['latentBaseSpeed', 'latentAudioSpeed'])
    entries.push({ key: `background.latent.${group}.${labelKey}`, label: labelFor(`options.${labelKey}`), section: 'background', background: 'latent',
      context: labelFor(`options.latent${group}Group`), keywords: ['latent', labelFor('options.visualizerBackgroundModeLatent'), labelFor(`options.latent${group}Group`)] });
  for (const effect of ['Glow', 'Soul', 'Gradient']) for (const labelKey of ['dioramaEffectStrength', 'dioramaCustomStrength'])
    entries.push({ key: `visualizer.diorama.${effect}.${labelKey}`, label: labelFor(`options.${labelKey}`), section: 'visualizer', mode: 'diorama',
      context: labelFor(`options.diorama${effect}Effect`),
      fallback: labelFor(labelKey === 'dioramaCustomStrength' ? 'options.dioramaEffectStrength' : `options.diorama${effect}Effect`),
      fallbacks: labelKey === 'dioramaCustomStrength' ? [labelFor(`options.diorama${effect}Effect`)] : undefined,
      keywords: ['diorama', labelFor(`options.diorama${effect}Effect`)] });
  // The generic strength rows are replaced by effect-scoped destinations above.
  const scoped = entries.filter(entry => !['visualizer.diorama.options.dioramaEffectStrength', 'visualizer.diorama.options.dioramaCustomStrength'].includes(entry.key));
  return scoped.map(entry => ({ ...entry,
    breadcrumb: entry.breadcrumb ?? ['歌词样式设置', entry.section === 'visualizer' ? '歌词动画' : '背景',
      entry.mode ? modeNames.get(entry.mode) : entry.background ? backgroundNames.get(entry.background) : undefined, entry.context].filter(Boolean).join(' · '),
    keywords: [...new Set([...SECTION_WORDS[entry.section], ...entry.keywords ?? []])] }));
}

/** Prefer a control's own name, then its aliases, while allowing multiword queries across its breadcrumb. */
export function searchDesktopSettings(index: readonly DesktopSettingsSearchEntry[], query: string): DesktopSettingsSearchEntry[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  const words = splitWords(normalized);
  return index.map((entry, order) => {
    const label = normalizeSearchText(entry.label);
    const aliases = [entry.breadcrumb ?? '', entry.context ?? '', ...entry.keywords ?? []].map(normalizeSearchText);
    const haystack = [label, ...aliases].join(' ');
    if (!words.every(word => haystack.includes(word))) return null;
    const score = label === normalized ? 0 : aliases.includes(normalized) ? 1 : label.startsWith(normalized) ? 2
      : label.includes(normalized) ? 3 : 4;
    return { entry, order, score };
  }).filter((hit): hit is { entry: DesktopSettingsSearchEntry; order: number; score: number } => hit !== null)
    .sort((a, b) => a.score - b.score || a.order - b.order).map(hit => hit.entry);
}
