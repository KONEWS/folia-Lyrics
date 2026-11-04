// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { motionValue } from 'framer-motion';
import { expect, it, vi } from 'vitest';
import { useDesktopPreviewSource } from '@/desktopLyrics/visualFeatures/useDesktopPreviewSource';
import type { LivePreviewContent, LivePreviewSource } from '@/components/visualizer/preview/livePreviewFeed';
import type { AudioBands } from '@/types';

// The studio receives discrete desktop song changes without taking ownership of the player clock.
it('keeps a stable source, publishes song changes, and leaves playback signals untouched', async () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(document.createElement('div'));
    const currentTime = motionValue(12), audioPower = motionValue(0.2), playbackTime = motionValue(13);
    const audioBands = {} as AudioBands;
    const content: LivePreviewContent = { lines: [{ startTime: 10, endTime: 20, fullText: 'First', words: [] }], duration: 30, currentLineIndex: 0, seed: 'first' };
    let source!: LivePreviewSource;
    const Probe = ({ value }: { value: LivePreviewContent }) => {
        source = useDesktopPreviewSource(value, { currentTime, audioPower, audioBands }, playbackTime);
        return null;
    };
    try {
        await act(async () => root.render(React.createElement(Probe, { value: content })));
        const first = source, listener = vi.fn();
        const stop = source.subscribe(listener);
        const next = { ...content, seed: 'second', currentLineIndex: -1 };
        await act(async () => root.render(React.createElement(Probe, { value: next })));
        expect(source).toBe(first);
        expect(source.read()).toEqual(next);
        expect(listener).toHaveBeenCalledOnce();
        currentTime.set(14);
        expect(listener).toHaveBeenCalledOnce();
        expect(source.signals.currentTime).toBe(currentTime);
        expect(playbackTime.get()).toBe(13);
        stop();
        await act(async () => root.render(React.createElement(Probe, { value: { ...next, lines: [] } })));
        expect(source.read()).toBeNull();
        expect(listener).toHaveBeenCalledOnce();
    } finally {
        await act(async () => root.unmount());
    }
});
