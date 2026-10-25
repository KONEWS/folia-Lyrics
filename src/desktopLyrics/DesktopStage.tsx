import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { VisualizerMode } from '../types';
import type { VisualizerSharedProps } from '../components/visualizer/definition';
import VisualizerRenderer from '../components/visualizer/VisualizerRenderer';
import { getVisualizerTuning } from '../components/visualizer/tuningRegistry';
import { useVisualizerSettingsStore } from '../stores/useVisualizerSettingsStore';
import { PlayerBottomBarLayoutContext } from '../components/floating-player/PlayerBottomBarLayoutContext';
import VisualizerBoundary from './VisualizerBoundary';

// src/desktopLyrics/DesktopStage.tsx — stable runtime props keep settings drafts outside the original renderer's React path.
type Scene = VisualizerSharedProps & { mode: VisualizerMode };
type Props = Scene & { onRecover: () => void; ready: boolean; fallback: ReactNode };
export const DESKTOP_HANDOVER_MS = 200;
const StableRenderer = memo(VisualizerRenderer);

const DesktopStage = memo(function DesktopStage({ onRecover, ready, fallback, ...props }: Props) {
  const committed = useRef<Scene | null>(null);
  const [, expire] = useState(0);
  useLayoutEffect(() => { if (ready) committed.current = props; });
  useEffect(() => {
    if (ready) return;
    if (!committed.current) return;
    // Keep expensive renderer resources for short cached handovers; slow lookup releases them and shows the current waiting page.
    const previous = committed.current;
    const timer = setTimeout(() => {
      if (committed.current === previous) { committed.current = null; expire(revision => revision + 1); }
    }, DESKTOP_HANDOVER_MS);
    return () => clearTimeout(timer);
  }, [ready]);
  const scene = ready ? props : committed.current;
  const shownMode = scene?.mode ?? props.mode;
  const onVisualizerTuningChange = useCallback((patch: object) => {
    const adapter = getVisualizerTuning(shownMode);
    const store = useVisualizerSettingsStore.getState() as unknown as Record<string, unknown>;
    const save = adapter ? store[adapter.settingsSetterKey] : undefined;
    if (typeof save === 'function') save(patch);
  }, [shownMode]);
  if (!scene) return fallback;
  return <VisualizerBoundary mode={scene.mode} onRecover={onRecover}><PlayerBottomBarLayoutContext.Provider value={true}>
    <StableRenderer {...scene} animateStyleSwitch onVisualizerTuningChange={onVisualizerTuningChange} paused={ready ? scene.paused : true}/>
  </PlayerBottomBarLayoutContext.Provider></VisualizerBoundary>;
});
export default DesktopStage;
