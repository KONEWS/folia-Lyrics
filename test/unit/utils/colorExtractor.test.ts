import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractColors, extractRepresentativeColors, extractThemeColorsFromPixels, loadImagePixels } from '../../../src/utils/colorExtractor';

import { hexToOklch, getHueDistance } from '../../../src/utils/themeColorMath';

// test/unit/utils/colorExtractor.test.ts — obsolete cover loads release image work before palette extraction.
class ImageStub {
    static instances: ImageStub[] = [];
    crossOrigin = '';
    src = '';
    onload: (() => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    removeAttribute = vi.fn((name: string) => { if (name === 'src') this.src = ''; });
    constructor() { ImageStub.instances.push(this); }
}
const pixels = new Uint8ClampedArray([20, 40, 60, 255, 20, 40, 60, 255]);
const drawImage = vi.fn(), getImageData = vi.fn(() => ({ data: pixels }));
const createElement = vi.fn(() => ({ width: 0, height: 0, getContext: () => ({ drawImage, getImageData }) }));

beforeEach(() => {
    ImageStub.instances = []; vi.clearAllMocks();
    vi.stubGlobal('Image', ImageStub); vi.stubGlobal('document', { createElement });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe.each([['representative', extractRepresentativeColors], ['vibrant', extractColors]] as const)('%s cover extraction cancellation', (_name, extract) => {
    it('does not create an image when the request was already cancelled', async () => {
        const controller = new AbortController(); controller.abort();
        expect(await extract('cover-a', 5, controller.signal)).toEqual([]);
        expect(ImageStub.instances).toHaveLength(0); expect(createElement).not.toHaveBeenCalled();
    });
    it('releases a pending load and prevents a late decode from allocating a canvas', async () => {
        const controller = new AbortController();
        const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
        const result = extract('cover-a', 5, controller.signal), image = ImageStub.instances[0];
        const lateLoad = image.onload!;
        controller.abort();
        expect(await result).toEqual([]); expect(image.removeAttribute).toHaveBeenCalledWith('src');
        expect(image.onload).toBeNull(); expect(image.onerror).toBeNull();
        expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
        lateLoad(); expect(createElement).not.toHaveBeenCalled();
    });
    it('keeps existing image extraction compatible and detaches cancellation on success', async () => {
        const controller = new AbortController(), removeListener = vi.spyOn(controller.signal, 'removeEventListener');
        const result = extract('cover-a', 5, controller.signal), image = ImageStub.instances[0];
        image.onload!();
        expect((await result).length).toBeGreaterThan(0); expect(drawImage).toHaveBeenCalledTimes(1);
        expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
        expect(image.onload).toBeNull(); expect(image.onerror).toBeNull();
        controller.abort(); expect(image.removeAttribute).not.toHaveBeenCalled();
    });
    it('skips palette work when cancelled immediately after decoding', async () => {
        const controller = new AbortController();
        const result = extract('cover-a', 5, controller.signal);
        ImageStub.instances[0].onload!(); controller.abort();
        expect(await result).toEqual([]); expect(drawImage).toHaveBeenCalledTimes(1);
    });
});

// The upstream wall's silent pixel read and the desktop's cancellation share one load lifecycle.
describe('shared image pixel options', () => {
    it('silences unreadable wall covers and releases their abort listener', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const controller = new AbortController(), removeListener = vi.spyOn(controller.signal, 'removeEventListener');
        getImageData.mockImplementationOnce(() => { throw new Error('tainted canvas'); });
        const result = loadImagePixels('wall-cover', { silent: true, signal: controller.signal });
        ImageStub.instances[0].onload!();
        expect(await result).toBeNull(); expect(warn).not.toHaveBeenCalled();
        expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
        expect(ImageStub.instances[0].onload).toBeNull();
        warn.mockRestore();
    });
    it('still reports ordinary image failures and resolves them once', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = loadImagePixels('unreadable-cover');
        const image = ImageStub.instances[0]; image.onerror!(new Event('error'));
        expect(await result).toBeNull(); expect(warn).toHaveBeenCalledOnce();
        expect(image.onerror).toBeNull(); expect(image.onload).toBeNull();
        warn.mockRestore();
    });
});

type Pixel = [number, number, number, number?];

const image = (...regions: Array<[Pixel, number]>) => new Uint8ClampedArray(
    regions.flatMap(([[r, g, b, a = 255], count]) => Array.from({ length: count }, () => [r, g, b, a]).flat()),
);

const oklchHue = (color: string) => hexToOklch(color)!.h;

describe('extractThemeColorsFromPixels', () => {
    it('leads with a large calm colour, not a tiny saturated sticker', () => {
        const colors = extractThemeColorsFromPixels(image(
            [[62, 92, 140], 1700], // muted blue sky, most of the cover
            [[236, 232, 224], 780], // paper-white border
            [[255, 0, 40], 20], // a small red logo
        ), 5);

        expect(getHueDistance(oklchHue(colors[0]), oklchHue('#3e5c8c'))).toBeLessThan(10);
        expect(colors.indexOf(colors.find(color => getHueDistance(oklchHue(color), oklchHue('#ff0028')) < 10) ?? '')).not.toBe(0);
    });

    it('returns the cover\'s second colour as a separate pick instead of shades of the first', () => {
        const colors = extractThemeColorsFromPixels(image(
            [[24, 120, 128], 1300],
            [[30, 132, 140], 200],
            [[226, 120, 52], 1000],
        ), 5);

        const hues = colors.slice(0, 2).map(oklchHue);
        expect(getHueDistance(hues[0], hues[1])).toBeGreaterThan(90);
    });

    it('still yields the greys of an all-grey cover', () => {
        const colors = extractThemeColorsFromPixels(image(
            [[40, 40, 42], 1800],
            [[180, 180, 178], 700],
        ), 5);

        expect(colors).toHaveLength(2);
        expect(colors.every(color => hexToOklch(color)!.C < 0.02)).toBe(true);
    });

    it('ignores transparent pixels and handles empty input', () => {
        expect(extractThemeColorsFromPixels(image([[255, 0, 0, 10], 50], [[20, 40, 60], 10]), 3)).toHaveLength(1);
        expect(extractThemeColorsFromPixels(new Uint8ClampedArray(), 3)).toEqual([]);
        expect(extractThemeColorsFromPixels(image([[20, 40, 60], 10]), 0)).toEqual([]);
    });
});
