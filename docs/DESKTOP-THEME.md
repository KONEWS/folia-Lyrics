# 桌面默认配色、封面取色与设置透明度

桌面默认使用浅蓝 `#66CCFF` 与深蓝 `#4054C7` 配色。只保留原有「主题跟随歌曲封面」开关：开启且封面可读取时使用封面颜色；关闭、无封面或取色失败时恢复默认配色。界面不增加主题名称、主题选择器或第二个开关。

原有封面取色、四张封面的会话缓存、刷新、暂停后保留配色及快速切歌取消逻辑继续使用。封面仍显示；关闭取色时保留弱化的背景色雾。实际取色结果通过原有 `.cover-theme` 标记进入样式，无独立 preset 状态。

桌面取色保留封面主色相。代表色按像素占比排序，跳过近中性的底色后选择最大的有效色块；强调色沿用这个色相，仅调整明暗、饱和度与对比度。刷新改变深浅与亮度，不再把黄色旋转成青蓝互补色。共享生成器新增可选 `preserveCoverHue`，原 Web 的和谐配色默认行为不变。

主设置的「主题与沉浸」区域和歌词样式设置的「通用」页提供「设置透明度」滑块，范围 0–100%，默认显示 85%。按用户指定方向，数值越高越不透明：0% 完全透明，100% 完全不透明。统一控制主设置、视觉/背景/分词设置及原版素材弹窗的底色，文字与按钮保持可读。拖动直接预览材质，松手、失焦或关闭时保存；不修改歌词透明度、动画、时钟或播放页面透明背景开关。实色回退与高对比模式仍强制不透明。

## 颜色职责

核心颜色集中在 `src/desktopLyrics/desktopTheme.ts`。`useCoverTheme` 注入基础 CSS 变量，`desktop-theme.css` 通过语义 Token 管理界面颜色。

| 颜色 | Token | 用途 |
| --- | --- | --- |
| `#66CCFF` | `--theme-primary-light` | 当前逐字高亮、轻量图标强调、悬浮文字、低透明度玻璃边缘、焦点描边、滑块原生强调色、进度渐变明亮端 |
| `#4054C7` | `--theme-primary` | 主操作、按下和选中状态、开关激活填充、进度渐变深色端 |
| `#232A66` | `--theme-primary-dark` | 阴影、极弱背景氛围和轨道深色端 |
| `#27A9D6` | `--theme-accent` | 辅助色 Token，预留给轻量强调 |
| `#0B0D17` | `--theme-bg` | 深蓝黑背景、玻璃底色、透明背景 20% 可读性遮罩、原生非透明回退 |
| `#F4F7FF` | `--theme-text` | 正文、普通图标和歌词主体 |
| `#ADB9D8` | `--theme-muted` | 次级文字和歌词字幕色彩输入 |

背景、边缘和阴影用透明混色，保留原有亚克力与玻璃材质。关闭按钮及错误说明保留红色。禁用状态仍使用原有透明度和行为。系统高对比、强制颜色和减少动画设置沿用原有回退。

默认主题的选中填充使用 52% Ado 色；封面主题继续使用 17% 的封面强调色，以保证浅色封面强调色下的文字对比度。

## 歌词及播放行为

默认 Theme 复制原版主题，只更改名称和颜色，保留字体及动画强度。它通过现有 `buildVisualizerTheme` 流程进入各歌词渲染器，字体、模糊、缩放、逐字时序、翻译、罗马音、滚动和歌词偏移继续使用原有实现。

没有修改歌词渲染器、解析器、时钟、媒体会话或播放控制。当前歌词使用原渲染器的冷白主体与浅蓝逐字强调。深蓝用于界面视觉重心，不强制加入所有歌词字面；`#4054C7` 在深背景上的对比度不适合小号正文。

底部进度依旧只读，保留原位置及频谱更新逻辑。新增 SVG 渐变仅影响已播放段和频谱的颜色，横跨完整轨道，避免随进度长度变化压缩渐变。

## 设置兼容与关闭

封面取色继续由原生 `preferences.coverTheme` 保存与控制，原开关始终可操作。已移除上一版新增的主题 store、localStorage 读取、两个选择器、提示及视觉配置 `desktopThemePreset` / `dtp` 字段。旧 preset 存储与旧导入字段不再控制配色；现有视觉配置导入导出和 Folia Web 默认主题保持原行为。

主设置、歌词视觉设置、背景设置和本曲分词设置统一支持点击面板外空白关闭。下拉菜单和原版素材子窗口内部操作保持独立；存在子窗口时先关闭最上层子窗口，保留父设置、焦点恢复、Escape 顺序和原有素材保存锁。滑块草稿沿用原提交行为。

## 本次源码文件

- 主题颜色与样式：`src/desktopLyrics/desktopTheme.ts`、`desktop-theme.css`、`coverTheme.ts`、`useCoverTheme.ts`。
- 原开关与设置清理：`src/desktopLyrics/ImmersiveSettings.tsx`、`DesktopVisualCommon.tsx`、`useDesktopVisualSettings.ts`。删除 `src/stores/useDesktopThemeStore.ts`。
- 页面及进度接入：`src/desktopLyrics/DesktopLyrics.tsx`、`main.tsx`、`AudioProgress.tsx`、`useDesktopVisualDialogSkin.ts`。
- 配置清理：`src/desktopLyrics/desktopVisualSettingsCodec.ts`、`src/utils/appearanceCodec.ts` 中移除新增 preset 字段。
- 文案：`src/i18n/locales/en.ts`、`src/i18n/locales/zh-CN.ts`。
- 原生背景回退：`native/MainWindow.cs`、`native/WindowAcrylic.cs`。DWM 透明合成所需的 `Color.Black` 保留。
- 空白关闭：`src/desktopLyrics/useDesktopSettingsDismiss.ts`、`ControlPanel.tsx`、`DesktopVisualSettings.tsx`、`DesktopSegmentationSettings.tsx`。
- 设置透明度：`src/stores/useDesktopPanelSettingsStore.ts`、`src/desktopLyrics/DesktopSettingsTransparency.tsx`、`useDesktopSettingsTransparency.ts`；视觉 JSON 字段 `desktopSettingsTransparency` 与短码键 `dst` 支持保存/恢复，旧配置缺失该字段时保留当前数值。
- 本说明：`docs/DESKTOP-THEME.md`。

相关测试文件：`test/desktopCoverTheme.test.ts`、`test/unit/desktop/useCoverTheme.test.ts`、`test/unit/desktop/desktopVisualSettingsCodec.test.ts`、`test/verify-desktop-theme.mjs`、`test/verify-settings-dismiss.mjs`、`test/desktop-select.mjs`、`test/verify-renderers.mjs`、`test/verify-cover-immersion.mjs`、`test/verify-cover-fixture.mjs`、`test/verify-glass-ui.mjs`、`test/verify-settings-refresh.mjs`、`test/verify-selected-controls.mjs`、`test/verify-transparency.mjs`、`test/verify-playback-input.mjs`、`test/verify-background-topbar.mjs`。

封面回归测试通过真实的原有封面取色开关控制配色。透明遮罩断言检查实际主题背景及准确的 20% 透明度。

旧综合脚本在打开设置后再选择歌词样式，触发已有的面板互斥关闭；输入脚本也会先用鼠标侧键触发已有的外部关闭，再把滚轮当成设置内输入检查。这两处测试顺序已对齐当前界面行为，保留原有断言，没有改动媒体控制或面板关闭实现。

原窗口标题栏测试会在弹窗 160ms 入场动画尚未结束时测量位置，产生时序误报；现在等待有限入场动画结束后测量，保留原 0.75px 几何阈值。主操作按下色、关闭按钮红色优先级及浅色封面选中背景的对比度问题已在本次主题中修复。

## 验证方式

使用项目所需的 Node 24+ 和 .NET SDK 10：

```powershell
npm run typecheck
npm run typecheck:desktop
npm run test:desktop
npm run build:desktop
npm run test:desktop:ui
```

主题专项沿用生产构建和现有 WebView 模拟环境：

```powershell
$env:FOLIA_CHECKS_ONLY = 'theme'
$env:FOLIA_UI_OUTPUT = 'test-results/luotianyi-ado-theme'
npm run test:desktop:ui
```

`FOLIA_CHECKS_ONLY=secondary-ui` 执行浅色/深色桌面、默认/封面主题的真实截图文字对比度检查。运行完整 UI 套件前清除 `FOLIA_CHECKS_ONLY`；`FOLIA_UI_OUTPUT` 可指定独立证据目录，避免覆盖已有验证产物。

仓库未配置 lint 脚本。构建存在原有大分块提示，不影响构建成功。浏览器模拟验证覆盖真实页面、歌词样式和控制协议。首轮实机验证时旧版仍在运行，保留了用户窗口；续作时确认旧版已退出，已成功启动本次新包，并通过 Computer Use 检查原生 WebView 页面、当前亚克力/玻璃呈现和真实主题选择器。

当前 Windows 可运行包位于 `release/build-cover-settings-v2/FoliaLyrics.exe`。生成方式保持原项目流程：先运行 `node tools/package-web.mjs`，再发布 `native/FoliaLyrics.csproj`。

## 初次实现验证记录

以下是首次主题实现的验证记录。当前简化后的主题开关与空白关闭行为另在后续复核中记录。

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 全项目 TypeScript 检查 | 通过 | `test-results/theme-typecheck-all.log` |
| 桌面 TypeScript 检查 | 通过 | `npm run typecheck:desktop` |
| 桌面单元测试 | 116 通过，3 跳过 | `test-results/theme-test-desktop.log` |
| 共享视觉配置兼容测试 | 63 通过 | `test-results/theme-test-codec.log` |
| 标准完整 UI 回归 | 13 种歌词样式挂载通过，最终报告记录 227 项检查，控制台及运行错误为空 | `test-results/luotianyi-ado-full-complete/results.json` |
| 主题实际页面专项 | 12 组通过，错误数组为空 | `test-results/luotianyi-ado-theme-verified/desktop-theme-results.json` |
| 二级界面、封面主题及文字对比度 | 15 组通过，28 个实测文字样本，最低 6.40:1 | `test-results/luotianyi-ado-secondary-cover-fixed/secondary-ui-results.json` |
| 播放输入 | 27 组通过 | `test-results/luotianyi-ado-input-verified/playback-input-results.json` |
| 歌词解析 | 11 组、10 个样本通过 | `test-results/luotianyi-ado-parser-verified/parser-formats-results.json` |
| 歌词和窗口布局 | 23 组通过 | `test-results/luotianyi-ado-layout-verified/chrome-layout-results.json` |
| 选中控件 | 7 组通过 | `test-results/luotianyi-ado-selected-verified/selected-controls-results.json` |
| 背景与标题栏 | 8 组通过 | `test-results/luotianyi-ado-background-verified/background-topbar-results.json` |
| 桌面生产构建 | 通过 | `test-results/theme-build.log` |
| Windows x64 独立运行包 | .NET 10 发布通过 | `test-results/theme-native-build.log` |
| 原生 Windows 启动与界面观察 | 新包启动、WebView 页面、玻璃设置面板、默认主题及无播放器禁用态正常 | `test-results/luotianyi-ado-native-verified/native-startup-results.json`、`native-theme-settings.png` |
| lint | 仓库没有 lint 脚本或配置 | `package.json` |

3 个跳过项需要外部在线歌词真实样本，本次环境未提供。原生窗口启动与当前材质已观察确认；当前没有活跃播放器会话，因此真实椒盐音乐的进度、逐字同步及媒体控制尚无法实测。多屏/DPI 和 Windows 透明度、无障碍设置变化也未实测。浏览器回归使用实际生产页面和现有原生消息模拟环境；没有停止用户原先运行的旧版应用。

完整 UI 的 `results.json` 在播放、窗口、玻璃、原版视觉设置、背景、选中态、歌词布局与解析检查全部结束，并断言运行错误为空后才生成；主题和文字对比度专项另行保存。完整证据目录为 `test-results/luotianyi-ado-full-complete`。

首次构建包 SHA-256：`9ED01A45E4F41FC5F1240B0B4C73416D3493EFDD729391A3693ABFA3319EC679`，保存于 `test-results/theme-exe-sha256.json`。

## 单开关与空白关闭复核

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 全项目及桌面 TypeScript | 通过 | `test-results/cover-default-typecheck-all.log`、`cover-default-typecheck-desktop.log` |
| 桌面单元测试 | 113 通过，3 项在线真实样本跳过 | `test-results/cover-default-test-desktop.log` |
| 原封面开关与配色 | 15 项、16 个样本通过，错误为空；另含 11 项外观检查 | `test-results/cover-checkbox-theme/desktop-theme-results.json` |
| 全部设置空白关闭 | 17 项通过，错误与误发媒体命令为空；另含 11 项外观检查 | `test-results/settings-dismiss-verified-final/settings-dismiss-results.json` |
| 播放输入回归 | 27 项通过，错误为空 | `test-results/settings-dismiss-playback-input/playback-input-results.json` |
| 桌面生产构建及 Windows 发布 | 通过 | `test-results/cover-default-build.log`、`cover-default-native-build.log` |
| 最新原生窗口 | 启动、原封面开关、移除额外主题标签及主/背景设置空白关闭通过 | `test-results/cover-default-native-verified/native-startup-results.json` |

关闭专项包含：主设置及菜单层级、外部侧键关闭前数字输入提交、视觉三个页签、字体菜单和输入失焦、滑块拖出面板后提交、六种原版背景、实际 PNG 素材与 IndexedDB 草稿、素材导入菜单/遮罩/Escape、分词未保存草稿取消、关闭后焦点恢复。只作用于桌面宿主，原 Web 设置与原版 ThemedDialog 实现未修改。

当前窗口已切换到更新包并保留打开。当前没有活跃播放器会话，真实椒盐进度与控制的实机验证限制不变。当前包 SHA-256：`0E88FEFB6A2F1D6AE935FAC53D527700F542B456502A9611D92A3FF40DEF5F48`，保存于 `test-results/cover-default-exe-sha256.json`。

## 封面主色与透明度滑块复核

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 全项目及桌面 TypeScript | 通过 | `test-results/settings-opacity-typecheck-all.log`、`settings-opacity-typecheck-desktop.log` |
| 桌面单元测试 | 116 通过，3 项外部在线样本跳过 | `test-results/settings-opacity-desktop-unit.log` |
| 共享生成器与代表色 | 11 通过，包含暖黄/中性背景/少量蓝色细节和色相保持对比度检查 | `test-results/settings-opacity-shared-unit.log` |
| 实际封面开关与主题 | 16 组通过，错误为空，另含 11 项外观检查；实际像素取色及刷新保持暖黄色 | `test-results/cover-hue-ui/desktop-theme-results.json` |
| 设置透明度 | 4 组、15 个材质样本通过，错误为空，另含 11 项外观检查 | `test-results/settings-opacity-ui/settings-transparency-results.json` |
| 全部设置空白关闭 | 17 组通过，错误为空 | `test-results/settings-opacity-dismiss/settings-dismiss-results.json` |
| 刷新、暂停与窄窗口 | 10 组通过，错误为空；保持色相并改变明暗 | `test-results/cover-hue-refresh-verified/settings-refresh-results.json` |
| 桌面构建与 Windows 发布 | 通过 | `test-results/settings-opacity-build.log`、`settings-opacity-native-publish.log` |
| Windows 实机设置 | 新包启动、15% 默认值、0% 实色预览、恢复 15% 与空白关闭通过 | `test-results/settings-opacity-native/native-startup-results.json` |

透明度检查覆盖实际鼠标拖动、拖动中不写入存储、歌词 Theme/行数组/时钟引用稳定、键盘 0%/100%、主/视觉/背景/素材窗口、JSON 与短码恢复、重新加载保存、通用默认重置、实色与高对比回退。旧刷新测试中「至少改变 20° 色相」的断言已改为保持色相并验证亮度或深度差异；设置首行断言同步新增滑块，保留其余交互检查。

新包 SHA-256：`ACF7470B7E12761E58634B793C598E971C8E2DFFB856516404FDE699B8BACCAE`，保存于 `test-results/settings-opacity-exe-sha256.json`。

已将本任务打开的旧预览切换到新包，恢复 15% 透明度并关闭设置，保留运行窗口。实机当前无活跃播放器，黄色封面使用浏览器真实像素提取回归样本验证，未声称已在用户这首歌的原生媒体会话中重放。

## 滑块方向、位置与等待文案调整

保留「设置透明度」名称，将主设置中的滑块移到「主题与沉浸」区域、封面取色开关下方，不再占据主设置首行。滑块显示保存值的反向数值，因此旧的 15% 透明配置显示为 85%，实际材质保持一致；已有存储键与视觉配置格式不变。

等待播放器文案改为「打开支持 Windows 媒体接口的播放器，播放一首歌；也可在设置中选择播放器。」，中英文均删除播放器品牌名称。回归检查同时断言准确文案、主题区域位置、滑块数值与实际不透明度方向、旧配置兼容、保存/恢复和空白关闭。

桌面类型检查及生产构建通过。新的透明度页面专项 4 组（另有 11 项外观检查）和主设置/刷新专项 10 组通过，错误为空：`test-results/settings-opacity-direction/settings-transparency-results.json`、`test-results/settings-opacity-placement/settings-refresh-results.json`。截图 `test-results/settings-opacity-direction/settings-transparency-default.png` 确认滑块位于封面取色开关下，名称仍为「设置透明度」，默认 85%。

更新运行包发布成功：`release/build-cover-settings-v2/FoliaLyrics.exe`。SHA-256 为 `25018DA92C4A8AF2D90D1683E653167E38BF2ADDA2ADC0806A88EAAF2BDA9CC4`，保存于 `test-results/settings-opacity-v2-exe-sha256.json`。
