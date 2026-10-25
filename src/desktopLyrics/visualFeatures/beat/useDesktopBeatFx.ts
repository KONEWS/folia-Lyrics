import { useCallback, useEffect, useRef, useState } from 'react';
import type { MotionValue } from 'framer-motion';
import type { VisualizerMode } from '../../../types';
import { useVisualizerSettingsStore } from '../../../stores/useVisualizerSettingsStore';
import { liveBeatEffects, liveBeatEffectStrength } from '../../../components/visualizer/beatClockTargets';
import { resolveBeatEffectSetting } from '../../../services/beatFx/beatEffects';
import { beginBeatFxTrack, setBeatFxEvents, setBeatFxIntensities, setBeatFxLiveEffects, stopBeatFx, tickBeatFxAt } from '../../../services/beatFx/beatFxLive';
import { analyseDesktopBeatFile, clearDesktopBeatBinding, readDesktopBeatBinding, readDesktopBeatEvents, type DesktopBeatBinding, type DesktopBeatPhase } from './desktopBeatAnalysis';
import { initializeDesktopAnalysisModels } from './desktopAnalysisModels';

// Drives the original beat clock from external playback without inventing an internal audio player.
export function useDesktopBeatFx({ identity, duration, mode, clock, playing, staticMode }: {
    identity: string; duration: number; mode: VisualizerMode; clock: MotionValue<number>; playing: boolean; staticMode: boolean;
}) {
    const smartBeat = useVisualizerSettingsStore(state => state.smartBeat);
    const background = useVisualizerSettingsStore(state => state.visualizerBackgroundMode);
    const [storedBinding, setStoredBinding] = useState<{ identity: string; value: DesktopBeatBinding } | null>(null);
    const binding = storedBinding?.identity === identity ? storedBinding.value : null;
    const [phase, setPhase] = useState<DesktopBeatPhase | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const job = useRef<AbortController | null>(null);
    const generation = useRef(0);
    const cancel = useCallback(() => {
        job.current?.abort(); job.current = null;
        setPhase(null);
    }, []);
    useEffect(() => { void initializeDesktopAnalysisModels().catch(error => console.warn('[DesktopBeatFx] models unavailable', error)); }, []);
    useEffect(() => {
        const revision = ++generation.current;
        cancel(); setStoredBinding(null); setError(null); setLoading(Boolean(identity));
        void readDesktopBeatBinding(identity).then(saved => {
            if (generation.current === revision) { setStoredBinding(saved ? { identity, value: saved } : null); setLoading(false); }
        }).catch(error => {
            console.warn('[DesktopBeatFx] cannot read saved analysis', error);
            if (generation.current === revision) { setError('desktopVisual.beatCacheFailure'); setLoading(false); }
        });
        return () => { generation.current++; cancel(); };
    }, [identity, cancel]);
    useEffect(() => { if (smartBeat.mode !== 'on') cancel(); }, [smartBeat.mode, cancel]);

    const settings = { smartBeat, visualizerMode: mode, visualizerBackgroundMode: background };
    const strengths = staticMode ? {} : Object.fromEntries(liveBeatEffects(settings).map(effect => [effect.id, resolveBeatEffectSetting(smartBeat, effect.id).strength]));
    const effectKey = JSON.stringify(strengths);
    const beatStrength = staticMode ? 0 : liveBeatEffectStrength(settings, 'beats');
    const wanted = Object.keys(strengths).length > 0 && Boolean(identity);
    useEffect(() => {
        setBeatFxLiveEffects(JSON.parse(effectKey)); setBeatFxIntensities(beatStrength, beatStrength);
        return () => setBeatFxLiveEffects({});
    }, [effectKey, beatStrength]);
    useEffect(() => {
        let current = true;
        if (!wanted || !binding) { stopBeatFx(); return; }
        beginBeatFxTrack(binding.key);
        void readDesktopBeatEvents(binding.key).then(({ events, trackScale }) => {
            if (current) setBeatFxEvents(binding.key, events, events.length ? 'beat_this' : 'none', undefined, trackScale);
        }).catch(error => {
            console.warn('[DesktopBeatFx] cannot load beat events', error);
            if (current) setBeatFxEvents(binding.key, [], 'none');
        });
        return () => { current = false; stopBeatFx(); };
    }, [wanted, binding, identity]);
    useEffect(() => {
        if (!wanted || !binding) return;
        const step = () => tickBeatFxAt(playing && !document.hidden ? clock.get() : null);
        const unsubscribe = clock.on('change', step);
        document.addEventListener('visibilitychange', step); step();
        // Let envelopes settle after pausing; no permanent second frame loop and no React time state.
        let frame = 0;
        if (!playing) {
            const until = performance.now() + 1000;
            const settle = () => { step(); if (performance.now() < until) frame = requestAnimationFrame(settle); };
            frame = requestAnimationFrame(settle);
        }
        return () => { unsubscribe(); cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', step); };
    }, [wanted, binding, playing, clock]);
    const analyse = useCallback(async (file: File) => {
        if (useVisualizerSettingsStore.getState().smartBeat.mode !== 'on') return;
        cancel(); setError(null); setLoading(false);
        const revision = ++generation.current;
        const controller = new AbortController(); job.current = controller;
        try {
            const saved = await analyseDesktopBeatFile(identity, duration, file, controller.signal, value => {
                if (job.current === controller && generation.current === revision) setPhase(value);
            });
            if (!controller.signal.aborted && generation.current === revision) setStoredBinding({ identity, value: saved });
        } catch (error) {
            if (!controller.signal.aborted && generation.current === revision) {
                console.warn('[DesktopBeatFx] analysis failed', error);
                const key = error instanceof Error ? error.message : '';
                setError(key.startsWith('desktopVisual.beat') ? key : 'desktopVisual.beatFailure');
            }
        } finally {
            if (job.current === controller) { job.current = null; setPhase(null); }
        }
    }, [identity, duration, cancel]);
    const clear = useCallback(async () => {
        cancel(); setLoading(false); const revision = ++generation.current;
        try { await clearDesktopBeatBinding(identity); if (generation.current === revision) { setStoredBinding(null); setError(null); } }
        catch (error) { console.warn('[DesktopBeatFx] cannot clear binding', error); if (generation.current === revision) setError('desktopVisual.beatCacheFailure'); }
    }, [identity, cancel]);
    return { binding, phase, error, loading, canAnalyse: Boolean(identity) && smartBeat.mode === 'on', analyse, clear, cancel };
}
export type DesktopBeatController = ReturnType<typeof useDesktopBeatFx>;
