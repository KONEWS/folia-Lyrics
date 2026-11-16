import { lazy, Suspense, type ComponentProps } from 'react';
import VisualizerRenderer from '../../components/visualizer/VisualizerRenderer';
import { useSceneSettingsStore } from '../../components/scenes/settings/useSceneSettingsStore';

// The studio previews the same bundled scene and saved seat as the desktop stage.
const SceneRenderer = lazy(() => import('../../components/scenes/engine/SceneHost'));

export default function DesktopScenePreview({ suspended, ...props }: ComponentProps<typeof VisualizerRenderer> & { suspended?: boolean }) {
    const sceneId = useSceneSettingsStore(state => state.sceneId);
    if (!sceneId) return <VisualizerRenderer {...props}/>;
    return <Suspense fallback={<VisualizerRenderer {...props}/>}>
        <SceneRenderer {...props} suspended={suspended}/>
    </Suspense>;
}
