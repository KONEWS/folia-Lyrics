// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DesktopVisualQuickControls from '../../../src/desktopLyrics/visualFeatures/DesktopVisualQuickControls';
import { DESKTOP_DEFAULT_THEME } from '../../../src/desktopLyrics/desktopTheme';
import type { DesktopVisualSettingsModel } from '../../../src/desktopLyrics/useDesktopVisualSettings';
import { useSceneSettingsStore } from '../../../src/components/scenes/settings/useSceneSettingsStore';

// Scene quick controls hand off to the existing studio and leave their popup closed with a persistent focus target.
vi.mock('../../../src/desktopLyrics/select/useCustomSelectPosition', () => ({
    useCustomSelectPosition: ({ open }: { open: boolean }) => open ? { left: 8, top: 40, width: 300, maxHeight: 600 } : null,
}));

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    useSceneSettingsStore.getState().setSceneId(null);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
});

describe('scene quick controls', () => {
    it('closes the quick popup and opens the scene destination from its heading action', () => {
        const onSceneSettings = vi.fn();
        const onVisualSettings = vi.fn();
        const model = {
            mergedTheme: DESKTOP_DEFAULT_THEME,
            backgroundConfig: { mode: 'common' },
            panelProps: () => ({}),
        } as unknown as DesktopVisualSettingsModel;
        act(() => root.render(createElement(DesktopVisualQuickControls, {
            mode: 'classic', model, sceneOnly: true, onSceneSettings, onVisualSettings, onBackgroundSettings: vi.fn(),
        })));
        const trigger = host.querySelector<HTMLButtonElement>('button')!;
        act(() => trigger.click());
        const popup = document.querySelector<HTMLElement>('[role="dialog"]')!;
        expect(popup).not.toBeNull();
        const more = Array.from(popup.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === '更多设置')!;
        expect(more).toBeDefined();
        expect(onSceneSettings).not.toHaveBeenCalled();

        act(() => more.click());
        expect(onSceneSettings).toHaveBeenCalledOnce();
        expect(onVisualSettings).not.toHaveBeenCalled();
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(trigger);
    });
});
