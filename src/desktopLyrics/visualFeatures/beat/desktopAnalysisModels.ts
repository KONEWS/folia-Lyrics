import manifestText from '../../../../shared/modelManifest.json?raw';
import { setAnalysisModelHost, type AnalysisGpuModel, type AnalysisGpuWeights, type AnalysisModelHost } from '../../../services/analysis/analysisModelHost';
import { refreshModelAvailability, type AutomixModelsPresent } from '../../../services/analysis/modelAvailability';

// The WebView reads only bundled same-origin weights; their pinned digest is checked before GPU upload.
export interface DesktopAnalysisModel {
    name: AnalysisGpuModel;
    file: string;
    bytes: number;
    sha256: string;
}
export const DESKTOP_ANALYSIS_MODELS = (JSON.parse(manifestText) as { models: DesktopAnalysisModel[] }).models;
const MAGIC = 'FOLIABTW';
const TRAILER_BYTES = 16;
const modelUrl = (model: DesktopAnalysisModel) => `/analysis-models/${encodeURIComponent(model.file)}`;

/** Reads the same packed tensor/JSON layout as electron/analysis/packedWeights.cjs, without Node APIs. */
export function unpackDesktopAnalysisModel(bytes: Uint8Array<ArrayBuffer>): AnalysisGpuWeights {
    const end = bytes.byteLength - TRAILER_BYTES;
    if (end <= 0 || new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(end, end + MAGIC.length)) !== MAGIC) {
        throw new Error('Model has no FOLIABTW trailer');
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const wideOffset = view.getBigUint64(bytes.byteLength - 8, true);
    if (wideOffset > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Model manifest offset is not a safe integer');
    const offset = Number(wideOffset);
    if (offset <= 0 || offset >= end) throw new Error('Model manifest offset is outside the file');
    const manifest: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset, end)));
    if (!manifest || typeof manifest !== 'object' || !('bytes' in manifest) || manifest.bytes !== offset) {
        throw new Error('Model tensor length does not match its manifest');
    }
    return { weights: bytes.subarray(0, offset), manifest };
}

/** Hash the complete packed export before reading its metadata or transferring its weights. */
export async function verifyDesktopAnalysisModel(bytes: Uint8Array<ArrayBuffer>, model: Pick<DesktopAnalysisModel, 'file' | 'bytes' | 'sha256'>): Promise<AnalysisGpuWeights> {
    if (bytes.byteLength !== model.bytes) throw new Error(`Model ${model.file} has ${bytes.byteLength} bytes; expected ${model.bytes}`);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    const digest = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
    if (digest !== model.sha256) throw new Error(`Model ${model.file} failed SHA-256 verification`);
    return unpackDesktopAnalysisModel(bytes);
}

export function createDesktopAnalysisModelHost(request: typeof fetch = fetch): AnalysisModelHost {
    const findModel = (name: AnalysisGpuModel) => DESKTOP_ANALYSIS_MODELS.find(model => model.name === name);
    return {
        hasGpuWeights: name => Boolean(findModel(name)),
        getPresent: async () => {
            const found = await Promise.all(DESKTOP_ANALYSIS_MODELS.map(async model => {
                try {
                    const response = await request(modelUrl(model), { method: 'HEAD', cache: 'no-cache', mode: 'same-origin', redirect: 'error' });
                    return response.ok && Number(response.headers.get('content-length')) === model.bytes;
                } catch (error) {
                    console.warn(`[DesktopAnalysis] Could not check bundled model ${model.file}`, error);
                    return false;
                }
            }));
            const present = (name: AnalysisGpuModel) => found[DESKTOP_ANALYSIS_MODELS.findIndex(model => model.name === name)] === true;
            // This host provides WebGPU stems only; it has no Electron/MNN CPU stem runner.
            return { beat_this: present('beat_this'), htdemucs: false, htdemucs_gpu: present('htdemucs') };
        },
        readGpuWeights: async name => {
            const model = findModel(name);
            if (!model) return null;
            try {
                const response = await request(modelUrl(model), { cache: 'no-cache', mode: 'same-origin', redirect: 'error' });
                if (!response.ok) throw new Error(`Model ${model.file} returned HTTP ${response.status}`);
                const result = await verifyDesktopAnalysisModel(new Uint8Array(await response.arrayBuffer()), model);
                console.info(`[DesktopAnalysis] Verified bundled model ${model.file}`);
                return result;
            } catch (error) {
                console.warn(`[DesktopAnalysis] Cannot load bundled model ${model.file}`, error);
                return null;
            }
        },
    };
}

let desktopHost: AnalysisModelHost | null = null;
/** Registration is synchronous; the returned promise checks presence without downloading weights or starting a worker. */
export function initializeDesktopAnalysisModels(): Promise<AutomixModelsPresent> {
    desktopHost ??= createDesktopAnalysisModelHost();
    setAnalysisModelHost(desktopHost);
    return refreshModelAvailability();
}
