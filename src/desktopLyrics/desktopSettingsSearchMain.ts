import type { DesktopSettingsSearchEntry } from '../types/desktopSettingsSearch';
import zhCN from '../i18n/locales/zh-CN';

// src/desktopLyrics/desktopSettingsSearchMain.ts — destinations and aliases for the desktop host's own controls.
type MainItem = readonly [key: string, label: string, ...keywords: string[]];
const MAIN_ITEMS: MainItem[] = [
  ['transparency', '播放页面透明背景', '透明', 'transparent background', '亚克力', '玻璃'],
  ['click-through', '启用鼠标穿透', '穿透', '恢复鼠标操作', 'click through'],
  ['sync', '歌词同步', '同步', '时间', '延迟', 'lyric sync'],
  ['offset-later', '歌词延后 0.2 秒', '歌词偏移', '延迟', 'offset', '慢'],
  ['offset-earlier', '歌词提前 0.2 秒', '歌词偏移', '提前', 'offset', '快'],
  ['offset-reset', '重置歌词偏移', '时间无偏移', 'offset reset'],
  ['translation', '显示译文', '翻译', 'translation'],
  ['segmentation', '本曲分词', '词组', '分词内容', '保存分词', '恢复自动分词', '复制当前分词', 'segmentation'],
  ['manual-clock', '手动歌词时钟', '播放器没有提供进度', 'manual clock'],
  ['manual-start', '开始计时', '暂停计时', '手动歌词时钟', 'manual clock'],
  ['manual-position', '手动定位秒数', '定位到', '手动歌词时钟', 'manual clock seek'],
  ['player', '播放器', '音乐软件', 'player'],
  ['music-apps', '音乐软件快捷启动', '快捷方式', '绑定', 'music apps'],
  ['music-app-discovery', '自动发现音乐软件', '自动扫描', '微软商店', '椒盐音乐', 'discovery'],
  ['music-app-scan', '扫描音乐软件', '手动扫描', '发现', 'scan apps'],
  ['music-app-add-button', '首页显示添加按钮', '首页', '加号', 'add button'],
  ['music-app-add', '绑定新的音乐软件', '添加音乐软件', '绑定', 'exe', 'bind app'],
  ['music-app-replace', '更换', '更换程序', '替换', '绑定', 'replace app'],
  ['music-app-launch', '启动', '启动音乐软件', '打开音乐软件', 'launch app'],
  ['music-app-remove', '解除绑定', '移除软件', '删除快捷方式', 'unbind app'],
  ['music-app-block', '不再发现', '屏蔽音乐软件', 'block app'],
  ['music-app-unblock', '恢复发现', '解除屏蔽', '已屏蔽的软件', 'unblock app'],
  ['player-source', '选择播放器', '自动跟随正在播放的应用', '媒体会话', 'player source'],
  ['visual-settings', '歌词样式更多设置', '歌词动画', '歌词样式', 'visual settings'],
  ['immersion', '主题与沉浸', '封面主题', '沉浸', 'appearance immersion'],
  ['cover-theme', '主题跟随歌曲封面', '主题色', '封面配色', 'cover theme'],
  ['settings-transparency', '设置透明度', '设置不透明度', '磨砂', '玻璃', 'settings transparency'],
  ['auto-immersive', '闲置时自动进入沉浸模式', '闲置自动沉浸', '隐藏控制栏', '自动隐藏', 'auto immersive'],
  ['immersive-delay', '无操作等待时间', '等待秒数', '闲置时间', '自动沉浸', 'immersive delay'],
  ['bottom-controls', '沉浸时移到底部呼出播放控件', '底部悬停', '播放控制栏', 'bottom hover controls'],
  ['window-sound', '窗口与声音', '窗口', '音频', 'window audio'],
  ['immersive-progress', '沉浸模式显示进度条', '播放进度', 'immersive progress'],
  ['topmost', '窗口置顶', '置顶', 'always on top', 'topmost'],
  ['close-taskbar', '关闭按钮最小化到任务栏', '关闭', '最小化', '任务栏', 'close to taskbar'],
  ['audio', '跟随系统声音变化', '声音响应', '频谱', '声音采集', 'audio reactive'],
  ['online', '在线歌词', '自动匹配', '手动选词', 'online lyrics'],
  ['online-enabled', '自动匹配在线歌词', '联网', '自动歌词', 'online enabled'],
  ['online-sources', '歌词来源', '在线歌词源', 'provider'],
  ['source-qq', 'QQ 音乐', 'qq音乐', 'qq', 'QRC', '启用QQ 音乐歌词源'],
  ['source-kugou', '酷狗音乐', 'kugou', 'KRC', '启用酷狗音乐歌词源'],
  ['source-netease', '网易云音乐', 'netease', 'YRC', '启用网易云音乐歌词源'],
  ['source-lrclib', 'LRCLIB', '社区歌词库', 'lrc lib', '启用LRCLIB歌词源'],
  ['online-title', '在线搜索歌名', '歌名', '标题', '搜索', 'song title'],
  ['online-artist', '在线搜索歌手', '歌手', '艺术家', 'artist'],
  ['online-search', '搜索在线歌词', '搜索', '匹配', 'search lyrics'],
  ['online-reset', '重新自动匹配', '重置匹配', '歌词重新匹配', 'reset matching'],
  ['online-cancel', zhCN.desktopLyrics.onlineOperation.cancel, '取消搜索', '取消下载', '停止请求', 'cancel lyrics', 'quxiao'],
  ['online-results', '在线歌词候选', '歌词结果', '手动选择歌词', '更多在线歌词', 'online results'],
  ['local', '本地歌词库', '本地文件', '本地歌词', 'local lyrics'],
  ['local-folders', '添加音乐目录', '音乐文件夹', '本地目录', 'add folder'],
  ['local-import', '导入歌词', '导入本地文件', 'LRC', 'TTML', 'YRC', 'QRC', 'FIA', 'import lyrics'],
  ['local-rescan', '重新扫描', '本地歌词库', '重新索引', 'rescan library'],
  ['diagnostics', zhCN.desktopLyrics.diagnostics.copy, '诊断', '排查问题', '复制状态', 'diagnostics', 'zhenduan'],
  ['open-logs', zhCN.desktopLyrics.diagnostics.openLogs, '日志', '错误记录', 'log folder', 'rizhi'],
];

const MAIN_GROUPS: readonly (readonly [string, string])[] = [
  ['播放页面', 'transparency click-through'],
  ['歌词同步', 'sync offset-later offset-earlier offset-reset translation segmentation manual-clock manual-start manual-position'],
  ['播放器', 'player music-apps music-app-discovery music-app-scan music-app-add-button music-app-add music-app-replace music-app-launch music-app-remove music-app-block music-app-unblock player-source'],
  ['歌词样式', 'visual-settings'],
  ['主题与沉浸', 'immersion cover-theme settings-transparency auto-immersive immersive-delay bottom-controls'],
  ['窗口与声音', 'window-sound immersive-progress topmost close-taskbar audio'],
  ['在线歌词', 'online online-enabled online-sources source-qq source-kugou source-netease source-lrclib online-title online-artist online-search online-reset online-cancel online-results'],
  ['本地歌词库', 'local local-folders local-import local-rescan'],
  [zhCN.desktopLyrics.diagnostics.title, 'diagnostics open-logs'],
];
const MAIN_FALLBACKS: Record<string, string> = {
  'offset-later': '歌词同步', 'offset-earlier': '歌词同步', 'offset-reset': '歌词同步', segmentation: '歌词同步',
  'manual-start': '手动歌词时钟', 'manual-position': '手动歌词时钟',
  'music-app-replace': '音乐软件快捷启动', 'music-app-launch': '音乐软件快捷启动', 'music-app-remove': '音乐软件快捷启动',
  'music-app-block': '音乐软件快捷启动', 'music-app-unblock': '音乐软件快捷启动',
  'source-qq': '歌词来源', 'source-kugou': '歌词来源', 'source-netease': '歌词来源', 'source-lrclib': '歌词来源',
  'online-results': '在线歌词', 'immersive-delay': '闲置时自动进入沉浸模式',
};

export function buildDesktopMainSearchEntries(): DesktopSettingsSearchEntry[] {
  const groups = new Map(MAIN_GROUPS.flatMap(([label, keys]) => keys.split(' ').map(key => [key, label] as const)));
  return MAIN_ITEMS.map(([key, label, ...keywords]) => ({ key: `main.${key}`, label, section: 'main', keywords,
    breadcrumb: `歌词设置 · ${groups.get(key) ?? '设置'}`, fallback: MAIN_FALLBACKS[key] }));
}

export const DESKTOP_COMMON_SEARCH_KEYS = [
  'desktopVisual.settingsTransparency', 'ui.animationIntensity', 'options.fontFamily', 'desktopVisual.customFontFamily',
  'options.fontFallbackFamilies', 'options.fontWeightAuto', 'options.fontWeight', 'options.fontSize',
  'options.visualizerOpacity', 'desktopVisual.staticMode', 'desktopVisual.segmentation',
  'desktopVisual.configTitle', 'desktopVisual.copyCode', 'options.copyJson', 'desktopVisual.exportJson',
  'desktopVisual.chooseConfig', 'desktopVisual.configInput', 'desktopVisual.applyConfig',
] as const;

export const DESKTOP_SUBTITLE_SEARCH_KEYS = [
  'desktopVisual.showTranslation', 'options.subtitleContentMode', 'options.subtitleOverlayBackground',
  'options.subtitleUpcomingLyricsBlur', 'options.subtitleFontInheritsLyrics', 'desktopVisual.harmonySubtitle',
  'options.harmonySubtitleBackground', 'options.subtitleFontScale', 'options.fontFamily',
  'desktopVisual.customFontFamily', 'options.fontFallbackFamilies', 'options.fontWeightAuto', 'options.fontWeight',
  'options.subtitleOverlayOpacity',
] as const;
