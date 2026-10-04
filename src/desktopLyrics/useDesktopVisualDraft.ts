import { useCallback, useEffect, useRef, useState } from 'react';
import { applyTypographyPatch, applyVisualizerPatch, mergeVisualizerPatch, type DesktopTypographyPatch, type DesktopVisualizerPatch } from './desktopVisualFields';

// src/desktopLyrics/useDesktopVisualDraft.ts — slider changes stay in the settings UI until one release/cancel commit.
export function useDesktopVisualDraft() {
  const dragging = useRef(false), pending = useRef<{ visualizer: DesktopVisualizerPatch; typography: DesktopTypographyPatch }>({ visualizer: {}, typography: {} });
  const [draft, setDraft] = useState(pending.current);
  const beginSlider = useCallback(() => { dragging.current = true; }, []);
  const commitSlider = useCallback(() => {
    dragging.current = false;
    const changes = pending.current;
    pending.current = { visualizer: {}, typography: {} };
    applyVisualizerPatch(changes.visualizer); applyTypographyPatch(changes.typography);
    setDraft(pending.current);
  }, []);
  const patchVisualizer = useCallback((patch: DesktopVisualizerPatch) => {
    if (!dragging.current) { applyVisualizerPatch(patch); return; }
    pending.current = { ...pending.current, visualizer: mergeVisualizerPatch(pending.current.visualizer, patch) };
    setDraft(pending.current);
  }, []);
  const patchTypography = useCallback((patch: DesktopTypographyPatch) => {
    if (!dragging.current) { applyTypographyPatch(patch); return; }
    pending.current = { ...pending.current, typography: { ...pending.current.typography, ...patch } };
    setDraft(pending.current);
  }, []);
  // A release outside the originating slider or closing the settings window cannot strand a draft.
  useEffect(() => {
    const release = () => { if (dragging.current) commitSlider(); };
    window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release); window.addEventListener('blur', release);
    return () => { window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release); window.removeEventListener('blur', release); };
  }, [commitSlider]);
  return { draft, beginSlider, commitSlider, patchVisualizer, patchTypography };
}
