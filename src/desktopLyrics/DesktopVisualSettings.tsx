import DesktopVisualStudio from './visualFeatures/DesktopVisualStudio';
import type { LivePreviewSource } from '../components/visualizer/preview/livePreviewFeed';
import type { VisualizerMode } from '../types';
import type { DesktopVisualSettingsModel } from './useDesktopVisualSettings';
import type { DesktopSettingsSearchEntry, DesktopSettingsSearchRequest } from '../types/desktopSettingsSearch';
import DesktopVisualLanguage from './DesktopVisualLanguage';
import { SettingsKitThemeContext } from '../components/modal/settings/kit/kitTheme';
import './desktop-visual-settings.css';

// A single studio owns the preview, visual controls and desktop additions.
export type DesktopVisualSection = 'common' | 'background' | 'visualizer' | 'subtitle' | 'global';
export type DesktopVisualSettingsProps = { livePreviewSource?: LivePreviewSource; mode: VisualizerMode; onMode: (mode: VisualizerMode) => void; model: DesktopVisualSettingsModel;
    onClose: () => void; initialSection?: DesktopVisualSection; navigationSequence?: number; onSegmentation?: () => void; canSegment?: boolean; returnFocus?: HTMLElement | null;
    searchNavigation?: DesktopSettingsSearchRequest; onSearchNavigate: (entry: DesktopSettingsSearchEntry) => void; onClearSearchNavigation: () => void };

export default function DesktopVisualSettings(props: DesktopVisualSettingsProps) {
    return <SettingsKitThemeContext.Provider value={{ isDaylight: false, theme: props.model.mergedTheme }}>
        <DesktopVisualLanguage><DesktopVisualStudio {...props}/></DesktopVisualLanguage>
    </SettingsKitThemeContext.Provider>;
}
