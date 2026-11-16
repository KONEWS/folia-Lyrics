// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DEFAULT_MONET_BACKGROUND_TUNING, type MonetBackgroundTuning, type Theme } from '@/types';

// test/unit/visualizer/monetBackgroundLayer.test.ts
// When the Monet background asks for its picture. A picture of an image not shown yet (a new copy, a
// new song) is asked for at once, so it is made while the copy waits out the settle time; the
// picture shown is still the one asked for when that time is over. A new theme or setting for the
// image on screen waits the settle time, so a slider does not start a picture per step. A picture
// asked for is released once the inputs change, so one not begun by then is not made.

const released = vi.hoisted((): string[] => []);
const wantMonetBackgroundUrl = vi.hoisted(() => vi.fn((options: { coverUrl?: string | null; theme: { accentColor: string } }) => ({
    url: Promise.resolve(`picture-${options.theme.accentColor}`),
    release: () => {
        released.push(options.theme.accentColor);
    },
})));
vi.mock('@/components/visualizer/monet/monetBackgroundPipeline', () => ({
    wantMonetBackgroundUrl,
    getMonetBackgroundCacheKey: (options: unknown) => JSON.stringify(options),
    checkCanvasFilterSupport: () => true,
}));
vi.mock('@/hooks/useReducedMotionFor', () => ({ useReducedMotionFor: () => false }));

const { default: MonetBackgroundLayer } = await import('@/components/visualizer/backgrounds/monet/MonetBackgroundLayer');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const themeWith = (accentColor: string) => ({ backgroundColor: '#000000', primaryColor: '#ffffff', secondaryColor: '#888888', accentColor } as Theme);
const asked = () => wantMonetBackgroundUrl.mock.calls.map(([options]) => options.theme.accentColor);

let root: Root;
let host: HTMLDivElement;
const show = (accentColor: string, coverUrl = 'cover-a') => act(() => {
    root.render(React.createElement(MonetBackgroundLayer, { coverUrl, theme: themeWith(accentColor) }));
});
const wait = (ms: number) => act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
});
const driftAnimations: Array<{ element: HTMLElement; cancel: ReturnType<typeof vi.fn> }> = [];
const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
interface DriftOptions {
    transparentBackground?: boolean;
    coverUrl?: string | null;
    enabled?: boolean;
    staticMode?: boolean;
}
const showDrift = (backgroundLayout: MonetBackgroundTuning['backgroundLayout'], {
    transparentBackground = false,
    coverUrl = 'cover-a',
    enabled = true,
    staticMode = false,
}: DriftOptions = {}) => act(() => {
    root.render(React.createElement(MonetBackgroundLayer, {
        coverUrl,
        theme: themeWith('#ff0000'),
        tuning: { ...DEFAULT_MONET_BACKGROUND_TUNING, backgroundDriftEnabled: enabled, backgroundDriftStrength: 0.5, backgroundLayout },
        transparentBackground,
        staticMode,
    }));
});

beforeEach(() => {
    vi.useFakeTimers();
    wantMonetBackgroundUrl.mockClear();
    released.length = 0;
    driftAnimations.length = 0;
    Object.defineProperty(HTMLElement.prototype, 'animate', {
        configurable: true,
        value: function (this: HTMLElement) {
            const animation = { element: this, cancel: vi.fn() };
            driftAnimations.push(animation);
            return animation;
        },
    });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    if (originalAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
    else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    vi.useRealTimers();
});

describe('when the Monet background asks for its picture', () => {
    it('without a picture: at once, and again for the one it shows once the settle time is over', async () => {
        show('#ff0000');
        expect(asked()).toEqual(['#ff0000']);
        await wait(100);
        // A theme that arrives within the settle time is asked for at once as well, and is the one shown.
        show('#00ff00');
        expect(asked()).toEqual(['#ff0000', '#00ff00']);
        // The first one is no longer wanted.
        expect(released).toEqual(['#ff0000']);
        await wait(179);
        expect(asked()).toEqual(['#ff0000', '#00ff00']);
        await wait(1);
        expect(asked()).toEqual(['#ff0000', '#00ff00', '#00ff00']);
        expect(host.innerHTML).toContain('picture-#00ff00');
    });

    it('with a picture: a new theme only once the settle time is over', async () => {
        show('#ff0000');
        await wait(180);
        wantMonetBackgroundUrl.mockClear();
        show('#0000ff');
        await wait(179);
        expect(asked()).toEqual([]);
        await wait(1);
        expect(asked()).toEqual(['#0000ff']);
    });

    it('with a picture: a new image at once', async () => {
        show('#ff0000');
        await wait(180);
        wantMonetBackgroundUrl.mockClear();
        show('#ff0000', 'cover-b');
        expect(asked()).toEqual(['#ff0000']);
        await wait(180);
        expect(asked()).toEqual(['#ff0000', '#ff0000']);
        expect(wantMonetBackgroundUrl.mock.calls.map(([options]) => options.coverUrl)).toEqual(['cover-b', 'cover-b']);
    });

    it('moves the replacement drift wrapper when the background layout changes', () => {
        showDrift('full-overlay');
        const first = driftAnimations[0];
        expect(first.element.isConnected).toBe(true);

        showDrift('half-pane-gradient');
        expect(first.cancel).toHaveBeenCalledOnce();
        expect(driftAnimations).toHaveLength(2);
        expect(driftAnimations[1].element).not.toBe(first.element);
        expect(driftAnimations[1].element.isConnected).toBe(true);
    });

    it('stops drift on a transparent surface and restarts it when the image returns', () => {
        showDrift('full-overlay');
        const first = driftAnimations[0];

        showDrift('full-overlay', { transparentBackground: true });
        expect(first.cancel).toHaveBeenCalledOnce();
        expect(first.element.isConnected).toBe(false);
        expect(driftAnimations).toHaveLength(1);

        showDrift('full-overlay');
        expect(driftAnimations).toHaveLength(2);
        expect(driftAnimations[1].element.isConnected).toBe(true);
    });

    it('starts half-pane drift when the first cover arrives and keeps it through asynchronous painting', async () => {
        let resolvePicture!: (url: string) => void;
        const picture = new Promise<string>(resolve => { resolvePicture = resolve; });
        const pendingPicture = () => ({ url: picture, release: vi.fn() });
        showDrift('half-pane-gradient', { coverUrl: null });
        expect(driftAnimations).toHaveLength(0);

        wantMonetBackgroundUrl.mockImplementationOnce(pendingPicture).mockImplementationOnce(pendingPicture);
        showDrift('half-pane-gradient');
        expect(driftAnimations).toHaveLength(1);
        const first = driftAnimations[0];
        expect(first.element.isConnected).toBe(true);

        await wait(180);
        expect(host.innerHTML).not.toContain('picture-delayed');
        await act(async () => {
            resolvePicture('picture-delayed');
            await picture;
        });

        expect(host.innerHTML).toContain('picture-delayed');
        expect(driftAnimations).toHaveLength(1);
        expect(first.cancel).not.toHaveBeenCalled();
        expect(first.element.isConnected).toBe(true);
    });

    it.each<DriftOptions>([{ enabled: false }, { staticMode: true }])('stops drift while %j and restarts when resumed', options => {
        showDrift('half-pane-gradient');
        const first = driftAnimations[0];

        showDrift('half-pane-gradient', options);
        expect(first.cancel).toHaveBeenCalledOnce();
        expect(driftAnimations).toHaveLength(1);

        showDrift('half-pane-gradient');
        expect(driftAnimations).toHaveLength(2);
        expect(driftAnimations[1].element).toBe(first.element);
        expect(driftAnimations[1].element.isConnected).toBe(true);
    });
});
