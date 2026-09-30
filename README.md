# folia-Lyrics

一个基于 Folia 歌词渲染器的 Windows 桌面歌词显示器。项目保留原版歌词舞台和 12 种歌词动效，新增透明亚克力窗口、液态玻璃控制面板、系统媒体会话读取、外部播放器控制和在线歌词匹配。

仓库地址：<https://github.com/KONEWS/folia-Lyrics>

## 这个版本做什么

folia-Lyrics **不会自行播放音乐**。它读取 Windows 当前正在播放的音乐和时间轴，把歌词显示在独立窗口中。音乐仍由椒盐音乐、网易云音乐、QQ 音乐、foobar2000、浏览器或其他播放器负责播放。

支持：

- 读取 Windows System Media Transport Controls（SMTC）当前歌曲、播放状态、位置和时长。
- 暂停、继续、上一首、下一首，并把操作发送回原播放器。
- 读取本地 `.lrc`、`.yrc`、`.qrc`、`.krc`、`.ttml` 和 `.vtt` 歌词文件。
- 在线匹配网易云、QQ 音乐、酷狗和 LRCLIB 歌词，并使用本地缓存减少重复请求。
- 保留 Folia 原版 12 种歌词动效和歌词逐字高亮能力。
- 亚克力背景、液态玻璃按钮、可拖动窗口、时钟和可视化边界效果。
- 播放器暂停后继续保持媒体会话绑定，避免暂停后窗口失去控制。

## 快速开始

### Web 歌词预览

```bash
npm install
npm run dev
```

### Windows 桌面歌词窗口

需要 Windows 10/11、Node.js 24 或更高版本、.NET 8 SDK 和 WebView2 Runtime。

```bash
npm install
npm run typecheck:desktop
npm run build:desktop
build-windows.cmd
```

构建脚本会先构建桌面前端，再构建 `native/FoliaLyrics.csproj`。生成的文件位于 `native/bin/Release/`。

## 验证

```bash
npm run test:desktop
npm run typecheck:desktop
npm run build:desktop
dotnet run --project test/transport-smoke/TransportSmoke.csproj
```

验证项目包括歌词时钟、在线歌词响应解析、媒体控制消息、传输层事件、窗口尺寸和亚克力/玻璃视觉边界。

## 项目结构

| 目录 | 作用 |
| --- | --- |
| `src/components/visualizer` | Folia 原有歌词舞台与 12 种动效 |
| `src/desktopLyrics` | 桌面歌词界面、液态玻璃控制面板和 WebView 桥接 |
| `native` | Windows 媒体会话、歌词扫描、在线歌词和窗口控制 |
| `test` | 前端、传输层和渲染器验证 |
| `public/fonts` | 离线字体，避免桌面端依赖外部字体请求 |

## 设计目标

桌面端只负责“读取并显示”。音频播放、音量、输出设备和播放队列仍由用户选择的播放器控制。歌词匹配失败时，窗口会保留当前歌曲信息并允许重新匹配或加载本地歌词文件。

## 与上游的关系

本项目是从 [chthollyphile/folia-major](https://github.com/chthollyphile/folia-major) 派生的独立版本，继续遵循上游的 AGPL-3.0 许可证。桌面歌词模块、Windows 原生桥接、在线歌词适配、验证脚本和本 README 属于本仓库新增内容。它不是上游官方发行版。

第三方许可证和来源记录见 [`licenses/`](licenses/)、[`ONLINE-SOURCES.md`](ONLINE-SOURCES.md) 和 [`README-DESKTOP.md`](README-DESKTOP.md)。

## 许可证

本项目依据 [AGPL-3.0](LICENSE) 发布。使用在线歌词、封面和音乐资源时，请遵守对应服务条款和版权要求。

