import { describe, expect, it } from 'vitest';
import { VIS_PLAYGROUND_PREVIEW_PLACEHOLDERS } from '@/components/visualizer/PreviewPlaceholder';

// The extracted originals and translations share one timeline, contained entirely inside a silent loop.
describe('lyric-only preview songs', () => {
    it.each(Object.values(VIS_PLAYGROUND_PREVIEW_PLACEHOLDERS))('keeps $title on a single valid lyric timeline', song => {
        expect(song.lines.length).toBeGreaterThan(0);
        expect(new Set(song.lines.map(line => line.startTime)).size).toBe(song.lines.length);
        expect(song.lines.some(line => Boolean(line.translation))).toBe(true);
        for (const line of song.lines) {
            expect(line.fullText.trim()).not.toBe('');
            expect(line.startTime).toBeGreaterThanOrEqual(0);
            expect(line.endTime).toBeGreaterThan(line.startTime);
            expect(line.endTime).toBeLessThan(song.loopDuration);
            for (const word of line.words) {
                expect(Number.isFinite(word.startTime) && Number.isFinite(word.endTime)).toBe(true);
                expect(word.startTime).toBeGreaterThanOrEqual(line.startTime);
                expect(word.endTime).toBeGreaterThanOrEqual(word.startTime);
                expect(word.endTime).toBeLessThanOrEqual(line.endTime);
            }
        }
    });
});
