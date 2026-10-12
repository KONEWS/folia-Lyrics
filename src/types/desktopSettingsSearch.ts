import type { VisualizerBackgroundMode, VisualizerMode } from '../types';

// src/types/desktopSettingsSearch.ts — destinations for search across the native desktop settings surfaces.
export type DesktopSettingsSearchEntry = {
  key: string;
  label: string;
  section: 'main' | 'common' | 'visualizer' | 'subtitle' | 'background';
  keywords?: string[];
  breadcrumb?: string;
  context?: string;
  fallback?: string;
  fallbacks?: string[];
  mode?: VisualizerMode;
  background?: VisualizerBackgroundMode;
};
export type DesktopSettingsSearchRequest = { sequence: number; entry: DesktopSettingsSearchEntry };
