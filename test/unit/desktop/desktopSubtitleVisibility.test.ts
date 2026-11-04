import { describe, expect, it } from 'vitest';
import { desktopSubtitleVisibility } from '../../../src/desktopLyrics/visualFeatures/desktopSubtitleVisibility';
import { resolveVisualizerSubtitleOverlayContent } from '../../../src/components/visualizer/VisualizerSubtitleOverlay';
import type { Line, SubtitleOverlayLayout } from '../../../src/types';

// The desktop translation switch must hide every bottom row and its upcoming-line fallback.
describe('desktop subtitle visibility', () => {
    const current = { fullText: 'Current', translation: 'Translation', words: [], startTime: 0, endTime: 4 } as Line;
    const next = { ...current, fullText: 'Next', startTime: 4, endTime: 8 };
    it.each<SubtitleOverlayLayout>(['translation', 'current', 'romanization', 'current+next', 'current+romanization+translation'])('hides the entire bottom group with layout %s when switched off', subtitleOverlayLayout => {
        const visibility = desktopSubtitleVisibility({ subtitleContentMode: 'none', hidePlayerTranslationSubtitle: false }, false);
        const content = resolveVisualizerSubtitleOverlayContent({ showText: true, activeLine: current, recentCompletedLine: null, nextLines: [next], subtitleOverlayLayout, ...visibility });
        expect(content.shouldRenderOverlay).toBe(false);
        expect(content.rows).toEqual([]);
        expect(content.upcomingLines).toEqual([]);
    });
    it('restores the saved rows when switched back on without changing settings', () => {
        const settings = { subtitleContentMode: 'both' as const, hidePlayerTranslationSubtitle: false };
        desktopSubtitleVisibility(settings, false);
        const content = resolveVisualizerSubtitleOverlayContent({ showText: true, activeLine: current, recentCompletedLine: null,
            nextLines: [next], subtitleOverlayLayout: 'current+next+translation', ...desktopSubtitleVisibility(settings, true) });
        expect(content.rows.map(row => row.text)).toEqual(['Current', 'Next', 'Translation']);
        expect(settings).toEqual({ subtitleContentMode: 'both', hidePlayerTranslationSubtitle: false });
    });
    it('does not clear an independent hidden-overlay choice when content is enabled', () => {
        expect(desktopSubtitleVisibility({ subtitleContentMode: 'both', hidePlayerTranslationSubtitle: true }, true))
            .toEqual({ showSubtitleTranslation: true, hideTranslationSubtitle: true, subtitleContentMode: 'both' });
    });
});
