# folia-Lyrics

让你喜欢的播放器，配上一个好看的桌面歌词窗口。

folia-Lyrics 基于 [Folia](https://github.com/chthollyphile/folia-major) 的歌词渲染器，保留了原版的 13 种动态歌词样式，包括绘光 Lumiere。你照常用椒盐音乐、网易云音乐、QQ 音乐、foobar2000 或浏览器听歌，它通过 Windows 媒体会话读取歌曲和播放进度，把歌词放在独立窗口里。

**它本身不播放音乐。** 暂停、继续和切歌会交给当前绑定的播放器执行；播放器能否被识别、进度是否准确，取决于它向 Windows 提供的媒体会话信息。

## 听歌时能做什么

窗口可以置顶，也可以全屏。喜欢桌面背景的话，可以打开透明背景；想专心看歌词，就隐藏控制栏，或让窗口在闲置后自动进入沉浸模式。鼠标移到顶部或底部，能分别唤出对应的控件。

界面会从歌曲封面中取色，让玻璃控制栏、进度频谱和歌词动效使用同一套配色。想换个感觉，可以点顶栏的“刷新主题色”。底部频谱跟随 Windows 默认输出设备的声音变化。

0.4.30 继续把桌面端的等待和切歌路径拆开处理：窗口先连接播放器，歌词字体、封面和歌词匹配在后台准备，封面晚一点到也不会挡住歌曲信息。频谱静音后会自然收回，音频设备维护、在线歌词缓存和本地歌词库保存移出界面线程，操作时更少出现短暂停顿。

歌词会优先从本地查找，也可以在线匹配网易云、QQ 音乐、酷狗和 LRCLIB。没找到合适的版本时，可以手动选择搜索结果，或加载自己的歌词文件。

- 支持音乐内嵌歌词和本地 `.lrc`、`.yrc`、`.qrc`、`.ttml`、`.fia` 文件。在线酷狗 KRC 由适配层解码，本地加密容器需要先转换。
- 在线歌词有本地缓存，减少同一首歌的重复请求。
- 逐字高亮需要歌词文件自带逐字时间轴，普通逐行 LRC 只能按行同步。
- 暂停时保持当前播放器绑定，方便继续播放和切歌。

## 先用起来

面向 Windows 11 x64。原生亚克力效果需要 Windows 11 22H2（22621）或更新版本，并开启系统透明效果；不满足条件时，界面会使用回退效果。

当前版本是 [0.4.30](https://github.com/KONEWS/folia-Lyrics/releases/tag/desktop-v0.4.30)。从 Releases 下载 Windows x64 包，解压后运行 `FoliaLyrics.exe`，再打开播放器播放一首歌。运行界面需要 Microsoft Edge WebView2 Runtime，发布包自带 .NET 运行时。

窗口没显示歌词时，先确认选中了正在播放的播放器，再尝试重新匹配或加载本地歌词。某些播放器没有公开媒体会话，或没有提供完整进度，这种情况下自动同步会受到限制。

### 常用操作

以下播放快捷操作在歌词窗口获得焦点时生效：

| 操作 | 效果 |
| --- | --- |
| 空格 | 暂停 / 继续 |
| ← / → | 上一首 / 下一首 |
| 鼠标后退 / 前进侧键 | 上一首 / 下一首 |
| 在歌词区域滚动滚轮 | 调整系统音量，每档 2 个百分点 |
| Esc | 退出全屏，或在窗口模式下关闭设置、退出沉浸 |
| Ctrl + Alt + L | 解除鼠标穿透并恢复操作 |

输入框、设置面板和下拉菜单保留各自的键盘与滚动操作。开启鼠标穿透后，也可以双击托盘图标恢复交互。设置里可以选择让关闭按钮将程序最小化到任务栏；托盘“退出”和 Alt+F4 仍会退出程序。

## 从源码构建

准备 Node.js 24+ 和 .NET SDK 10，然后在完整源码目录运行：

```bat
build-windows.cmd
```

脚本会按锁文件安装依赖、检查桌面 TypeScript、构建界面并发布 Windows 宿主。完成后，程序位于：

```text
release/win-x64/FoliaLyrics.exe
```

只想看看界面，可以运行浏览器预览：

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm exec vite -- --config vite.desktop.config.ts --open /desktop.html
```

浏览器预览可用于调整界面。真实的 Windows 媒体会话、文件对话框和原生亚克力效果需要在 EXE 中体验。

## 开发与验证

桌面端常用检查：

```bash
npm run test:desktop
npm run typecheck:desktop
npm run build:desktop
npm run test:desktop:ui
dotnet run --project test/transport-smoke/TransportSmoke.csproj
```

各版本的验证范围和已知限制记录在 [VALIDATION.md](VALIDATION.md)。浏览器测试使用模拟 WebView，真实播放器控制和 Windows 窗口行为仍需要实机确认。

| 目录 | 内容 |
| --- | --- |
| `src/desktopLyrics` | 桌面歌词界面、控制面板与 WebView 桥接 |
| `native` | Windows 宿主、媒体会话、歌词查找与窗口控制 |
| `src/components/visualizer` | Folia 原版歌词舞台与动态样式 |
| `test` | 前端、传输层和渲染器测试 |
| `public/fonts` | 桌面端使用的离线字体 |

更多桌面功能和版本变化见 [README-DESKTOP.md](README-DESKTOP.md) 与 [CHANGELOG-DESKTOP.md](CHANGELOG-DESKTOP.md)。

## 关于这个分支

这是从 [chthollyphile/folia-major](https://github.com/chthollyphile/folia-major) 派生的独立项目。感谢上游提供歌词渲染器和视觉效果；这个分支主要加入 Windows 桌面宿主、外部播放器连接、在线歌词匹配，以及围绕桌面使用的界面和操作。

当前桌面宿主版本为 **0.4.30**，上游源码基线为 **v0.7.11**（`6fe68d89abb7031eb266d71fda01b36a0fa0573e`）。两套版本号独立，本项目不是上游官方发行版。

项目继续使用 [AGPL-3.0](LICENSE) 许可证。第三方许可证见 [licenses/](licenses/)，在线资源来源见 [ONLINE-SOURCES.md](ONLINE-SOURCES.md)。使用在线歌词、封面和音乐资源时，请遵守对应服务条款与版权要求。
