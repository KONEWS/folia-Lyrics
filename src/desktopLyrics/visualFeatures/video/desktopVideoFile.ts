import { create } from 'zustand';
import { listen, send, isDesktop } from '../../bridge';
import { useVideoLayerSettingsStore } from '../../../stores/useVideoLayerSettingsStore';
import { isDesktopVideoFileSource } from './desktopVideoSources';

// Native file access is limited to the file chosen by the host; paths never arrive from the page.
export type DesktopVideoFile = {
    status: 'none' | 'ready' | 'missing';
    name: string | null;
    source: string | null;
    error?: string;
    picked?: boolean;
};
type State = DesktopVideoFile & { busy: boolean; playbackError: boolean };
export const useDesktopVideoFileStore = create<State>(() => ({ status: 'none', name: null, source: null, busy: false, playbackError: false }));

export function connectDesktopVideoFile() {
    if (!isDesktop()) return () => {};
    const unsubscribe = listen(message => {
        if (message.type !== 'videoLayerFile') return;
        const { data } = message;
        if (!['none', 'ready', 'missing'].includes(data.status)) return;
        // A native response may name only its opaque app resource, never an arbitrary URL or path.
        const source = isDesktopVideoFileSource(data.source) ? data.source : null;
        useDesktopVideoFileStore.setState({ ...data, source, busy: false, playbackError: false });
        if (data.picked && data.status === 'ready' && source) useVideoLayerSettingsStore.getState().setVideoLayerEnabled(true);
    });
    send('videoLayerRestore');
    return unsubscribe;
}

export function selectDesktopVideoFile() {
    useDesktopVideoFileStore.setState({ busy: true, error: undefined, playbackError: false });
    send('videoLayerSelect');
}

export function clearDesktopVideoFile() {
    useDesktopVideoFileStore.setState({ busy: true, error: undefined, playbackError: false });
    send('videoLayerClear');
}

export const reportDesktopVideoError = () => useDesktopVideoFileStore.setState({ playbackError: true });
