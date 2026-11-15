import { create } from 'zustand';
import { getStoredBoolean, getStoredString, setStoredBoolean, setStoredString } from './storagePrimitives';

// Muted local video presentation; the native desktop host owns file selection and persistence.
export type VideoLayerFit = 'cover' | 'contain';
export const VIDEO_LAYER_OPACITY_BOUNDS = { min: 0.1, max: 1 } as const;
const VIDEO_LAYER_OPACITY_DEFAULT = 0.6;
const VIDEO_LAYER_ENABLED_KEY = 'video_layer_enabled';
const VIDEO_LAYER_OPACITY_KEY = 'video_layer_opacity';
const VIDEO_LAYER_FIT_KEY = 'video_layer_fit';

export const clampVideoLayerOpacity = (value: number) => Number.isFinite(value)
    ? Math.max(VIDEO_LAYER_OPACITY_BOUNDS.min, Math.min(VIDEO_LAYER_OPACITY_BOUNDS.max, value))
    : VIDEO_LAYER_OPACITY_DEFAULT;

export type VideoLayerSettingsState = {
    videoLayerEnabled: boolean;
    videoLayerOpacity: number;
    videoLayerFit: VideoLayerFit;
    setVideoLayerEnabled: (enabled: boolean) => void;
    setVideoLayerOpacity: (opacity: number) => void;
    setVideoLayerFit: (fit: VideoLayerFit) => void;
};

export const useVideoLayerSettingsStore = create<VideoLayerSettingsState>(set => ({
    videoLayerEnabled: getStoredBoolean(VIDEO_LAYER_ENABLED_KEY, false),
    videoLayerOpacity: clampVideoLayerOpacity(Number(getStoredString(VIDEO_LAYER_OPACITY_KEY, String(VIDEO_LAYER_OPACITY_DEFAULT)))),
    videoLayerFit: getStoredString(VIDEO_LAYER_FIT_KEY, 'cover') === 'contain' ? 'contain' : 'cover',
    setVideoLayerEnabled: enabled => {
        set({ videoLayerEnabled: enabled });
        setStoredBoolean(VIDEO_LAYER_ENABLED_KEY, enabled);
    },
    setVideoLayerOpacity: opacity => {
        const normalized = clampVideoLayerOpacity(opacity);
        set({ videoLayerOpacity: normalized });
        setStoredString(VIDEO_LAYER_OPACITY_KEY, String(normalized));
    },
    setVideoLayerFit: fit => {
        set({ videoLayerFit: fit });
        setStoredString(VIDEO_LAYER_FIT_KEY, fit);
    },
}));
