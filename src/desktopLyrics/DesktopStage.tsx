import { memo } from 'react';
import type { VisualizerMode } from '../types';
import type { VisualizerSharedProps } from '../components/visualizer/definition';
import VisualizerRenderer from '../components/visualizer/VisualizerRenderer';
import { PlayerBottomBarLayoutContext } from '../components/floating-player/PlayerBottomBarLayoutContext';
import VisualizerBoundary from './VisualizerBoundary';

// src/desktopLyrics/DesktopStage.tsx — stable runtime props keep settings drafts outside the original renderer's React path.
type Props = VisualizerSharedProps & { mode: VisualizerMode; onRecover: () => void };
const DesktopStage = memo(function DesktopStage({ onRecover, ...props }: Props) {
  return <VisualizerBoundary key={props.mode} onRecover={onRecover}><PlayerBottomBarLayoutContext.Provider value={true}>
    <VisualizerRenderer {...props}/>
  </PlayerBottomBarLayoutContext.Provider></VisualizerBoundary>;
});
export default DesktopStage;
