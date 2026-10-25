import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Native font responses are shared, correlated and cleaned up before a failed picker is opened again.
const bridge = vi.hoisted(() => ({ native: true, send: vi.fn(), subscribers: new Set<(message: unknown) => void>(), removals: vi.fn() }));
vi.mock('../../../src/desktopLyrics/bridge', () => ({
    isDesktop: () => bridge.native,
    send: bridge.send,
    listen: (subscriber: (message: unknown) => void) => {
        bridge.subscribers.add(subscriber);
        return () => { bridge.subscribers.delete(subscriber); bridge.removals(); };
    },
}));
vi.mock('../../../src/i18n/config', () => ({ default: { t: (key: string) => key } }));

const reply = (data: object) => bridge.subscribers.forEach(subscriber => subscriber({ type: 'systemFonts', data }));
const currentRequest = () => bridge.send.mock.lastCall?.[1] as { requestId: string };
beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    bridge.native = true;
    bridge.send.mockReset();
    bridge.removals.mockClear();
    bridge.subscribers.clear();
    vi.stubGlobal('window', {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('desktop system font enumeration', () => {
    it('shares native requests and accepts only the matching response', async () => {
        const { loadDesktopSystemFonts } = await import('../../../src/desktopLyrics/visualFeatures/desktopSystemFonts');
        const first = loadDesktopSystemFonts();
        expect(loadDesktopSystemFonts()).toBe(first);
        expect(bridge.send).toHaveBeenCalledTimes(1);
        reply({ requestId: 'another-request', families: ['Unrelated'] });
        expect(bridge.subscribers.size).toBe(1);
        reply({ ...currentRequest(), families: ['Segoe UI', 'Microsoft YaHei'] });
        await expect(first).resolves.toEqual([{ family: 'Segoe UI' }, { family: 'Microsoft YaHei' }]);
        expect(bridge.subscribers.size).toBe(0);
        expect(bridge.removals).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
        await expect(loadDesktopSystemFonts()).resolves.toHaveLength(2);
        expect(bridge.send).toHaveBeenCalledTimes(1);
    });

    it('releases a failed or malformed response and allows another attempt', async () => {
        const { loadDesktopSystemFonts } = await import('../../../src/desktopLyrics/visualFeatures/desktopSystemFonts');
        const first = loadDesktopSystemFonts();
        const rejected = expect(first).rejects.toThrow('options.systemFontPermissionDenied');
        reply({ ...currentRequest(), families: [42] });
        await rejected;
        expect(bridge.subscribers.size).toBe(0);
        const retry = loadDesktopSystemFonts();
        expect(bridge.send).toHaveBeenCalledTimes(2);
        reply({ ...currentRequest(), families: ['SimSun'] });
        await expect(retry).resolves.toEqual([{ family: 'SimSun' }]);
    });

    it('times out a missing host reply and clears the listener before retry', async () => {
        const { loadDesktopSystemFonts } = await import('../../../src/desktopLyrics/visualFeatures/desktopSystemFonts');
        const pending = loadDesktopSystemFonts();
        const rejected = expect(pending).rejects.toThrow('options.systemFontPermissionDenied');
        await vi.advanceTimersByTimeAsync(10_000);
        await rejected;
        expect(bridge.subscribers.size).toBe(0);
        const retry = loadDesktopSystemFonts();
        reply({ ...currentRequest(), families: [] });
        await expect(retry).resolves.toEqual([]);
    });

    it('uses browser enumeration only outside the native host', async () => {
        bridge.native = false;
        const query = vi.fn().mockResolvedValue([{ family: 'Browser font' }]);
        vi.stubGlobal('window', { queryLocalFonts: query });
        const { loadDesktopSystemFonts } = await import('../../../src/desktopLyrics/visualFeatures/desktopSystemFonts');
        await expect(loadDesktopSystemFonts()).resolves.toEqual([{ family: 'Browser font' }]);
        expect(query).toHaveBeenCalledTimes(1);
        expect(bridge.send).not.toHaveBeenCalled();
    });
});
