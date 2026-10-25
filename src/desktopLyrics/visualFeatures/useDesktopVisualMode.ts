import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { VisualizerMode } from '../../types';
import { hasVisualizerMode } from '../../components/visualizer/registry';
import { useVisualizerSettingsStore } from '../../stores/useVisualizerSettingsStore';
import { getStoredString, setStoredString } from '../../stores/storagePrimitives';
import { resolveDesktopRandomMode } from './desktopRandomMode';

// Shares the original style store and random controls while retaining the desktop's published mode key.
export const DESKTOP_VISUAL_MODE_KEY = 'folia.desktop.mode.v1';

export function useDesktopVisualMode(songIdentity: string) {
    const selected = useVisualizerSettingsStore(state => state.visualizerMode);
    const enabled = useVisualizerSettingsStore(state => state.randomVisualizerModePerSong);
    const pool = useVisualizerSettingsStore(state => state.randomVisualizerModes);
    const [initialMode] = useState(() => {
        const saved = getStoredString(DESKTOP_VISUAL_MODE_KEY, 'classic');
        return hasVisualizerMode(saved) ? saved as VisualizerMode : 'classic';
    });
    const [ready, setReady] = useState(false);
    const hydrated = useRef(false);
    const previousSong = useRef<string | null>(null);
    useLayoutEffect(() => {
        if (!hydrated.current) {
            hydrated.current = true;
            useVisualizerSettingsStore.getState().handleSetVisualizerMode(initialMode, { notify: false, preserveRandom: true });
        }
        setReady(true);
        const persist = () => setStoredString(DESKTOP_VISUAL_MODE_KEY, useVisualizerSettingsStore.getState().visualizerMode);
        persist();
        return useVisualizerSettingsStore.subscribe((state, previous) => {
            if (state.visualizerMode !== previous.visualizerMode) persist();
        });
    }, [initialMode]);
    useEffect(() => {
        if (!ready) return;
        // Read the committed store during effect replay so StrictMode never draws a second style.
        const state = useVisualizerSettingsStore.getState();
        const next = resolveDesktopRandomMode({ previousSong: previousSong.current, song: songIdentity || null,
            enabled: state.randomVisualizerModePerSong, mode: state.visualizerMode, pool: state.randomVisualizerModes });
        previousSong.current = next.song;
        if (next.mode !== state.visualizerMode) state.handleSetVisualizerMode(next.mode, { notify: false, preserveRandom: true });
    }, [ready, songIdentity, enabled, pool, selected]);
    const changeMode = useCallback((mode: VisualizerMode) => {
        if (hasVisualizerMode(mode)) useVisualizerSettingsStore.getState().handleSetVisualizerMode(mode, { notify: false });
    }, []);
    return { mode: ready ? selected : initialMode, changeMode };
}
