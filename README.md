# folia-Lyrics

一个基于 Folia 歌词渲染器的 Windows 桌面歌词显示器。项目保留原版歌词舞台和 13 种歌词动效，新增透明亚克力窗口、液态玻璃控制面板、系统媒体会话读取、外部播放器控制和在线歌词匹配。

仓库地址：<https://github.com/KONEWS/folia-Lyrics>

## 这个版本做什么

folia-Lyrics **不会自行播放音乐**。它读取 Windows 当前正在播放的音乐和时间轴，把歌词显示在独立窗口中。音乐仍由椒盐音乐、网易云音乐、QQ 音乐、foobar2000、浏览器或其他播放器负责播放。

支持：

- 读取 Windows Global System Media Transport Controls（GSMTC）当前歌曲、播放状态、位置和时长。
- 暂停、继续、上一首、下一首，并把操作发送回原播放器。
- 读取音乐内嵌歌词及本地 `.lrc`、`.yrc`、`.qrc`、`.ttml`、`.fia` 文件；在线酷狗 KRC 由适配层解码。本地加密容器需先转换。
- 在线匹配网易云、QQ 音乐、酷狗和 LRCLIB 歌词，并使用本地缓存减少重复请求。
- 保留 Folia 原版 13 种动态歌词样式，包括绘光 Lumiere；上游注册表另含 still 静止模式，桌面设置仅列出动态样式并自动计数。逐字高亮依赖歌词已有的时间轴，普通逐行 LRC 不具备精准逐字时间。
- 亚克力背景、液态玻璃按钮、可拖动窗口、时钟和可视化边界效果。
- 播放器暂停后继续保持媒体会话绑定，避免暂停后窗口失去控制。

## 快速开始

### Windows 桌面歌词窗口

目标系统为 Windows 11 x64；原生亚克力需要 Windows 11 22H2（22621）或更新版本并开启系统透明效果，其他情况下使用界面回退。

构建需要 Node.js 24+、.NET SDK 10；运行界面需要 Microsoft Edge WebView2 Runtime。发布包自带 .NET 运行时。

解压完整源码后，运行 `build-windows.cmd`。它使用锁文件安装依赖、检查桌面类型、构建前端并发布原生宿主，输出为 `release/win-x64/FoliaLyrics.exe`。

### 仅预览桌面界面

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm exec vite -- --config vite.desktop.config.ts --open /desktop.html
```

浏览器预览没有真实 Windows 媒体会话、文件对话框或原生亚克力；这些功能需在 Windows EXE 中使用。

## 验证

```bash
npm run test:desktop
npm run typecheck:desktop
npm run build:desktop
npm run test:desktop:ui
dotnet run --project test/transport-smoke/TransportSmoke.csproj
```

本次验证范围与限制见 `VALIDATION.md`，历史记录不代表当前构建已通过。

验证项目包括歌词时钟、在线歌词响应解析、媒体控制消息、传输层事件、窗口尺寸和亚克力/玻璃视觉边界。

## 项目结构

| 目录 | 作用 |
| --- | --- |
| `src/components/visualizer` | Folia 原有歌词舞台与 13 种动效 |
| `src/desktopLyrics` | 桌面歌词界面、液态玻璃控制面板和 WebView 桥接 |
| `native` | Windows 媒体会话、歌词扫描、在线歌词和窗口控制 |
| `test` | 前端、传输层和渲染器验证 |
| `public/fonts` | 离线字体，避免桌面端依赖外部字体请求 |

## 设计目标

桌面端只负责“读取并显示”。音频播放、音量、输出设备和播放队列仍由用户选择的播放器控制。歌词匹配失败时，窗口会保留当前歌曲信息并允许重新匹配或加载本地歌词文件。

## 与上游的关系

桌面宿主版本为 0.4.2；上游源码基线为 v0.7.11（`6fe68d89abb7031eb266d71fda01b36a0fa0573e`），两者版本号独立。

本项目是从 [chthollyphile/folia-major](https://github.com/chthollyphile/folia-major) 派生的独立版本，继续遵循上游的 AGPL-3.0 许可证。桌面歌词模块、Windows 原生桥接、在线歌词适配、验证脚本和本 README 属于本仓库新增内容。它不是上游官方发行版。

第三方许可证和来源记录见 [`licenses/`](licenses/)、[`ONLINE-SOURCES.md`](ONLINE-SOURCES.md) 和 [`README-DESKTOP.md`](README-DESKTOP.md)。

## 许可证

本项目依据 [AGPL-3.0](LICENSE) 发布。使用在线歌词、封面和音乐资源时，请遵守对应服务条款和版权要求。

