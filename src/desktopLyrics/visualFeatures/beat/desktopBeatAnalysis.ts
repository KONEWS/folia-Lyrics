import { appDatabase } from '../../../services/appDatabase';
import { getCacheTableName, putCacheEntry, readCacheEntry, removeCacheEntry } from '../../../services/repositories/cacheRepository';
import { mergeBeatFxEvents } from '../../../services/beatFx/clock';
import { initializeDesktopAnalysisModels } from './desktopAnalysisModels';

// A user-selected whole song feeds the original models; only its hash, binding and analysis are kept.
export interface DesktopBeatBinding { key: string; name: string; duration: number }
export type DesktopBeatPhase = 'checking' | 'beats' | 'drums';
const PREFIX = 'desktop_beat_binding_v1:';
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
const digest = async (bytes: ArrayBuffer) => hex(await crypto.subtle.digest('SHA-256', bytes));
const bindingKey = async (identity: string) => PREFIX + await digest(new TextEncoder().encode(identity).buffer);
let activeDrumJob: object | null = null;

export const isDesktopBeatBinding = (value: unknown): value is DesktopBeatBinding => {
    if (!value || typeof value !== 'object') return false;
    const item = value as Partial<DesktopBeatBinding>;
    return typeof item.key === 'string' && /^desktop-audio:[a-f0-9]{64}$/.test(item.key)
        && typeof item.name === 'string' && item.name.length <= 1024
        && typeof item.duration === 'number' && Number.isFinite(item.duration) && item.duration > 0;
};

export const desktopAudioDurationMatches = (expected: number, actual: number) =>
    Number.isFinite(actual) && actual > 0 && (!Number.isFinite(expected) || expected <= 0 || Math.abs(expected - actual) <= Math.max(3, expected * 0.01));

export async function readDesktopBeatBinding(identity: string): Promise<DesktopBeatBinding | null> {
    if (!identity) return null;
    const value = await readCacheEntry<unknown>(await bindingKey(identity));
    return isDesktopBeatBinding(value) ? value : null;
}

export async function clearDesktopBeatBinding(identity: string) {
    if (identity) await removeCacheEntry(await bindingKey(identity));
}

export async function readDesktopBeatEvents(key: string) {
    const [{ readStoredBeatGrid }, { loadStoredDrumHits }] = await Promise.all([
        import('../../../services/analysis/beatGrid'), import('../../../services/analysis/drumHits'),
    ]);
    const grid = await readStoredBeatGrid(key);
    await loadStoredDrumHits(key);
    return { events: grid ? mergeBeatFxEvents(grid.beats, grid.downbeats, grid.accents) : [], trackScale: grid?.accents?.trackScale ?? 1 };
}

/** A cancelled selection may finish a GPU chunk, but can never bind itself to a later song. */
export async function analyseDesktopBeatFile(identity: string, duration: number, file: File, signal: AbortSignal,
    phase: (value: DesktopBeatPhase) => void): Promise<DesktopBeatBinding> {
    const check = () => signal.throwIfAborted();
    const report = (value: DesktopBeatPhase) => { check(); phase(value); check(); };
    check();
    if (!identity) throw new Error('desktopVisual.beatChooseSong');
    if (!file.size || file.size > 512 * 1024 * 1024) throw new Error('desktopVisual.beatAudioTooLarge');
    report('checking');
    const [{ decodeAtRate, toMidSide }, { BEAT_THIS_SAMPLE_RATE }] = await Promise.all([
        import('../../../services/analysis/trackAudio'), import('../../../services/analysis/beatThis'),
    ]);
    check();
    const bytes = await file.arrayBuffer(); check();
    const decoded = await decodeAtRate(bytes.slice(0), BEAT_THIS_SAMPLE_RATE); check();
    if (!decoded) throw new Error('desktopVisual.beatAudioUnsupported');
    if (!desktopAudioDurationMatches(duration, decoded.duration)) throw new Error('desktopVisual.beatDurationMismatch');
    const key = `desktop-audio:${await digest(bytes)}`; check();
    const models = await initializeDesktopAnalysisModels(); check();
    if (!models.beat_this || !models.htdemucs_gpu) throw new Error('desktopVisual.beatNoModels');
    const [{ probeBeatThisGpu }, { getTrackBeatGrid }, { loadTrackDrumHits, setWantedDrumTrack }] = await Promise.all([
        import('../../../services/analysis/beatThisGpu'), import('../../../services/analysis/beatGrid'), import('../../../services/analysis/drumHits'),
    ]);
    check();
    if (!await probeBeatThisGpu()) throw new Error('desktopVisual.beatNoGpu');
    report('beats');
    const grid = await getTrackBeatGrid(key, async () => { check(); return toMidSide(decoded).mid; }, { cpuFallback: false, urgency: 'onScreen' });
    check();
    if (!grid) throw new Error('desktopVisual.beatFailure');
    report('drums');
    const owner = {}; activeDrumJob = owner;
    const release = () => {
        if (activeDrumJob === owner) { activeDrumJob = null; setWantedDrumTrack(null); }
    };
    setWantedDrumTrack(key);
    signal.addEventListener('abort', release, { once: true });
    try {
        const drums = await loadTrackDrumHits(key, async () => { check(); return bytes.slice(0); });
        check();
        if (!drums) throw new Error('desktopVisual.beatFailure');
        const binding = { key, name: file.name.slice(0, 1024), duration: decoded.duration };
        const savedKey = await bindingKey(identity); check();
        // Abort during the IndexedDB write rolls back the binding, including when a replacement is queued.
        await appDatabase.transaction('rw', appDatabase.table(getCacheTableName(savedKey)), async () => {
            check(); await putCacheEntry(savedKey, binding); check();
        });
        check();
        console.info('[DesktopBeatFx] analysis saved', { key, beats: grid.beats.length, drumHits: drums.hits.times.length });
        return binding;
    } finally {
        signal.removeEventListener('abort', release);
        release();
    }
}
