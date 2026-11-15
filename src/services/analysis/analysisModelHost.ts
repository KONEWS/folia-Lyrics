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

const unavailableHost: AnalysisModelHost = {
    getPresent: async () => null,
    hasGpuWeights: () => false,
    readGpuWeights: async () => null,
};
let installedHost: AnalysisModelHost | null = null;

export const setAnalysisModelHost = (host: AnalysisModelHost | null): void => { installedHost = host; };
export const getAnalysisModelHost = (): AnalysisModelHost => installedHost ?? unavailableHost;
export const hasAnalysisGpuWeights = (model: AnalysisGpuModel): boolean => getAnalysisModelHost().hasGpuWeights(model);
export const readAnalysisGpuWeights = (model: AnalysisGpuModel): Promise<AnalysisGpuWeights | null> => getAnalysisModelHost().readGpuWeights(model);
