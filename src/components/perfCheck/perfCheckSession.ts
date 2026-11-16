import { holdGpuAnalysis } from '../../services/analysis/beatThisGpu';

// Only the current check owns the analysis hold; an old completion cannot release a later check.
let owner: symbol | null = null;

export function beginPerfCheckSession() {
    const token = Symbol('performance check');
    const controller = new AbortController();
    owner = token;
    holdGpuAnalysis(true);
    const finish = () => {
        if (owner !== token) return;
        owner = null;
        holdGpuAnalysis(false);
    };
    return {
        controller,
        finish,
        dispose: () => { controller.abort(); finish(); },
    };
}
