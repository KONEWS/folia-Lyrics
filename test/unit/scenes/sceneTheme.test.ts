import { describe, expect, it } from 'vitest';
import { checkSceneManifest } from '../../../src/components/scenes/definition';
import cinema from '../../../src/components/scenes/cinema/entry';
import { surfaceRendererTheme, withLyricFonts } from '../../../src/components/scenes/engine/sceneTheme';
import { DEFAULT_THEME } from '../../../src/services/baseThemes';
import type { DualTheme, Theme } from '../../../src/types';

const theme = (name: string, accentColor: string, backgroundColor: string): Theme => ({
    name, backgroundColor, primaryColor: '#111111', accentColor, secondaryColor: '#222222', fontStyle: 'sans', animationIntensity: 'normal',
});
const AI: DualTheme = { light: theme('ai light', '#ff0000', '#ffffff'), dark: theme('ai dark', '#00ff00', '#000000') };
const CUSTOM: DualTheme = { light: theme('custom light', '#0000ff', '#eeeeee'), dark: theme('custom dark', '#ffff00', '#101010') };
const FONTS: Pick<Theme, 'fontStyle' | 'fontFamily' | 'fontWeight' | 'fontFamilyStack'> = { fontStyle: 'serif', fontFamily: 'Lyric Font', fontWeight: 600, fontFamilyStack: ['Lyric Font'] };

describe("the scene's song colours", () => {
    it.each([AI, CUSTOM])('keeps the supplied colour pair and shares the user lyric fonts', (source) => {
        const pair = withLyricFonts(source, { ...DEFAULT_THEME, ...FONTS });
        expect(pair.dark.accentColor).toBe(source.dark.accentColor);
        expect(pair.light.accentColor).toBe(source.light.accentColor);
        expect(pair.dark.fontFamily).toBe('Lyric Font');
        expect(pair.light.fontWeight).toBe(600);
    });
});

describe("a borrowed renderer's theme", () => {
    const pageIn = (isDaylight: boolean) => ({ theme: AI[isDaylight ? 'light' : 'dark'], subtitleTheme: AI[isDaylight ? 'light' : 'dark'], isDaylight });
    const song = { theme: AI, subtitleTheme: AI };

    it('on a dark surface with only the lyrics, does not change with the app mode', () => {
        const inLight = surfaceRendererTheme(pageIn(true), song, { background: false, tone: 'dark' });
        const inDark = surfaceRendererTheme(pageIn(false), song, { background: false, tone: 'dark' });
        expect(inLight).toEqual(inDark);
        expect(inLight).toEqual({ theme: song.theme.dark, subtitleTheme: song.subtitleTheme.dark, isDaylight: false });
        expect(surfaceRendererTheme(pageIn(false), song, { background: false, tone: 'light' }).isDaylight).toBe(true);
    });

    it("on a surface with the user's background, is the user's page as it is", () => {
        expect(surfaceRendererTheme(pageIn(true), song, { background: true, tone: 'dark' })).toEqual(pageIn(true));
        expect(surfaceRendererTheme(pageIn(false), song, { background: true, tone: 'dark' })).toEqual(pageIn(false));
    });
});

describe('surface tone in the manifest', () => {
    it("the hall's manifest passes, and a tone other than dark or light is refused", () => {
        expect(checkSceneManifest(cinema.manifest)).toEqual([]);
        const bad = { ...cinema.manifest, surfaces: [{ id: 'screen', aspect: 2, tone: 'grey' }] };
        expect(checkSceneManifest(bad)).toEqual([`surface "screen" tone is not 'dark' or 'light'`]);
    });
});
