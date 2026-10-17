import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractColors, extractRepresentativeColors } from '../../../src/utils/colorExtractor';

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
