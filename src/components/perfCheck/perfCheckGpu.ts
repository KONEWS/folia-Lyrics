import { hasAnalysisGpuWeights, readAnalysisGpuWeights, type AnalysisGpuModel } from '../../services/analysis/analysisModelHost';

// Runs synthetic performance samples in a disposable worker, isolated from the current song's analysis.
interface Reply { id: number; result?: unknown; bytes?: number; error?: string }

export function createPerfCheckGpu(signal: AbortSignal) {
    let worker: Worker | null = null;
    let nextId = 0;
    let disposed = false;
    let memoryBytes = 0;
    const pending = new Map<number, (reply: Reply) => void>();
    const loaded = new Map<AnalysisGpuModel, Promise<boolean>>();
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        const dying = worker;
        worker = null;
        for (const settle of pending.values()) settle({ id: -1, error: 'performance check ended' });
        pending.clear();
        if (dying) {
            const terminate = () => { clearTimeout(timer); dying.terminate(); };
            const timer = setTimeout(terminate, 250);
            dying.onmessage = event => { if ((event.data as Reply).id === -1) terminate(); };
            try { dying.postMessage({ id: -1, kind: 'dispose' }); }
            catch { terminate(); }
        }
        signal.removeEventListener('abort', dispose);
    };
    if (signal.aborted) disposed = true;
    else signal.addEventListener('abort', dispose, { once: true });
    const ask = (request: object, transfer: Transferable[] = []): Promise<Reply> => {
        if (disposed || signal.aborted) return Promise.resolve({ id: -1, error: 'performance check ended' });
        if (!worker) {
            try {
                worker = new Worker(new URL('../../workers/beatThisGpu.worker.ts', import.meta.url), { type: 'module' });
                worker.onmessage = (event: MessageEvent<Reply>) => {
                    const settle = pending.get(event.data.id);
                    pending.delete(event.data.id);
                    settle?.(event.data);
                };
                worker.onerror = error => {
                    console.warn('[PerfCheck] GPU worker failed', error);
                    dispose();
                };
            } catch (error) {
                console.warn('[PerfCheck] Cannot create GPU worker', error);
                dispose();
                return Promise.resolve({ id: -1, error: 'GPU worker unavailable' });
            }
        }
        const id = ++nextId;
        return new Promise(resolve => {
            pending.set(id, resolve);
            try { worker!.postMessage({ ...request, id }, transfer); }
            catch (error) {
                pending.delete(id);
                console.warn('[PerfCheck] GPU request failed', error);
                resolve({ id, error: 'GPU request failed' });
                dispose();
            }
        });
    };
    const load = (model: AnalysisGpuModel): Promise<boolean> => {
        if (disposed || signal.aborted || !hasAnalysisGpuWeights(model)) return Promise.resolve(false);
        let loading = loaded.get(model);
        if (!loading) {
            loading = (async () => {
                const found = await readAnalysisGpuWeights(model);
                if (!found || disposed || signal.aborted) return false;
                const reply = await ask({ kind: 'load', model, weights: found.weights, manifest: found.manifest }, [found.weights.buffer]);
                if (reply.error) { console.warn('[PerfCheck] GPU model unavailable', { model, error: reply.error }); return false; }
                memoryBytes += reply.bytes ?? 0;
                return true;
            })();
            loaded.set(model, loading);
        }
        return loading;
    };
    return {
        dispose,
        get memoryBytes() { return memoryBytes; },
        async separate(left: Float32Array, right: Float32Array): Promise<boolean> {
            if (!(await load('htdemucs'))) return false;
            const reply = await ask({ kind: 'separate', left, right });
            return !reply.error;
        },
        async beats(chunks: { data: Float32Array; frames: number }[]): Promise<boolean> {
            if (!(await load('beat_this'))) return false;
            const reply = await ask({ kind: 'run', model: 'beat_this', chunks: chunks.map(chunk => chunk.data) });
            return !reply.error;
        },
    };
}
