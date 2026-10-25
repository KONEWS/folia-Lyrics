import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motionValue } from 'framer-motion';
import { useDesktopBeatFx, type DesktopBeatController } from '../../src/desktopLyrics/visualFeatures/beat/useDesktopBeatFx';
import { useVisualizerSettingsStore } from '../../src/stores/useVisualizerSettingsStore';
import { getBeatFxEvents, getBeatFxFiredCounts, getBeatFxHeard, isBeatFxReady } from '../../src/services/beatFx/beatFxLive';
import type { SmartBeatMode } from '../../src/types';

// A real hook mount for the manual browser probe, with an external playback MotionValue and no player.
export function mountDesktopBeatHook(identity: string, duration: number) {
    const element = document.createElement('div'); document.body.appendChild(element);
    const root = createRoot(element), clock = motionValue(0);
    let controller: DesktopBeatController | null = null;
    let changeIdentity: (value: string) => void = () => {};
    function Probe() {
        const [song, setSong] = useState(identity);
        changeIdentity = setSong;
        controller = useDesktopBeatFx({ identity: song, duration, mode: 'sonnet', clock, playing: true, staticMode: false });
        return null;
    }
    useVisualizerSettingsStore.getState().handleSetSmartBeat({ mode: 'cached' });
    root.render(<Probe/>);
    return {
        snapshot: () => ({ binding: controller?.binding, canAnalyse: controller?.canAnalyse, phase: controller?.phase,
            ready: isBeatFxReady(), eventCount: getBeatFxEvents().length, trackKey: getBeatFxHeard().key, counts: { ...getBeatFxFiredCounts() } }),
        setMode: (mode: SmartBeatMode) => useVisualizerSettingsStore.getState().handleSetSmartBeat({ mode }),
        setIdentity: (value: string) => changeIdentity(value),
        analyse: (file: File) => controller?.analyse(file),
        fireFirstBeat: () => {
            const event = getBeatFxEvents().find(candidate => candidate.t > 0.05);
            if (event) { clock.set(Math.max(0, event.t - 0.01)); clock.set(event.t + 0.01); }
        },
        unmount: () => { root.unmount(); clock.destroy(); element.remove(); },
    };
}
