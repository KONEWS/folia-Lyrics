import { create } from 'zustand';
import { getStoredString } from './storagePrimitives';

// src/stores/useDesktopPanelSettingsStore.ts — persisted material transparency for desktop settings windows.
export const DESKTOP_SETTINGS_TRANSPARENCY_KEY = 'folia.desktop.settingsTransparency.v1';
export const DEFAULT_SETTINGS_TRANSPARENCY = 15;
const normalize = (value: number) => Math.round(Math.min(100, Math.max(0, value)));
const saved = Number(getStoredString(DESKTOP_SETTINGS_TRANSPARENCY_KEY, String(DEFAULT_SETTINGS_TRANSPARENCY)));
type State = { settingsTransparency: number; setSettingsTransparency: (value: number) => void };
export const useDesktopPanelSettingsStore = create<State>(set => ({
  settingsTransparency: Number.isFinite(saved) ? normalize(saved) : DEFAULT_SETTINGS_TRANSPARENCY,
  setSettingsTransparency: value => {
    if (!Number.isFinite(value)) return;
    const settingsTransparency = normalize(value);
    if (typeof window !== 'undefined') localStorage.setItem(DESKTOP_SETTINGS_TRANSPARENCY_KEY, String(settingsTransparency));
    set({ settingsTransparency });
  },
}));
