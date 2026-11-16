import type { ScreenQuad } from '../definition';

// Native desktop scenes use the authorized local cover for lighting; window capture is unavailable.
export const sampleSurface = async (_box: HTMLElement, _quad: ScreenQuad, _width: number, _height: number): Promise<ImageBitmap | null> => null;
