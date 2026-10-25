import type { AutomixModelsPresent } from './modelAvailability';

// The host supplies model files; the shared WebGPU runtime stays independent of Electron and WebView.
export type AnalysisGpuModel = 'beat_this' | 'htdemucs';
export interface AnalysisGpuWeights {
    weights: Uint8Array<ArrayBuffer>;
    manifest: unknown;
}
export interface AnalysisModelHost {
    getPresent: () => Promise<Partial<AutomixModelsPresent> | null>;
    hasGpuWeights: (model: AnalysisGpuModel) => boolean;
    readGpuWeights: (model: AnalysisGpuModel) => Promise<AnalysisGpuWeights | null>;
}

const electronHost: AnalysisModelHost = {
    getPresent: async () => typeof window !== 'undefined' ? await window.electron?.getAutomixModelsPresent?.() ?? null : null,
    hasGpuWeights: model => typeof window !== 'undefined' && (model === 'htdemucs'
        ? typeof window.electron?.getHtdemucsGpuWeights === 'function'
        : typeof window.electron?.getBeatThisGpuWeights === 'function'),
    readGpuWeights: async model => {
        if (typeof window === 'undefined') return null;
        return model === 'htdemucs'
            ? await window.electron?.getHtdemucsGpuWeights?.() ?? null
            : await window.electron?.getBeatThisGpuWeights?.(model) ?? null;
    },
};
let installedHost: AnalysisModelHost | null = null;

export const setAnalysisModelHost = (host: AnalysisModelHost | null): void => { installedHost = host; };
export const getAnalysisModelHost = (): AnalysisModelHost => installedHost ?? electronHost;
export const hasAnalysisGpuWeights = (model: AnalysisGpuModel): boolean => getAnalysisModelHost().hasGpuWeights(model);
export const readAnalysisGpuWeights = (model: AnalysisGpuModel): Promise<AnalysisGpuWeights | null> => getAnalysisModelHost().readGpuWeights(model);
