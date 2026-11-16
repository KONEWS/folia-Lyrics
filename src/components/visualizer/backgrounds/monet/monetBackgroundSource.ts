import type { MonetBackgroundImage, MonetBackgroundTuning } from '../../../../types';

// Resolve the selected local image without importing the background renderer.
export const resolveMonetSourceUrl = (
    coverUrl: string | null | undefined,
    monetBackgroundImage: MonetBackgroundImage | null | undefined,
    tuning: MonetBackgroundTuning,
) => (
    tuning.backgroundSource === 'uploaded-global'
        ? monetBackgroundImage?.url ?? coverUrl ?? null
        : coverUrl ?? monetBackgroundImage?.url ?? null
);
