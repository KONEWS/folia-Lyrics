import { HTDEMUCS_GPU_SEGMENT, SEGMENT_ADVANCE_MS } from '../../services/analysis/beatThisGpu';
import { cancelUncappedAnimationFrame, requestUncappedAnimationFrame } from '../../utils/frameRateLimiter';
import { buildFixtureMel, buildFixtureSegment } from './perfCheckFixture';
import { createPerfCheckGpu } from './perfCheckGpu';
import {
    buildPerfCheckLadder, frameStats, medianOf, recommendStep, stepSmooth, targetIntervalMs,
} from './perfCheckPlan';
import type {
    PerfCheckInference, PerfCheckMemory, PerfCheckReport, PerfCheckSettings, PerfCheckStepResult,
} from './perfCheckTypes';

// src/components/perfCheck/perfCheckRunner.ts
// Runs the performance check in its window: the display's refresh first, then the analysis models
// loaded and measured once (their first runs profile the GPU, gpuSlices.ts), then every step of the
// settings ladder - the picture alone, then the picture with the GPU analysis running beside it, the
// way 智能动感 and automix run it - and memory. The window draws the lyric style; this only switches
// its settings (`apply`) and counts the frames it draws.

/** After a settings change, before measuring: a renderer rebuilt for antialiasing or a new size settles. */
const SETTLE_MS = 1200;
/** The picture alone, per step. */
const PICTURE_MS = 3500;
/** The picture beside the analysis, per step. */
const ANALYSIS_MS = 4500;
/** beat_this' chunk, frames: two of them are a minute of audio. */
const BEAT_CHUNK_FRAMES = 1500;

export type PerfCheckPhase = 'warmup' | 'picture' | 'analysis';

export interface PerfCheckProgress {
    /** The step being measured (0-based); -1 while warming up. */
    step: number;
    steps: number;
    phase: PerfCheckPhase;
    settings: PerfCheckSettings;
}

export class PerfCheckCancelled extends Error {
    constructor() {
        super('performance check cancelled');
    }
}

const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
        reject(new PerfCheckCancelled());
        return;
    }
    const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort);
        resolve();
    }, ms);
    const abort = () => {
        clearTimeout(timer);
        reject(new PerfCheckCancelled());
    };
    signal.addEventListener('abort', abort, { once: true });
});

/**
 * The intervals between the frames drawn over `ms`, through the window's own requestAnimationFrame -
 * the one the frame-rate cap gates (utils/frameRateLimiter.ts), so a capped step counts the frames the
 * picture really draws.
 */
export const sampleFrames = (ms: number, signal: AbortSignal, uncapped = false) => new Promise<number[]>((resolve, reject) => {
    const intervals: number[] = [];
    let last = 0;
    let handle = 0;
    const request = uncapped ? requestUncappedAnimationFrame : (callback: FrameRequestCallback) => window.requestAnimationFrame(callback);
    const cancel = uncapped ? cancelUncappedAnimationFrame : (id: number) => window.cancelAnimationFrame(id);
    const started = performance.now();
    const cleanup = () => { cancel(handle); clearTimeout(timeout); signal.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(new PerfCheckCancelled()); };
    const timeout = setTimeout(() => { cleanup(); reject(new Error('Performance check received no display frames')); }, ms + 10_000);
    const tick = (at: number) => {
        if (signal.aborted) { abort(); return; }
        if (last && at > last) intervals.push(at - last);
        last = at;
        if (at - started >= ms) { cleanup(); resolve(intervals); return; }
        handle = request(tick);
    };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    handle = request(tick);
});

/** The display's refresh from uncapped frames; no system, process or remote query is needed. */
const measureRefreshMs = async (signal: AbortSignal): Promise<number> => {
    const intervals = await sampleFrames(800, signal, true);
    if (!intervals.length) throw new Error('Performance check could not measure the display');
    return Math.min(...intervals);
};

/** Chromium's heap reading, MB; null where there is none. */
const heapMb = (): number | null => {
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    return memory ? memory.usedJSHeapSize / 1048576 : null;
};

export interface PerfCheckRun {
    current: PerfCheckSettings;
    /** Switches the drawn picture to these settings. */
    apply: (settings: PerfCheckSettings) => void;
    onProgress: (progress: PerfCheckProgress) => void;
    signal: AbortSignal;
}

/** What 'auto' anti-aliasing is for the reference style: 凝彩 leaves it to its post-processing (on by default). */
const REFERENCE_AUTO_ANTIALIAS = false;

/** Runs the whole check; rejects with PerfCheckCancelled when `signal` aborts. */
export const runPerfCheck = async ({ current, apply, onProgress, signal }: PerfCheckRun): Promise<PerfCheckReport> => {
    const gpu = createPerfCheckGpu(signal);
    try {
        const refreshMs = await measureRefreshMs(signal);
        const ladder = buildPerfCheckLadder(current, { refreshMs, autoAntialias: REFERENCE_AUTO_ANTIALIAS });
        const segment = buildFixtureSegment(HTDEMUCS_GPU_SEGMENT);
        const mel = buildFixtureMel(BEAT_CHUNK_FRAMES);
        const chunks = [{ data: mel, frames: BEAT_CHUNK_FRAMES }, { data: mel, frames: BEAT_CHUNK_FRAMES }];
        const separate = () => gpu.separate(segment.left, segment.right);
        const beats = () => gpu.beats(chunks);

        apply(ladder[0].settings);
        onProgress({ step: -1, steps: ladder.length, phase: 'warmup', settings: ladder[0].settings });
        await wait(SETTLE_MS, signal);
        // Loads both models and lets their first runs measure the GPU (gpuSlices.ts): not counted.
        let gpuAnalysis = (await separate());
        if (gpuAnalysis) gpuAnalysis = (await separate()) && (await separate());
        await beats();
        await beats();

        const memory: PerfCheckMemory = { appMb: null, gpuProcessMb: null, heapMb: null, modelsMb: 0 };
        const readMemory = async () => {
            const heap = heapMb();
            if (heap !== null) memory.heapMb = Math.max(memory.heapMb ?? 0, heap);
            memory.modelsMb = Math.max(memory.modelsMb, gpu.memoryBytes / 1048576);
        };

        const steps: PerfCheckStepResult[] = [];
        for (const [index, { settings, changes }] of ladder.entries()) {
            if (signal.aborted) throw new PerfCheckCancelled();
            apply(settings);
            onProgress({ step: index, steps: ladder.length, phase: 'picture', settings });
            await wait(SETTLE_MS, signal);
            const target = targetIntervalMs(settings.frameRate, refreshMs);
            const picture = frameStats(await sampleFrames(PICTURE_MS, signal), target);

            onProgress({ step: index, steps: ladder.length, phase: 'analysis', settings });
            const segmentTimes: number[] = [];
            let beatsMs: number | null = null;
            // Ends the separation loop once the frames are counted: the segment under way finishes first.
            const stop = new AbortController();
            const separateOne = async () => {
                const at = performance.now();
                if (!(await separate())) return false;
                segmentTimes.push(performance.now() - at);
                return true;
            };
            // One segment first, whatever the time: on a slow GPU beat_this alone can outlast the stretch.
            const analysis = (async () => {
                const separating = gpuAnalysis && await separateOne();
                const started = performance.now();
                beatsMs = (await beats()) ? performance.now() - started : null;
                while (separating && !stop.signal.aborted && !signal.aborted) {
                    if (!(await separateOne())) break;
                }
            })();
            let intervals: number[];
            try {
                intervals = await sampleFrames(ANALYSIS_MS, signal);
            } finally {
                stop.abort();
                await analysis;
            }
            await readMemory();
            const segmentMs = medianOf(segmentTimes);
            // A separation that runs here but failed this step reads as falling behind, not as not running.
            const inference: PerfCheckInference = {
                segmentMs,
                realtime: segmentMs ? SEGMENT_ADVANCE_MS / segmentMs : gpuAnalysis ? 0 : null,
                beatsMs,
            };
            const withAnalysis = frameStats(intervals, target);
            steps.push({ settings, changes, picture, withAnalysis, inference, smooth: stepSmooth(withAnalysis, inference) });
        }
        return { steps, memory, refreshHz: 1000 / refreshMs, recommended: recommendStep(steps), gpuAnalysis };
    } finally { gpu.dispose(); }
};
