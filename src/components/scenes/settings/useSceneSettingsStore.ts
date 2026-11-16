import { create } from 'zustand';
import { getStoredString, removeStoredKey, setStoredString } from '../../../stores/storagePrimitives';
import { isSceneId, SCENE_BOOLEAN_SETTING_KEYS } from '../../../types/sceneIds';
import type { SceneQualityPreset } from '../definition';

// src/components/scenes/settings/useSceneSettingsStore.ts
// 场景的设置：现在选的是哪个场景（null = 普通播放页），每个场景各自的画质档、座位和设置值。
// 声线追踪的开关和耳机/音箱在 useSoundTracingStore.ts。
// 存储键发布后不改名：`scene_id`、`scene_options`。
// @note 场景设置不进外观配置码的导入导出：配置码也用于 web 版 OBS 链接，只加 OBS 页面看得到的（用户 2026-11-08 定），
// OBS 页面不挂场景。

export const SCENE_ID_KEY = 'scene_id';
export const SCENE_OPTIONS_KEY = 'scene_options';

export interface SceneOptions {
    quality?: SceneQualityPreset;
    /** The seat anchor's id. */
    viewpoint?: string;
    /** The values of the manifest's settings table, by key. */
    values?: Record<string, string | number | boolean>;
}

export type SceneOptionsById = Partial<Record<string, SceneOptions>>;


const QUALITIES: readonly string[] = ['low', 'medium', 'high'];
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export const sanitizeSceneId = (value: unknown): string | null => (isSceneId(value) ? value : null);

/** Keeps only what the store understands from a stored or imported options object. */
export const sanitizeSceneOptions = (value: unknown): SceneOptionsById => {
    if (!isRecord(value)) return {};
    const result: SceneOptionsById = {};
    for (const [id, raw] of Object.entries(value)) {
        if (!isSceneId(id) || !isRecord(raw)) continue;
        const options: SceneOptions = {};
        if (typeof raw.quality === 'string' && QUALITIES.includes(raw.quality)) options.quality = raw.quality as SceneQualityPreset;
        if (typeof raw.viewpoint === 'string' && /^R[1-9]\d{0,2}-[1-9]\d{0,2}$/.test(raw.viewpoint)) options.viewpoint = raw.viewpoint;
        if (isRecord(raw.values)) {
            const values = SCENE_BOOLEAN_SETTING_KEYS[id]
                .filter(key => Object.hasOwn(raw.values as object, key) && typeof (raw.values as Record<string, unknown>)[key] === 'boolean')
                .map(key => [key, (raw.values as Record<string, unknown>)[key]]);
            if (values.length > 0) options.values = Object.fromEntries(values) as SceneOptions['values'];
        }
        result[id] = options;
    }
    return result;
};

const readStoredOptions = (): SceneOptionsById => {
    try {
        return sanitizeSceneOptions(JSON.parse(getStoredString(SCENE_OPTIONS_KEY, '{}')));
    } catch {
        return {};
    }
};

const saveSceneId = (sceneId: string | null) => (sceneId ? setStoredString(SCENE_ID_KEY, sceneId) : removeStoredKey(SCENE_ID_KEY));
const saveOptions = (options: SceneOptionsById) => setStoredString(SCENE_OPTIONS_KEY, JSON.stringify(options));

interface SceneSettingsState {
    sceneId: string | null;
    sceneOptions: SceneOptionsById;
    /** Bumped by the scene-reload command: the host loads the scene again. Not stored. */
    reloadToken: number;
    setSceneId: (sceneId: string | null) => void;
    setSceneOptions: (sceneId: string, patch: Partial<SceneOptions>) => void;
    reloadScene: () => void;
}

export const useSceneSettingsStore = create<SceneSettingsState>((set, get) => ({
    sceneId: sanitizeSceneId(getStoredString(SCENE_ID_KEY, '')),
    sceneOptions: readStoredOptions(),
    reloadToken: 0,
    setSceneId: (value) => {
        const sceneId = sanitizeSceneId(value);
        if (get().sceneId === sceneId) return;
        saveSceneId(sceneId);
        set({ sceneId });
    },
    setSceneOptions: (sceneId, patch) => {
        if (!isSceneId(sceneId)) return;
        const current = get().sceneOptions;
        const next = sanitizeSceneOptions({ ...current, [sceneId]: { ...current[sceneId], ...patch } });
        if (JSON.stringify(next) === JSON.stringify(current)) return;
        saveOptions(next);
        set({ sceneOptions: next });
    },
    reloadScene: () => set(state => ({ reloadToken: state.reloadToken + 1 })),
}));
