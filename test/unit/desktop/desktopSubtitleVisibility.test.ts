import { describe, expect, it } from 'vitest';
import { desktopSubtitleVisibility } from '../../../src/desktopLyrics/visualFeatures/desktopSubtitleVisibility';
import { resolveVisualizerSubtitleOverlayContent } from '../../../src/components/visualizer/VisualizerSubtitleOverlay';
import type { Line } from '../../../src/types';

// Keep translation selection independent of the next-line preview and the user's overlay preference.
describe('desktop subtitle visibility', () => {
    const current = { fullText: 'Current', translation: 'Translation', words: [], startTime: 0, endTime: 4 } as Line;
    const next = { ...current, fullText: 'Next', startTime: 4, endTime: 8 };
    it('keeps the upcoming line when alternate text is switched off', () => {
        const visibility = desktopSubtitleVisibility({ subtitleContentMode: 'none', hidePlayerTranslationSubtitle: false }, false);
        const content = resolveVisualizerSubtitleOverlayContent({ showText: true, activeLine: current, recentCompletedLine: null, nextLines: [next], ...visibility });
        expect(content.shouldRenderOverlay).toBe(true);
        expect(content.subtitleTracks).toEqual([]);
        expect(content.upcomingLines).toEqual([next]);
    });
    it('does not clear an independent hidden-overlay choice when content is enabled', () => {
        expect(desktopSubtitleVisibility({ subtitleContentMode: 'both', hidePlayerTranslationSubtitle: true }, true))
            .toEqual({ showSubtitleTranslation: true, hideTranslationSubtitle: true, subtitleContentMode: 'both' });
    });
});
