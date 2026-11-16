import { assertBuiltinSceneList, BUILTIN_SCENE_IDS, sceneIdKind } from '../../types/sceneIds';
import { checkSceneManifest, type SceneDefinition, type SceneEntryModule } from './definition';
import { useSceneSettingsStore } from './settings/useSceneSettingsStore';

// src/components/scenes/registry.ts
// 场景名单：仅由 import.meta.glob 从 ./<id>/entry.ts 发现随安装包提供的内建场景。
// 名单只读清单，不加载场景代码（load 在第一次显示时才调）。

type SceneModules = Record<string, SceneEntryModule>;

/** The built-in scenes found in their entry folders; throws on a list or manifest that does not hold. */
export const buildBuiltinScenes = (modules: SceneModules, declared: readonly string[] = BUILTIN_SCENE_IDS): SceneDefinition[] => {
    const scenes = Object.entries(modules).map(([path, module]) => {
        const definition = module.default;
        if (!definition) throw new Error(`[SceneRegistry] Missing default export in ${path}`);
        const folder = path.split('/').at(-2);
        const { id } = definition.manifest;
        if (folder !== id) throw new Error(`[SceneRegistry] ${path} declares id "${id}", its folder is "${folder}"`);
        if (sceneIdKind(id) !== 'builtin') throw new Error(`[SceneRegistry] "${id}" is no built-in scene id (see src/types/sceneIds.ts)`);
        const problems = checkSceneManifest(definition.manifest);
        if (problems.length > 0) throw new Error(`[SceneRegistry] ${path}: ${problems.join('; ')}`);
        return definition;
    });
    assertBuiltinSceneList(scenes.map(scene => scene.manifest.id), declared);
    return scenes;
};

const byOrder = (left: SceneDefinition, right: SceneDefinition) => (left.manifest.order ?? 0) - (right.manifest.order ?? 0);
const scenes = buildBuiltinScenes(import.meta.glob<SceneEntryModule>('./*/entry.ts', { eager: true })).sort(byOrder);

export const listScenes = (): readonly SceneDefinition[] => scenes;

export const getScene = (id: string | null | undefined): SceneDefinition | null =>
    (id ? scenes.find(scene => scene.manifest.id === id) : undefined) ?? null;

/** Built-in scene declarations are stable and never load their renderer until selected. */
export const useSceneList = listScenes;

/** The selected built-in scene, or null for the plain lyrics. */
export const useChosenScene = (): SceneDefinition | null => {
    const sceneId = useSceneSettingsStore(state => state.sceneId);
    return getScene(sceneId);
};
