import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDesktopAnalysisModelHost, DESKTOP_ANALYSIS_MODELS, unpackDesktopAnalysisModel, verifyDesktopAnalysisModel } from '@/desktopLyrics/visualFeatures/beat/desktopAnalysisModels';
import { getAnalysisModelHost, hasAnalysisGpuWeights, readAnalysisGpuWeights, setAnalysisModelHost, type AnalysisModelHost } from '@/services/analysis/analysisModelHost';
import { modelsPresent, refreshModelAvailability, type AutomixModelsPresent } from '@/services/analysis/modelAvailability';

// Packed weights and lazy availability are checked independently of the browser GPU runtime.
const packedModel = (declaredBytes = 4): Uint8Array<ArrayBuffer> => {
    const metadata = new TextEncoder().encode(JSON.stringify({ bytes: declaredBytes, tensors: [] }));
    const packed = new Uint8Array(4 + metadata.length + 16);
    packed.set([1, 2, 3, 4]);
    packed.set(metadata, 4);
    packed.set(new TextEncoder().encode('FOLIABTW'), packed.length - 16);
    new DataView(packed.buffer).setBigUint64(packed.length - 8, 4n, true);
    return packed;
};
const descriptor = (bytes: Uint8Array) => ({ file: 'test.bin', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });

afterEach(() => {
    setAnalysisModelHost(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('desktop packed analysis weights', () => {
    it('verifies the complete export and exposes only the tensor bytes', async () => {
        const bytes = packedModel();
        const unpacked = await verifyDesktopAnalysisModel(bytes, descriptor(bytes));
        expect(Array.from(unpacked.weights)).toEqual([1, 2, 3, 4]);
        expect(unpacked.manifest).toEqual({ bytes: 4, tensors: [] });
        expect(unpacked.weights.buffer).toBe(bytes.buffer);
    });

    it('rejects truncated and modified exports before exposing tensors', async () => {
        const bytes = packedModel(), expected = descriptor(bytes);
        await expect(verifyDesktopAnalysisModel(bytes.subarray(1), expected)).rejects.toThrow('expected');
        bytes[0] ^= 1;
        await expect(verifyDesktopAnalysisModel(bytes, expected)).rejects.toThrow('SHA-256');
    });

    it('rejects invalid trailers, offsets and declared tensor lengths', () => {
        const wrongMagic = packedModel();
        wrongMagic[wrongMagic.length - 16] = 0;
        expect(() => unpackDesktopAnalysisModel(wrongMagic)).toThrow('FOLIABTW');
        const wrongOffset = packedModel();
        new DataView(wrongOffset.buffer).setBigUint64(wrongOffset.length - 8, BigInt(wrongOffset.length), true);
        expect(() => unpackDesktopAnalysisModel(wrongOffset)).toThrow('outside');
        expect(() => unpackDesktopAnalysisModel(packedModel(5))).toThrow('tensor length');
    });
});

describe('desktop model availability', () => {
    it('uses HEAD without reading model bodies and reports GPU stems separately from CPU stems', async () => {
        const request = vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
            expect(options).toMatchObject({ method: 'HEAD', mode: 'same-origin', redirect: 'error' });
            const model = DESKTOP_ANALYSIS_MODELS.find(item => String(url).endsWith(item.file))!;
            return new Response(null, { headers: { 'content-length': String(model.bytes) } });
        });
        const host = createDesktopAnalysisModelHost(request);
        expect(await host.getPresent()).toEqual({ beat_this: true, htdemucs: false, htdemucs_gpu: true });
        expect(request).toHaveBeenCalledTimes(DESKTOP_ANALYSIS_MODELS.length);
    });

    it('does not report missing or incomplete files as installed', async () => {
        const request = vi.fn(async (url: RequestInfo | URL) => String(url).includes('beat_this')
            ? new Response(null, { status: 404 })
            : new Response(null, { headers: { 'content-length': '1' } }));
        expect(await createDesktopAnalysisModelHost(request).getPresent())
            .toEqual({ beat_this: false, htdemucs: false, htdemucs_gpu: false });
    });

    it('does not expose an unverified downloaded body', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const request = vi.fn(async () => new Response(packedModel()));
        expect(await createDesktopAnalysisModelHost(request).readGpuWeights('beat_this')).toBeNull();
    });

    it('keeps the original Electron bridge as the default host', async () => {
        const weights = { weights: new Uint8Array(4), manifest: {} };
        const getBeatThisGpuWeights = vi.fn(async () => weights);
        vi.stubGlobal('window', { electron: { getBeatThisGpuWeights, getAutomixModelsPresent: async () => ({ beat_this: true }) } });
        expect(hasAnalysisGpuWeights('beat_this')).toBe(true);
        expect(hasAnalysisGpuWeights('htdemucs')).toBe(false);
        expect(await readAnalysisGpuWeights('beat_this')).toBe(weights);
        expect(getBeatThisGpuWeights).toHaveBeenCalledWith('beat_this');
        expect(await getAnalysisModelHost().getPresent()).toEqual({ beat_this: true });
    });

    it('ignores a late presence answer after switching hosts', async () => {
        let finish!: (value: AutomixModelsPresent) => void;
        const stale: AnalysisModelHost = {
            getPresent: () => new Promise(resolve => { finish = resolve; }),
            hasGpuWeights: () => false,
            readGpuWeights: async () => null,
        };
        setAnalysisModelHost(stale);
        const pending = refreshModelAvailability();
        setAnalysisModelHost({ ...stale, getPresent: async () => ({ beat_this: true, htdemucs_gpu: true }) });
        await refreshModelAvailability();
        finish({ beat_this: false, htdemucs: false, htdemucs_gpu: false });
        await pending;
        expect(modelsPresent()).toEqual({ beat_this: true, htdemucs: false, htdemucs_gpu: true });
    });
});
