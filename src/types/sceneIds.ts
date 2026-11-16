// Built-in scene ids shared by desktop settings and the lazy scene registry.
export const BUILTIN_SCENE_IDS = ['cinema'] as const satisfies readonly string[];

export const SCENE_BOOLEAN_SETTING_KEYS = { cinema: ['houseLights', 'curtainsOnPause'] } as const;

export type BuiltinSceneId = (typeof BUILTIN_SCENE_IDS)[number];

// scenes/ 下的这些目录不是场景（宿主、工具箱、设置……），不能拿来当内建场景 id。
export const RESERVED_SCENE_DIR_NAMES: readonly string[] = ['engine', 'kit', 'packages', 'settings', 'editor'];

const BUILTIN_ID = /^[a-z][a-zA-Z0-9]*$/;
export type SceneIdKind = 'builtin';

/** Only bundled scenes can be selected by the desktop app. */
export const sceneIdKind = (id: unknown): SceneIdKind | null =>
    typeof id === 'string' && BUILTIN_ID.test(id) && !RESERVED_SCENE_DIR_NAMES.includes(id) ? 'builtin' : null;

const BUILTIN_SCENE_SET: ReadonlySet<string> = new Set(BUILTIN_SCENE_IDS);
export const isBuiltinSceneId = (id: unknown): id is BuiltinSceneId =>
    typeof id === 'string' && BUILTIN_SCENE_SET.has(id);
export const isSceneId = isBuiltinSceneId;

/** The registry's start-up check: the entry folders it found against the list above. */
export const assertBuiltinSceneList = (discovered: readonly string[], declared: readonly string[] = BUILTIN_SCENE_IDS): void => {
    const missing = discovered.filter(id => !declared.includes(id));
    const stale = declared.filter(id => !discovered.includes(id));
    if (missing.length === 0 && stale.length === 0) return;
    throw new Error(
        '[SceneRegistry] src/types/sceneIds.ts 的 BUILTIN_SCENE_IDS 与 scenes/*/entry.ts 不一致：'
        + (missing.length > 0 ? ` 缺少 ${missing.join(', ')}；` : '')
        + (stale.length > 0 ? ` 多出 ${stale.join(', ')}；` : ''),
    );
};
