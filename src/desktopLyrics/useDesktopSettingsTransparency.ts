import { useLayoutEffect, type RefObject } from 'react';
import { useDesktopPanelSettingsStore } from '../stores/useDesktopPanelSettingsStore';

// src/desktopLyrics/useDesktopSettingsTransparency.ts — change only settings material without updating lyric renderer props.
export function previewSettingsTransparency(value: number) {
  document.querySelector<HTMLElement>('.desktop-lyrics')?.style.setProperty('--desktop-settings-transparency', `${value}%`);
}
export function useDesktopSettingsTransparency(root: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const sync = () => element.style.setProperty('--desktop-settings-transparency', `${useDesktopPanelSettingsStore.getState().settingsTransparency}%`);
    sync();
    return useDesktopPanelSettingsStore.subscribe(sync);
  }, [root]);
}
