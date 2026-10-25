import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appDatabase } from '@/services/appDatabase';
import { analyseDesktopBeatFile, clearDesktopBeatBinding, desktopAudioDurationMatches, isDesktopBeatBinding, readDesktopBeatBinding, readDesktopBeatEvents } from '@/desktopLyrics/visualFeatures/beat/desktopBeatAnalysis';
import { initializeDesktopAnalysisModels } from '@/desktopLyrics/visualFeatures/beat/desktopAnalysisModels';
import { decodeAtRate } from '@/services/analysis/trackAudio';
import { probeBeatThisGpu } from '@/services/analysis/beatThisGpu';
import { getTrackBeatGrid, readStoredBeatGrid } from '@/services/analysis/beatGrid';
import { loadStoredDrumHits, loadTrackDrumHits, setWantedDrumTrack } from '@/services/analysis/drumHits';

// Exercise cancellation with a real IndexedDB transaction while model computations stay deterministic.
vi.mock('@/desktopLyrics/visualFeatures/beat/desktopAnalysisModels', () => ({ initializeDesktopAnalysisModels: vi.fn() }));
vi.mock('@/services/analysis/trackAudio', () => ({ decodeAtRate: vi.fn(), toMidSide: () => ({ mid: new Float32Array(100) }) }));
vi.mock('@/services/analysis/beatThis', () => ({ BEAT_THIS_SAMPLE_RATE: 22050 }));
vi.mock('@/services/analysis/beatThisGpu', () => ({ probeBeatThisGpu: vi.fn() }));
vi.mock('@/services/analysis/beatGrid', () => ({ getTrackBeatGrid: vi.fn(), readStoredBeatGrid: vi.fn() }));
vi.mock('@/services/analysis/drumHits', () => ({ loadStoredDrumHits: vi.fn(), loadTrackDrumHits: vi.fn(), setWantedDrumTrack: vi.fn() }));

const file = () => new File([new Uint8Array([1, 2, 3, 4])], 'generated.wav', { type: 'audio/wav' });
const controller = () => new AbortController();
const run = (abort = controller(), identity = 'test-song') => analyseDesktopBeatFile(identity, 10, file(), abort.signal, vi.fn());
const grid = { beats: [1, 2], downbeats: [1] };
const drums = { hits: { times: new Float64Array([1]) } } as Awaited<ReturnType<typeof loadTrackDrumHits>>;

beforeEach(async () => {
    vi.clearAllMocks();
    await appDatabase.api_cache.clear();
    vi.mocked(initializeDesktopAnalysisModels).mockResolvedValue({ beat_this: true, htdemucs: false, htdemucs_gpu: true });
    vi.mocked(decodeAtRate).mockResolvedValue({ duration: 10 } as AudioBuffer);
    vi.mocked(probeBeatThisGpu).mockResolvedValue(true);
    vi.mocked(getTrackBeatGrid).mockResolvedValue(grid);
    vi.mocked(readStoredBeatGrid).mockResolvedValue(grid);
    vi.mocked(loadTrackDrumHits).mockResolvedValue(drums);
    vi.mocked(loadStoredDrumHits).mockResolvedValue(drums);
    vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('desktop audio validation', () => {
    it('checks finite duration and accepts only the whole-song tolerance', () => {
        expect(desktopAudioDurationMatches(100, 102)).toBe(true);
        expect(desktopAudioDurationMatches(100, 104)).toBe(false);
        expect(desktopAudioDurationMatches(0, 10)).toBe(true);
        expect(desktopAudioDurationMatches(10, Number.NaN)).toBe(false);
        expect(isDesktopBeatBinding({ key: 'desktop-audio:' + 'a'.repeat(64), name: 'x.wav', duration: 10 })).toBe(true);
        expect(isDesktopBeatBinding({ key: 'a-file-path', name: 'x.wav', duration: 10 })).toBe(false);
    });

    it('does no work for an already-cancelled selection', async () => {
        const abort = controller(); abort.abort();
        await expect(run(abort)).rejects.toMatchObject({ name: 'AbortError' });
        expect(initializeDesktopAnalysisModels).not.toHaveBeenCalled();
        expect(decodeAtRate).not.toHaveBeenCalled();
    });

    it('rejects a wrong song length before probing or loading a GPU', async () => {
        vi.mocked(decodeAtRate).mockResolvedValue({ duration: 20 } as AudioBuffer);
        await expect(run()).rejects.toThrow('beatDurationMismatch');
        expect(initializeDesktopAnalysisModels).not.toHaveBeenCalled();
        expect(probeBeatThisGpu).not.toHaveBeenCalled();
        expect(getTrackBeatGrid).not.toHaveBeenCalled();
    });

    it('rejects missing models and unavailable GPUs without starting an analysis', async () => {
        vi.mocked(initializeDesktopAnalysisModels).mockResolvedValueOnce({ beat_this: false, htdemucs: false, htdemucs_gpu: true });
        await expect(run()).rejects.toThrow('beatNoModels');
        expect(probeBeatThisGpu).not.toHaveBeenCalled();
        vi.mocked(probeBeatThisGpu).mockResolvedValueOnce(false);
        await expect(run()).rejects.toThrow('beatNoGpu');
        expect(getTrackBeatGrid).not.toHaveBeenCalled();
    });
});

describe('desktop analysis lifecycle', () => {
    it('binds by content hash after both models finish and clears only the binding', async () => {
        const saved = await run();
        expect(saved.key).toMatch(/^desktop-audio:[a-f0-9]{64}$/);
        expect(await readDesktopBeatBinding('test-song')).toEqual(saved);
        expect(await readDesktopBeatBinding('other-song')).toBeNull();
        expect(getTrackBeatGrid).toHaveBeenCalledWith(saved.key, expect.any(Function), { cpuFallback: false, urgency: 'onScreen' });
        expect(setWantedDrumTrack).toHaveBeenLastCalledWith(null);
        await clearDesktopBeatBinding('test-song');
        expect(await readDesktopBeatBinding('test-song')).toBeNull();
    });

    it('stops drum work immediately on cancellation and never saves that selection', async () => {
        let finish!: (value: typeof drums) => void;
        vi.mocked(loadTrackDrumHits).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const abort = controller(), pending = run(abort);
        const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        await vi.waitFor(() => expect(loadTrackDrumHits).toHaveBeenCalled());
        abort.abort();
        expect(setWantedDrumTrack).toHaveBeenLastCalledWith(null);
        finish(drums); await rejected;
        expect(await readDesktopBeatBinding('test-song')).toBeNull();
    });

    it('an older job finishing cannot cancel a replacement job', async () => {
        const finishes: Array<(value: typeof drums) => void> = [];
        vi.mocked(loadTrackDrumHits).mockImplementation(() => new Promise(resolve => { finishes.push(resolve); }));
        const oldAbort = controller(), old = run(oldAbort, 'old-song');
        const rejected = expect(old).rejects.toMatchObject({ name: 'AbortError' });
        await vi.waitFor(() => expect(finishes).toHaveLength(1));
        oldAbort.abort();
        const replacement = run(controller(), 'new-song');
        await vi.waitFor(() => expect(finishes).toHaveLength(2));
        const calls = vi.mocked(setWantedDrumTrack).mock.calls.length;
        finishes[0](drums); await rejected;
        expect(setWantedDrumTrack).toHaveBeenCalledTimes(calls);
        finishes[1](drums); await replacement;
        expect(await readDesktopBeatBinding('old-song')).toBeNull();
        expect(await readDesktopBeatBinding('new-song')).not.toBeNull();
    });

    it('rolls back the binding when cancellation happens during its IndexedDB write', async () => {
        const abort = controller();
        const duringWrite = () => { abort.abort(); };
        appDatabase.api_cache.hook('creating', duringWrite);
        try {
            await expect(run(abort)).rejects.toMatchObject({ name: 'AbortError' });
            expect(await readDesktopBeatBinding('test-song')).toBeNull();
        } finally {
            appDatabase.api_cache.hook('creating').unsubscribe(duringWrite);
        }
    });

    it('reads cached events and the model strength without starting either model', async () => {
        vi.mocked(readStoredBeatGrid).mockResolvedValue({ ...grid, accents: {
            v: 10, trackScale: 0.62, impact: [0.5, 0.8], low: [1, 0], mid: [0, 1], high: [0, 0], rhythmic: [1, 1], pulse: [1, 1],
        } });
        const result = await readDesktopBeatEvents('cached-track');
        expect(result.trackScale).toBe(0.62);
        expect(result.events).toHaveLength(2);
        expect(loadStoredDrumHits).toHaveBeenCalledWith('cached-track');
        expect(initializeDesktopAnalysisModels).not.toHaveBeenCalled();
        expect(probeBeatThisGpu).not.toHaveBeenCalled();
        expect(getTrackBeatGrid).not.toHaveBeenCalled();
        expect(loadTrackDrumHits).not.toHaveBeenCalled();
    });
});
