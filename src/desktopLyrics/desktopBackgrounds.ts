import type { VisualizerBackgroundMode } from '../types';
import { BUILTIN_VISUALIZER_BACKGROUND_MODES } from '../types/visualizerModes';

// Desktop backgrounds use local artwork and effects; legacy webpage selections fall back to the common background.
export const DESKTOP_BACKGROUND_MODES: readonly VisualizerBackgroundMode[] = BUILTIN_VISUALIZER_BACKGROUND_MODES;
export const desktopBackgroundMode = (mode: VisualizerBackgroundMode | null | undefined): VisualizerBackgroundMode | null | undefined => mode === 'url' ? 'common' : mode;
