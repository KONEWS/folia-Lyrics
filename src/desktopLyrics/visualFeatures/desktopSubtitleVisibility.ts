import type { SubtitleContentMode } from '../../types';

// Subtitle content and the whole overlay are independent: no translation still permits the next line.
export function desktopSubtitleVisibility(settings: {
    subtitleContentMode: SubtitleContentMode;
    hidePlayerTranslationSubtitle: boolean;
}, translated: boolean) {
    return {
        showSubtitleTranslation: translated,
        hideTranslationSubtitle: settings.hidePlayerTranslationSubtitle,
        subtitleContentMode: translated
            ? settings.subtitleContentMode === 'none' ? 'translation' as const : settings.subtitleContentMode
            : 'none' as const,
    };
}
