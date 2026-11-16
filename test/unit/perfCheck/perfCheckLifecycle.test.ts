import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginPerfCheckSession } from '@/components/perfCheck/perfCheckSession';
import { PerfCheckCancelled, sampleFrames } from '@/components/perfCheck/perfCheckRunner';
import { createPerfCheckGpu } from '@/components/perfCheck/perfCheckGpu';

// Checks cancellation of frame sampling, ownership of analysis holds, and late local model reads.
const { holdGpuAnalysis, readAnalysisGpuWeights } = vi.hoisted(() => ({
    holdGpuAnalysis: vi.fn(),
    readAnalysisGpuWeights: vi.fn(),
}));
vi.mock('@/services/analysis/beatThisGpu', () => ({ holdGpuAnalysis, HTDEMUCS_GPU_SEGMENT: 172032, SEGMENT_ADVANCE_MS: 2925 }));
vi.mock('@/services/analysis/analysisModelHost', () => ({ hasAnalysisGpuWeights: () => true, readAnalysisGpuWeights }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.clearAllMocks(); });

describe('performance check lifecycle', () => {
    it('keeps a new session held when a cancelled StrictMode session finishes later', () => {
        const old = beginPerfCheckSession();
        old.dispose();
        const current = beginPerfCheckSession();
        old.finish();
        expect(holdGpuAnalysis.mock.calls).toEqual([[true], [false], [true]]);
        expect(old.controller.signal.aborted).toBe(true);
        current.dispose();
        current.finish();
        expect(holdGpuAnalysis.mock.calls).toEqual([[true], [false], [true], [false]]);
    });

    it('rejects an interrupted frame sample and cancels its RAF even if no frame arrives', async () => {
        vi.useFakeTimers();
        const cancelAnimationFrame = vi.fn();
        vi.stubGlobal('window', { requestAnimationFrame: vi.fn(() => 7), cancelAnimationFrame });
        const controller = new AbortController();
        const sample = sampleFrames(3500, controller.signal);
        const rejected = expect(sample).rejects.toBeInstanceOf(PerfCheckCancelled);
        controller.abort();
        await rejected;
        expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('never opens a GPU worker when the model read finishes after cancellation', async () => {
        let release!: (value: object) => void;
        readAnalysisGpuWeights.mockImplementation(() => new Promise(resolve => { release = resolve; }));
        const Worker = vi.fn();
        vi.stubGlobal('Worker', Worker);
        const controller = new AbortController();
        const gpu = createPerfCheckGpu(controller.signal);
        const sample = gpu.separate(new Float32Array(1), new Float32Array(1));
        controller.abort();
        release({ weights: new Uint8Array(4), manifest: {} });
        expect(await sample).toBe(false);
        expect(Worker).not.toHaveBeenCalled();
    });

    it('cancels the pending GPU sample, destroys its device and terminates its worker', async () => {
        vi.useFakeTimers();
        readAnalysisGpuWeights.mockResolvedValue({ weights: new Uint8Array(4), manifest: {} });
        class FakeWorker {
            static instance: FakeWorker;
            onmessage: ((event: { data: object }) => void) | null = null;
            onerror = null;
            terminate = vi.fn();
            messages: { kind: string; id: number }[] = [];
            constructor() { FakeWorker.instance = this; }
            postMessage(message: { kind: string; id: number }) {
                this.messages.push(message);
                if (message.kind === 'load' || message.kind === 'dispose') queueMicrotask(() => this.onmessage?.({ data: { id: message.id, result: true } }));
            }
        }
        vi.stubGlobal('Worker', FakeWorker);
        const controller = new AbortController();
        const gpu = createPerfCheckGpu(controller.signal);
        const sample = gpu.separate(new Float32Array(1), new Float32Array(1));
        for (let i = 0; i < 5; i += 1) await Promise.resolve();
        controller.abort();
        expect(await sample).toBe(false);
        await Promise.resolve();
        expect(FakeWorker.instance.messages.map(message => message.kind)).toEqual(['load', 'separate', 'dispose']);
        expect(FakeWorker.instance.terminate).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });
});
