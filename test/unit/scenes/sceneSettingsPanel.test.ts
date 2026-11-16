// @vitest-environment jsdom
import { act, createElement, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SceneSettingsPanel from '../../../src/components/scenes/settings/SceneSettingsPanel';
import cinema from '../../../src/components/scenes/cinema/entry';
import { publishSceneViewpoints } from '../../../src/components/scenes/engine/sceneViewpoints';
import { useSceneSettingsStore } from '../../../src/components/scenes/settings/useSceneSettingsStore';
import { useDesktopSettingsSearchNavigation } from '../../../src/desktopLyrics/useDesktopSettingsSearchNavigation';
import DesktopVisualLanguage from '../../../src/desktopLyrics/DesktopVisualLanguage';
import type { DesktopSettingsSearchRequest } from '../../../src/types/desktopSettingsSearch';

// The seat destination stays reachable while a lazily loaded scene publishes its anchors.
let host: HTMLDivElement;
let root: Root;
const owner = {};
let frames: Map<number, FrameRequestCallback>;
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    frames = new Map();
    let sequence = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    publishSceneViewpoints('cinema', null, owner);
    host.remove(); vi.unstubAllGlobals();
});

describe('scene seat navigation', () => {
    it('focuses the pending seat area and keeps it when the scene finishes loading', () => {
        const request: DesktopSettingsSearchRequest = { sequence: 1, entry: {
            key: 'common.ui.sceneSeat', label: '座位', section: 'global', fallback: '场景',
        } };
        function Panel() {
            const ref = useRef<HTMLDivElement>(null);
            const hint = useDesktopSettingsSearchNavigation(ref, request);
            return createElement('div', { ref }, createElement(SceneSettingsPanel, { manifest: cinema.manifest }), hint);
        }
        act(() => root.render(createElement(DesktopVisualLanguage, null, createElement(Panel))));
        act(() => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)); });
        const destination = host.querySelector<HTMLElement>('[data-scene-seat]')!;
        expect(document.activeElement).toBe(destination);
        expect(destination.classList.contains('desktop-settings-search-target')).toBe(true);
        expect(destination.querySelector('[role=status]')?.textContent).toBe('正在载入座位…');
        expect(host.textContent).not.toContain('请先检查');

        act(() => publishSceneViewpoints('cinema', [{
            kind: 'viewpoint', id: 'R2-3', eye: [0, 1, 0], ear: [0, 1, 0], lookAt: [0, 1, -1],
        }], owner));
        expect(host.querySelector('[data-scene-seat]')).toBe(destination);
        expect(document.activeElement).toBe(destination);
        expect(destination.querySelector('[role=status]')).toBeNull();
        const seat = destination.querySelector<HTMLButtonElement>('button')!;
        act(() => seat.click());
        expect(seat.getAttribute('aria-pressed')).toBe('true');
        expect(useSceneSettingsStore.getState().sceneOptions.cinema?.viewpoint).toBe('R2-3');
    });
});
