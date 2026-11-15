import { afterEach, describe, expect, it, vi } from 'vitest';
import { revealDesktopSettingsControl } from '../../../src/desktopLyrics/useDesktopSettingsNavigation';

// Search scrolling must convert rendered window coordinates back to the scroll viewport's CSS pixels.
afterEach(() => vi.unstubAllGlobals());

describe('desktop settings search scrolling', () => {
    it.each([1, 0.94, 0.5])('reveals controls above and below the viewport at scale %s', scale => {
        vi.stubGlobal('HTMLDetailsElement', class {});
        for (const position of [30, 400]) {
            const viewport = {
                scrollTop: 100, clientTop: 2, offsetHeight: 200,
                getBoundingClientRect: () => ({ top: 40, height: 200 * scale }),
            } as unknown as HTMLElement;
            const focus = vi.fn();
            const control = {
                parentElement: viewport, matches: () => true, focus,
                getBoundingClientRect: () => ({ top: 40 + (position - 100) * scale }),
            } as unknown as HTMLElement;
            revealDesktopSettingsControl(viewport, control);
            expect(viewport.scrollTop).toBeCloseTo(position - viewport.clientTop - 12);
            expect(focus).toHaveBeenCalledWith({ preventScroll: true });
        }
    });
});
