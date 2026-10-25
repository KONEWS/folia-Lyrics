import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MotionValue } from 'framer-motion';
import { VideoLayerPlaybackContext } from '../../../components/visualizer/videoLayer/videoLayerPlayback';
import { useVideoLayerSettingsStore } from '../../../stores/useVideoLayerSettingsStore';
import { connectDesktopVideoFile, reportDesktopVideoError, useDesktopVideoFileStore } from './desktopVideoFile';
import { desktopVideoUrl } from './desktopVideoSources';

// Keep the desktop's video source and clock separate from Folia's built-in audio player.
export default function DesktopVideoPlayback({ clock, playing, transparent, children }: {
    clock: MotionValue<number>; playing: boolean; transparent: boolean; children: ReactNode;
}) {
    const source = useDesktopVideoFileStore(state => state.source);
    const url = useVideoLayerSettingsStore(state => state.videoLayerUrl);
    const [hidden, setHidden] = useState(() => document.hidden);
    useEffect(connectDesktopVideoFile, []);
    useEffect(() => {
        const update = () => setHidden(document.hidden);
        document.addEventListener('visibilitychange', update);
        return () => document.removeEventListener('visibilitychange', update);
    }, []);
    useEffect(() => { useDesktopVideoFileStore.setState({ playbackError: false }); }, [source, url]);
    const value = useMemo(() => ({ clock, playing, hidden, suppressed: transparent, localFileUrl: source, url: desktopVideoUrl(url), onError: reportDesktopVideoError }),
        [clock, playing, hidden, transparent, source, url]);
    return <VideoLayerPlaybackContext.Provider value={value}>{children}</VideoLayerPlaybackContext.Provider>;
}
