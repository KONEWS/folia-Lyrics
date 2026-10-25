import { createContext } from 'react';
import type { MotionValue } from 'framer-motion';

// A host with its own player can drive the shared muted video without writing the app playback store.
export interface VideoLayerPlayback {
    clock: MotionValue<number>;
    playing: boolean;
    hidden?: boolean;
    suppressed?: boolean;
    localFileUrl: string | null;
    url: string | null;
    onError?: () => void;
}

export const VideoLayerPlaybackContext = createContext<VideoLayerPlayback | null>(null);
