import { useCallback, useEffect, useRef, useState } from 'react';
import { useDesktopPanelSettingsStore } from '../stores/useDesktopPanelSettingsStore';
import { useVisualTranslation, VisualRange } from './DesktopVisualControls';
import { previewSettingsTransparency } from './useDesktopSettingsTransparency';

// src/desktopLyrics/DesktopSettingsTransparency.tsx — shared live preview slider, persisted once per completed gesture.
export default function DesktopSettingsTransparency() {
  const t = useVisualTranslation();
  const saved = useDesktopPanelSettingsStore(state => state.settingsTransparency);
  const [draft, setDraft] = useState<number | null>(null);
  const pending = useRef<number | null>(null);
  const save = useCallback(() => {
    if (pending.current === null) return;
    useDesktopPanelSettingsStore.getState().setSettingsTransparency(pending.current);
    pending.current = null;
  }, []);
  const commit = useCallback(() => { save(); setDraft(null); }, [save]);
  // Release outside the slider, loss of focus and closing a panel also finish the current preview.
  useEffect(() => {
    window.addEventListener('pointerup', commit); window.addEventListener('pointercancel', commit); window.addEventListener('blur', commit);
    return () => {
      window.removeEventListener('pointerup', commit); window.removeEventListener('pointercancel', commit); window.removeEventListener('blur', commit);
      save();
    };
  }, [commit, save]);
  // Display opacity while retaining the saved transparency format and existing imported configurations.
  const value = 100 - (draft ?? saved);
  return <div className="desktop-settings-transparency"><VisualRange label={t('desktopVisual.settingsTransparency')}
    value={value} min={0} max={100} step={1} display={`${value}%`} beginSlider={() => {}} commitSlider={commit}
    onChange={next => { const transparency = 100 - next; pending.current = transparency; setDraft(transparency); previewSettingsTransparency(transparency); }}/></div>;
}
