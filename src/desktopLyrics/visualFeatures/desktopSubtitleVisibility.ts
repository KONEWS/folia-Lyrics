import type { SubtitleContentMode } from '../../types';

// The desktop translation switch hides the whole bottom subtitle group while preserving its settings.
export function desktopSubtitleVisibility(settings: {
    subtitleContentMode: SubtitleContentMode;
    hidePlayerTranslationSubtitle: boolean;
}, translated: boolean) {
    return {
        showSubtitleTranslation: translated,
        hideTranslationSubtitle: !translated || settings.hidePlayerTranslationSubtitle,
        subtitleContentMode: translated
            ? settings.subtitleContentMode === 'none' ? 'translation' as const : settings.subtitleContentMode
            : 'none' as const,
    };
}
