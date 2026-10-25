import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compressConfig, decompressConfig } from '@/utils/appearanceCodec';
import { exportDesktopVisualConfig, importDesktopVisualConfig } from '@/desktopLyrics/desktopVisualSettingsCodec';
import { useVisualizerSettingsStore } from '@/stores/useVisualizerSettingsStore';
import { useTypographySettingsStore } from '@/stores/useTypographySettingsStore';
import { useThemeSettingsStore } from '@/stores/useThemeSettingsStore';

// Random selections survive both desktop transfer formats without being mistaken for a manual style choice.
const initial = useVisualizerSettingsStore.getState();
const typography = useTypographySettingsStore.getState();
const theme = useThemeSettingsStore.getState();
const options = () => ({ animationIntensity: 'calm' as const, backgroundEnabled: false, translated: true,
    setAnimationIntensity: vi.fn(), setBackgroundEnabled: vi.fn(), setTranslated: vi.fn() });
const saved = new Map<string, string>();
beforeEach(() => {
    saved.clear();
    const storage = { getItem: (key: string) => saved.get(key) ?? null,
        setItem: (key: string, value: string) => saved.set(key, String(value)), removeItem: (key: string) => saved.delete(key) };
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('window', { localStorage: storage });
    useVisualizerSettingsStore.setState(initial);
});
afterEach(() => {
    useVisualizerSettingsStore.setState(initial);
    useTypographySettingsStore.setState(typography);
    useThemeSettingsStore.setState(theme);
    vi.unstubAllGlobals();
});

describe('desktop random configuration transfer', () => {
    it.each(['json', 'code'] as const)('roundtrips the current style, random switch and pool through %s', format => {
        const store = useVisualizerSettingsStore.getState();
        store.handleSetRandomVisualizerModes(['sonnet', 'tilt']);
        store.handleToggleRandomVisualizerModePerSong(true, { notify: false });
        const exported = exportDesktopVisualConfig(format, options(), 'sonnet');
        expect(decompressConfig(exported)).toMatchObject({ randomVisualizerModes: ['sonnet', 'tilt'], randomVisualizerModePerSong: true });
        store.handleToggleRandomVisualizerModePerSong(false, { notify: false });
        store.handleSetRandomVisualizerModes(['classic']);
        expect(importDesktopVisualConfig(exported, options())).toMatchObject({ ok: true, mode: 'sonnet' });
        expect(useVisualizerSettingsStore.getState()).toMatchObject({ visualizerMode: 'sonnet', randomVisualizerModes: ['sonnet', 'tilt'], randomVisualizerModePerSong: true });
        expect(saved.get('folia.desktop.mode.v1')).toBe('sonnet');
        expect(saved.get('random_visualizer_mode_per_song')).toBe('true');
    });
    it('does not discard the saved random preference when older configs omit it', () => {
        useVisualizerSettingsStore.getState().handleToggleRandomVisualizerModePerSong(true, { notify: false });
        importDesktopVisualConfig(compressConfig({ visualizerMode: 'tilt' }), options());
        expect(useVisualizerSettingsStore.getState().randomVisualizerModePerSong).toBe(true);
    });
});
