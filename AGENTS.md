# Project Skills

本分支只维护 Windows .NET 桌面歌词程序。联网功能仅保留歌词搜索、下载和匹配；不重新引入登录、在线音乐播放、云同步、更新、远程控制、扩展或网页部署。

## 代码定位

先读 `docs/CODEMAP.md`，再用 `rg` 定位符号；有歧义时使用 `dev/mcp/ts-code-map/cli.mjs`。`src/README.md` 描述当前入口，根目录 README 与 `README-DESKTOP.md` 描述构建和运行边界。

- `native/`：Windows 宿主、媒体会话、外部播放器控制、文件和窗口管理。
- `native/Online/OnlineLyrics.cs`：歌词匹配门面；同目录各 provider 负责平台请求及响应标准化，`OnlineHttp.cs` 负责唯一的 HTTP 传输。
- `src/desktopLyrics/`：桌面界面、时钟和原生消息桥；入口文件只做装配，新行为放到相邻功能模块。
- `src/components/visualizer/`：歌词样式、背景、运行时及设置预览。
- `src/utils/lyrics/`、`src/workers/`：歌词解析、时序、分词与本地分析 worker。
- `src/services/analysis/`：用户选择的本地音频分析及包内模型读取。

## 开发规范

### 目录和边界

- 一个功能的代码放在一起。先平铺，超过约 15 个文件后再按职责分目录，不提前建立空目录。
- 平台的规则留在平台目录；新歌词平台放在 `native/Online/` 的独立 provider，并通过现有门面接入。
- 歌词样式和背景放各自的 `entry.tsx`，由 registry 自动发现；不要在桌面入口添加样式分支。renderer 使用 `React.lazy`，注册表只发现声明。
- `stores`、`utils`、`types`、`services` 不在运行时依赖界面组件；`utils` 不依赖 hooks 或 stores；types 不依赖实现。既有 tuning 注册表的路径约定保持不变。
- 渲染界面只经 `src/desktopLyrics/bridge.ts` 的统一消息协议访问原生宿主。不得添加 Node/Electron 或直接调用音乐平台接口的旁路。
- 界面只读取安装包、内存资源及宿主授权的本地视频；外网请求必须留在原生歌词适配器中，保留 CSP 与 `WindowNetwork.cs` 的限制。

### 命名、格式和注释

- React 组件文件大写开头，其他 TypeScript 文件小驼峰；C# 沿用现有类型命名。hook 以 `use` 开头，zustand store 叫 `use…Store`。
- TypeScript 开启 strict，使用 4 个空格、单引号、LF 换行，文件末尾留一个换行。
- 不主动移除注释；没有明确指令不修改、删除或翻译 `@note`。新文件在导入行后写一行用途说明，复杂函数写一句用途说明。
- 跨功能契约放 `src/types.ts` 或 `src/types/`，只服务一个功能的类型留在功能目录。

### 界面和本地数据

- 设置控件复用 `src/components/modal/settings/kit/`；桌面下拉使用 `src/desktopLyrics/DesktopSelect.tsx`，不使用系统 `<select>`。图标使用 `lucide-react`。
- 界面文案通过 i18n；同时更新 `src/i18n/locales/en.ts`、`zh-CN.ts`、`in.ts`。繁中由构建插件从简中生成。
- 外观设置接入桌面配置导入导出与设置搜索；复用已有字体、文本测量、歌词时序、颜色和弹窗工具。
- 设置使用对应 zustand store 和 `storagePrimitives.ts`，不要在组件里新建一套持久化读写。原生设置使用现有 Preferences 和原子写入工具。
- 不改名已发布的存储键、IndexedDB 名称、缓存前缀和原生数据文件。删除已取消功能的接口时，不清空其他本地设置、歌词、素材或分析记录。
- 渲染高频路径使用现有 MotionValues/runtime；RAF、ResizeObserver 和每帧回调不写 React state，离散更新需要相等保护及清理。

### 日志

- 界面使用 `console.log` / `info` / `warn` / `error`，行首写 `[模块名]`；原生异常使用 `DataFiles.Log`。
- 记录影响结果的决定，保留原始错误和调用栈，不只记录 message。不要记录密码、cookie、token 或完整音频内容。

### 测试和生成文件

- `npm run typecheck` 或 `npm run typecheck:desktop` 检查 TypeScript；`npm run test:unit` 跑保留的歌词、渲染器与桌面逻辑测试，`npm run test:desktop` 跑桌面子集。
- 单测放 `test/unit/<区域>/`，不放 `src/`。原生离线检查沿用 `test/*-smoke/` 与 `test/lyric-performance/`。
- 浏览器行为使用 `test/verify-desktop-*.mjs` 等现有脚本；真实 WebView 视频与外部请求拦截由 `test/video-layer-webview/` 验证。
- 不默认运行完整发布打包。有热加载服务时优先看报错、跑最小测试；只有涉及资源依赖、构建或原生集成时才做对应构建。
- `docs/CODEMAP.md` 由 `npm run codemap` 生成，不手改；`native/web-assets.zip`、`web-assets.sha256` 和 `dist-desktop/` 是生成物。
- 版本以 `native/FoliaLyrics.csproj` 为准；修改版本后同步 package 与桌面文档，运行 `npm run check:desktop-version`。

## 项目内 skills

按需读取 `skills/<skill-name>/SKILL.md`。其中保留的上游历史示例只用于理解原有设计；当前路径、可用脚本和宿主能力以本文件、README 和 CODEMAP 为准。

- `codebase-navigation`：源码图、符号与依赖定位。
- `file-modularization`：按功能放代码、大小警戒和路径约定。
- `testing-strategy`：选择最小验证范围。
- `readme-reference`：从 README 取上下文并对照实现。
- `frontend-runtime-guardrails`：动画、时钟和 React 更新频率。
- `reuse-project-utilities`：现有控件、测量、字体、颜色及歌词工具。
- `settings-feature-integration`：设置的搜索和导入导出。

## 沟通

回答问题直接给结论。发现潜在 bug 或不合理设计时，直接指出问题和建议，不添加无关的评价。
