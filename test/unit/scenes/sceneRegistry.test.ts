import { describe, expect, it } from 'vitest';
import { checkSceneManifest, defineScene, type SceneManifest } from '../../../src/components/scenes/definition';
import { buildBuiltinScenes, getScene, listScenes } from '../../../src/components/scenes/registry';
import { assertBuiltinSceneList, sceneIdKind } from '../../../src/types/sceneIds';

// test/unit/scenes/sceneRegistry.test.ts
// The scene id rules, the manifest check and the registry's start-up and runtime checks.

const manifest = (id: string, patch: Partial<SceneManifest> = {}): SceneManifest => ({
    format: 1,
    engine: '^1.0',
    id,
    version: '1.0.0',
    name: { en: id },
    lyrics: { style: 'overlay' },
    background: { host: 'none' },
    quality: { default: 'low', presets: { low: {}, medium: {}, high: {} } },
    ...patch,
});
const scene = (id: string, patch?: Partial<SceneManifest>) => defineScene({ manifest: manifest(id, patch), load: async () => () => ({ frame: () => {}, dispose: () => {} }) });

describe('scene ids', () => {
    it('accepts bundled id syntax and refuses extension ids', () => {
        expect(sceneIdKind('cinema')).toBe('builtin');
        expect(sceneIdKind('mod:my-mod:rooftop')).toBeNull();
        expect(sceneIdKind('pkg:rooftop')).toBeNull();
        expect(sceneIdKind('kit')).toBeNull();
        expect(sceneIdKind('Cinema')).toBeNull();
        expect(sceneIdKind('mod:rooftop')).toBeNull();
        expect(sceneIdKind('pkg:')).toBeNull();
        expect(sceneIdKind(3)).toBeNull();
    });

    it('checks the declared list against the folders found', () => {
        expect(() => assertBuiltinSceneList(['cinema'], ['cinema'])).not.toThrow();
        expect(() => assertBuiltinSceneList(['cinema'], [])).toThrow(/缺少 cinema/);
        expect(() => assertBuiltinSceneList([], ['cinema'])).toThrow(/多出 cinema/);
    });
});

describe('manifest check', () => {
    it('passes a good manifest and names what is wrong with a bad one', () => {
        expect(checkSceneManifest(manifest('cinema'))).toEqual([]);
        expect(checkSceneManifest(manifest('cinema', { engine: '^2.0' }))).toHaveLength(1);
        expect(checkSceneManifest(manifest('cinema', { lyrics: { style: { surface: 'screen' } } }))).toEqual(['surface "screen" is not in surfaces']);
        expect(checkSceneManifest(manifest('cinema', {
            surfaces: [{ id: 'screen', aspect: 1.85 }],
            lyrics: { style: { surface: 'screen' } },
        }))).toEqual([]);
        expect(checkSceneManifest({ ...manifest('cinema'), format: 2 })).toHaveLength(1);
        expect(checkSceneManifest(null)).toHaveLength(1);
    });

    it('survives a trip through JSON unchanged', () => {
        const written = manifest('cinema', { surfaces: [{ id: 'screen', aspect: 1.85 }], lyrics: { style: { surface: 'screen' }, exclude: ['still'] } });
        expect(JSON.parse(JSON.stringify(written))).toEqual(written);
    });
});

describe('scene registry', () => {
    it('builds the built-in list from entry folders, and refuses a folder that does not match', () => {
        expect(buildBuiltinScenes({ './cinema/entry.ts': { default: scene('cinema') } }, ['cinema'])).toHaveLength(1);
        expect(() => buildBuiltinScenes({ './hall/entry.ts': { default: scene('cinema') } }, ['cinema'])).toThrow(/folder/);
        expect(() => buildBuiltinScenes({ './kit/entry.ts': { default: scene('kit') } }, ['kit'])).toThrow(/no built-in scene id/);
        expect(() => buildBuiltinScenes({ './cinema/entry.ts': { default: scene('cinema') } }, [])).toThrow(/缺少/);
    });

    it('only discovers the bundled cinema', () => {
        expect(listScenes().map(entry => entry.manifest.id)).toEqual(['cinema']);
        expect(getScene('cinema')?.manifest.id).toBe('cinema');
        expect(getScene('mod:demo:room')).toBeNull();
    });
});
