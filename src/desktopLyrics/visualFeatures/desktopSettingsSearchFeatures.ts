import type { DesktopSettingsSearchEntry } from '../../types/desktopSettingsSearch';
import { VISUALIZER_REGISTRY } from '../../components/visualizer/registry';
import { offeredBeatEffects } from '../../services/beatFx/beatEffects';

// Search destinations for desktop additions; effect metadata follows each lazy renderer's registration.
export const DESKTOP_QUICK_CONTROL_ALIASES = ['快捷参数', '快速参数', 'quick controls'];
const RANDOM_TOGGLE = 'commandPalette.commands.visualizer-toggle-random-per-song.title';

export function buildDesktopFeatureSearchEntries(labelFor: (key: string) => string): DesktopSettingsSearchEntry[] {
    const entries: DesktopSettingsSearchEntry[] = [];
    const add = (section: DesktopSettingsSearchEntry['section'], labelKey: string, keywords: string[], fallbackKey?: string, contextKey?: string) => {
        const entry: DesktopSettingsSearchEntry = {
            key: `${section}.${labelKey}`, label: labelFor(labelKey), section, keywords: [labelKey, ...keywords],
            fallback: fallbackKey && labelFor(fallbackKey), context: contextKey && labelFor(contextKey),
            breadcrumb: `歌词样式设置 · ${{ common: '通用', subtitle: '字幕', visualizer: '歌词动画', background: '背景', main: '设置' }[section]}`,
        };
        entries.push(entry);
        return entry;
    };
    add('common', 'options.uploadCustomFont', ['上传字体', '字体文件', 'upload font', 'woff', 'woff2', 'ttf', 'otf'], 'options.chooseSystemFont');
    add('visualizer', 'desktopVisual.previewTitle', ['独立预览', '示例歌词', '动态缩略图', '暂停预览', 'style preview', 'sample lyrics']);
    add('visualizer', RANDOM_TOGGLE, ['随机样式', 'random style', 'random per song']);
    add('visualizer', 'options.randomPool', ['随机候选', '候选样式', '选择随机池', '参与随机的样式', 'random pool'], RANDOM_TOGGLE);
    add('visualizer', 'options.randomVisualizerReroll', ['重新抽取', '重抽', 'reroll'], RANDOM_TOGGLE);
    add('visualizer', 'options.randomVisualizerSelectAll', ['随机池', '候选样式', 'random pool select all'], RANDOM_TOGGLE, 'options.randomPool');
    add('visualizer', 'options.randomVisualizerCurrentStyle', ['随机池', '当前随机样式', 'random current style'], RANDOM_TOGGLE, 'options.randomPool');

    const videoWords = ['视频背景', '视频层', 'video background', 'video layer'];
    for (const key of ['videoLayerSettings', 'videoLayerEnabled', 'videoLayerLocalFile', 'videoLayerPickFile', 'videoLayerClearFile', 'videoLayerUrl', 'videoLayerOpacity', 'videoLayerFit']) {
        const entry = add('background', `options.${key}`, videoWords,
            ['videoLayerSettings', 'videoLayerEnabled'].includes(key) ? undefined : key === 'videoLayerClearFile' ? 'options.videoLayerPickFile' : 'options.videoLayerEnabled', 'options.videoLayerSettings');
        if (key === 'videoLayerClearFile') entry.fallbacks = [labelFor('options.videoLayerEnabled')];
    }
    const beatWords = ['智能动感', '节拍', '鼓点', 'smart beat', 'beat analysis'];
    for (const key of ['smartBeat', 'smartBeatMode', 'smartBeatOff', 'smartBeatCached', 'smartBeatOn']) {
        add('common', `options.${key}`, beatWords, undefined, 'options.smartBeat');
    }
    add('common', 'desktopVisual.selectBeatAudio', [...beatWords, '选择音频', '本地音频', 'audio source'], undefined, 'options.smartBeat');
    add('common', 'desktopVisual.clearBeatAudio', [...beatWords, '清除音频', '解绑音频'], 'desktopVisual.selectBeatAudio', 'options.smartBeat');
    for (const entry of VISUALIZER_REGISTRY) for (const effect of offeredBeatEffects(entry.beatEffects)) {
        const mode = entry.mode;
        const effectName = labelFor(effect.nameKey);
        const keywords = [...beatWords, '动感效果', 'beat effects', effectName];
        entries.push({ key: `visualizer.${mode}.beat.${effect.id}`, label: effectName, section: 'visualizer', mode, keywords, context: effectName });
        entries.push({ key: `visualizer.${mode}.beat.${effect.id}.strength`, label: labelFor('options.beatEffectStrength'), section: 'visualizer', mode,
            keywords, context: effectName, fallback: effectName });
    }
    return entries;
}
