import type { MonetBackgroundImage, NomandBackgroundTuning } from '../../../../types';

// Resolve the selected local image without importing the background renderer.
export const resolveNomandSourceUrl = (
    coverUrl: string | null | undefined,
    monetBackgroundImage: MonetBackgroundImage | null | undefined,
    tuning: NomandBackgroundTuning,
) => (
    tuning.imageSource === 'uploaded-global'
        ? monetBackgroundImage?.url ?? coverUrl
        : coverUrl ?? monetBackgroundImage?.url
);
