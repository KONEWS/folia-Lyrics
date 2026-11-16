// @vitest-environment jsdom
import { act, createElement, useState, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DesktopVisualStudio from '../../../src/desktopLyrics/visualFeatures/DesktopVisualStudio';
import type VisPlayground from '../../../src/components/visualizer/window/VisPlayground';
import type { DesktopVisualSettingsModel } from '../../../src/desktopLyrics/useDesktopVisualSettings';
import type { DesktopSettingsSearchRequest } from '../../../src/types/desktopSettingsSearch';
import type { VisualizerBackgroundMode } from '../../../src/types';

// Search inspection must give way to an explicit background choice without leaving stale preview overrides.
type StudioProps = ComponentProps<typeof VisPlayground>;
const studio = vi.hoisted(() => ({ props: null as StudioProps | null }));
vi.mock('../../../src/components/visualizer/window/VisPlayground', () => ({
    default: (props: StudioProps) => { studio.props = props; return null; },
}));
vi.mock('../../../src/desktopLyrics/useDesktopSettingsSearchNavigation', () => ({ useDesktopSettingsSearchNavigation: () => '' }));
vi.mock('../../../src/desktopLyrics/DesktopVisualControls', () => ({ useVisualTranslation: () => (key: string) => key }));
vi.mock('../../../src/desktopLyrics/visualFeatures/DesktopSceneSettings', () => ({ default: () => null }));
vi.mock('../../../src/desktopLyrics/visualFeatures/DesktopScenePreview', () => ({ default: () => null }));
vi.mock('../../../src/desktopLyrics/visualFeatures/performance/DesktopPerformanceCheck', () => ({ default: () => null }));

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    studio.props = null;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
});

describe('desktop studio background inspection', () => {
    it('returns to the selected background when the user chooses one after a search', () => {
        const commit = vi.fn();
        const choose = vi.fn();
        const clear = vi.fn();
        const searched: DesktopSettingsSearchRequest = {
            sequence: 1,
            entry: { key: 'background.monet', label: 'Monet', section: 'background', background: 'monet' },
        };
        function Host() {
            const [background, setBackground] = useState<VisualizerBackgroundMode>('common');
            const [search, setSearch] = useState<DesktopSettingsSearchRequest | undefined>(searched);
            const model = {
                mergedTheme: {}, typography: {}, visualizer: {}, rendererProps: {},
                backgroundConfig: { mode: background },
                backgroundActions: { onModeChange: (mode: VisualizerBackgroundMode) => { choose(mode); setBackground(mode); } },
                commitSlider: commit,
            } as unknown as DesktopVisualSettingsModel;
            return createElement(DesktopVisualStudio, {
                model, mode: 'classic', initialSection: 'background', searchNavigation: search,
                onMode: vi.fn(), onClose: vi.fn(), onSearchNavigate: vi.fn(),
                onClearSearchNavigation: () => { clear(); setSearch(undefined); },
            });
        }
        act(() => root.render(createElement(Host)));
        expect(studio.props?.backgroundConfig?.mode).toBe('monet');
        expect(choose).not.toHaveBeenCalled();
        act(() => studio.props?.backgroundActions?.onModeChange?.('nomand'));
        expect(choose).toHaveBeenCalledExactlyOnceWith('nomand');
        expect(clear).toHaveBeenCalledOnce();
        expect(commit).toHaveBeenCalledOnce();
        expect(studio.props?.backgroundConfig?.mode).toBe('nomand');
    });
});
