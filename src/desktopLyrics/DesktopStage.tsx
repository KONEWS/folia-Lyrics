import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { VisualizerMode } from '../types';
import type { VisualizerSharedProps } from '../components/visualizer/definition';
import VisualizerRenderer from '../components/visualizer/VisualizerRenderer';
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
  if (!scene) return fallback;
  return <VisualizerBoundary key={scene.mode} mode={scene.mode} onRecover={onRecover}><PlayerBottomBarLayoutContext.Provider value={true}>
    <StableRenderer {...scene} paused={ready ? scene.paused : true}/>
  </PlayerBottomBarLayoutContext.Provider></VisualizerBoundary>;
});
export default DesktopStage;
