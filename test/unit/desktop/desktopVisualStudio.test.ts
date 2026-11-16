// @vitest-environment jsdom
import { act, createElement, Fragment, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DesktopVisualStudio from '../../../src/desktopLyrics/visualFeatures/DesktopVisualStudio';
import type VisPlayground from '../../../src/components/visualizer/window/VisPlayground';
import type { DesktopVisualSettingsModel } from '../../../src/desktopLyrics/useDesktopVisualSettings';
import type { DesktopSettingsSearchRequest } from '../../../src/types/desktopSettingsSearch';
import type { VisualizerBackgroundMode } from '../../../src/types';

// Studio navigation and keyboard ownership preserve the current settings and child dialogs.
type StudioProps = ComponentProps<typeof VisPlayground>;
const studio = vi.hoisted(() => ({ props: null as StudioProps | null, content: null as ReactNode }));
vi.mock('../../../src/components/visualizer/window/VisPlayground', () => ({
    default: (props: StudioProps) => { studio.props = props; return studio.content; },
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
    studio.content = null;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
});

describe('desktop studio keyboard ownership', () => {
    it('lets a body portal close on Escape before a later Escape closes the studio itself', () => {
        const commit = vi.fn();
        const closeStudio = vi.fn();
        const closeChild = vi.fn();
        function ChildDialog() {
            const [open, setOpen] = useState(true);
            const panel = useRef<HTMLDivElement>(null);
            useEffect(() => {
                if (!open) return;
                // Body-portal dialogs handle Escape at document after React has bubbled to the studio.
                const keyboard = (event: KeyboardEvent) => {
                    if (event.key !== 'Escape' || !panel.current?.contains(event.target as Node)) return;
                    event.preventDefault(); event.stopPropagation();
                    closeChild(); setOpen(false);
                };
                document.addEventListener('keydown', keyboard);
                return () => document.removeEventListener('keydown', keyboard);
            }, [open]);
            return open ? createPortal(createElement('div', { ref: panel, role: 'dialog' },
                createElement('button', { 'data-child-control': true }, 'Child setting')), document.body) : null;
        }
        studio.content = createElement(Fragment, null,
            createElement('button', { 'data-studio-control': true }, 'Studio setting'), createElement(ChildDialog));
        function Host() {
            const [open, setOpen] = useState(true);
            const model = {
                mergedTheme: {}, typography: {}, visualizer: {}, rendererProps: {},
                backgroundConfig: {}, backgroundActions: {}, commitSlider: commit,
            } as unknown as DesktopVisualSettingsModel;
            return open ? createElement(DesktopVisualStudio, {
                model, mode: 'classic', onMode: vi.fn(), onSearchNavigate: vi.fn(), onClearSearchNavigation: vi.fn(),
                onClose: () => { closeStudio(); setOpen(false); },
            }) : null;
        }
        act(() => root.render(createElement(Host)));
        const studioRoot = host.querySelector('[data-desktop-visual-studio]')!;
        const child = document.querySelector<HTMLButtonElement>('[data-child-control]')!;
        expect(studioRoot.contains(child)).toBe(false);
        child.focus();
        act(() => child.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
        expect(closeChild).toHaveBeenCalledOnce();
        expect(closeStudio).not.toHaveBeenCalled();
        expect(commit).not.toHaveBeenCalled();
        expect(document.querySelector('[data-child-control]')).toBeNull();
        expect(host.querySelector('[data-desktop-visual-studio]')).toBe(studioRoot);
        const control = host.querySelector<HTMLButtonElement>('[data-studio-control]')!;
        control.focus();
        act(() => control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
        expect(closeStudio).toHaveBeenCalledOnce();
        expect(commit).toHaveBeenCalledOnce();
        expect(host.querySelector('[data-desktop-visual-studio]')).toBeNull();
    });
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
