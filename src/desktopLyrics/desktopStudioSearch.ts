import type { DesktopSettingsSearchEntry } from '../types/desktopSettingsSearch';

// Keep search keys stable while routing former overlay controls to the studio's existing tabs.
const FONT_KEYS = new Set([
    'options.fontFamily', 'desktopVisual.customFontFamily', 'options.chooseSystemFont', 'options.uploadCustomFont',
    'options.fontFallbackFamilies', 'options.fontWeightAuto', 'options.fontWeight', 'options.fontSize', 'options.visualizerOpacity',
]);

export function desktopStudioSearchEntry(entry: DesktopSettingsSearchEntry, labelFor: (key: string) => string): DesktopSettingsSearchEntry {
    const key = entry.key.slice(entry.key.indexOf('.') + 1);
    const section = entry.section === 'common' && !FONT_KEYS.has(key) ? 'global' : entry.section;
    const breadcrumb = entry.section === 'common' ? entry.breadcrumb?.replace(/ · 通用| · 字体/, ` · ${section === 'global' ? '全局' : '字体'}`) : entry.breadcrumb;
    if (entry.key === 'visualizer.desktopVisual.previewTitle') return {
        ...entry, section: 'common', breadcrumb: '歌词样式设置 · 字体', label: labelFor('options.previewText'), keywords: [...entry.keywords ?? [], entry.label],
    };
    const labels: Record<string, string> = {
        'subtitle.options.fontFamily': 'options.subtitleFontFamily',
        'subtitle.options.fontWeight': 'options.subtitleFontWeight',
        'subtitle.desktopVisual.harmonySubtitle': 'options.showHarmonySubtitle',
        'subtitle.desktopVisual.showTranslation': 'options.subtitleContentMode',
    };
    const fontPicker = ['desktopVisual.customFontFamily', 'options.fontFallbackFamilies', 'options.uploadCustomFont'].includes(key);
    return {
        ...entry, section, breadcrumb,
        label: labels[entry.key] ? labelFor(labels[entry.key]) : entry.label,
        keywords: labels[entry.key] ? [...entry.keywords ?? [], entry.label] : entry.keywords,
        fallback: fontPicker ? labelFor('options.chooseSystemFont') : entry.fallback,
        fallbacks: entry.section === 'subtitle' && fontPicker ? [labelFor('options.subtitleFontInheritsLyrics')] : entry.fallbacks,
    };
}
