import { getVisualizerModeLabel, VISUALIZER_REGISTRY } from '../components/visualizer/registry';
import type { VisualizerMode } from '../types';
import i18n from '../i18n/config';

// src/desktopLyrics/desktopModes.ts — desktop controls share the original dynamic mode registry.
export const MODES = VISUALIZER_REGISTRY.filter(entry => entry.mode !== 'still');
export const ALL_MODES = VISUALIZER_REGISTRY;
export const desktopModeLabel = (mode: VisualizerMode) => getVisualizerModeLabel(mode, key => i18n.t(key, { lng: 'zh-CN' }));
