import { afterEach, describe, expect, it, vi } from 'vitest';
import { METAPHOR_GLYPH_CELL, METAPHOR_GLYPH_EM, MetaphorGlyphSource } from '@/components/visualizer/metaphor/metaphorGlyphs';

// Keeps user-selected lyric weight consistent between layout measurement and the rasterized glyph atlas.

afterEach(() => vi.unstubAllGlobals());

describe('MetaphorGlyphSource font weight', () => {
    it.each([300, 700, 900])('measures and draws dense lyrics with the resolved %i weight', weight => {
        const measuredFonts: string[] = [];
        const drawnFonts: string[] = [];
        const context = {
            font: '',
            clearRect: vi.fn(),
            measureText: () => {
                measuredFonts.push(context.font);
                return { width: METAPHOR_GLYPH_EM };
            },
            fillText: () => drawnFonts.push(context.font),
            getImageData: () => ({ data: new Uint8ClampedArray(METAPHOR_GLYPH_CELL ** 2 * 4) }),
        };
        vi.stubGlobal('document', { createElement: () => ({ getContext: () => context }) });
        const glyphs = new MetaphorGlyphSource('Test Font', weight);

        for (const char of ['字', 'あ', '한', 'A']) {
            glyphs.measure(char);
            glyphs.cell(char);
        }

        expect(measuredFonts).toEqual(Array(4).fill(`${weight} ${METAPHOR_GLYPH_EM}px Test Font`));
        expect(drawnFonts).toEqual(measuredFonts);
    });
});
