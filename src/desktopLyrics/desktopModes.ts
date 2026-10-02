import { VISUALIZER_REGISTRY } from '../components/visualizer/registry';

// src/desktopLyrics/desktopModes.ts — desktop controls share the original dynamic mode registry.
export const MODES = VISUALIZER_REGISTRY.filter(entry => entry.mode !== 'still');
