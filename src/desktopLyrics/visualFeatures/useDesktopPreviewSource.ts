import { useLayoutEffect, useMemo, useRef } from 'react';
import type { LivePreviewContent, LivePreviewSource } from '../../components/visualizer/preview/livePreviewFeed';

// Bind the shared studio preview to desktop media-session data and its existing motion signals.
export function useDesktopPreviewSource(content: LivePreviewContent, signals: LivePreviewSource['signals'], playbackTime: LivePreviewSource['playbackTime']): LivePreviewSource {
    const snapshot = useMemo(() => content.lines.length ? content : null,
        [content.lines, content.duration, content.songTitle, content.coverUrl, content.currentLineIndex, content.seed]);
    const latest = useRef(snapshot);
    const listeners = useRef(new Set<() => void>());
    const source = useMemo<LivePreviewSource>(() => ({
        read: () => latest.current,
        subscribe: listener => { listeners.current.add(listener); return () => { listeners.current.delete(listener); }; },
        signals, playbackTime,
    }), [signals.currentTime, signals.audioPower, signals.audioBands, playbackTime]);
    useLayoutEffect(() => {
        latest.current = snapshot;
        listeners.current.forEach(listener => listener());
    }, [snapshot]);
    return source;
}
