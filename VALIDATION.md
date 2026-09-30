# Folia 桌面歌词 0.4.1 验证记录

本版修复暂停后控制目标失效、目录扫描跨线程访问 WebView2，并将名称/图标区域改为自绘透明标题栏。编译及验证在 Linux 完成，未运行真实 Windows EXE。

## 已验证

| 项目 | 结果 |
| --- | --- |
| TypeScript | 桌面入口类型检查通过 |
| 前端单测 | 13 项通过，3 项依赖临时线上样本的测试跳过 |
| 原生控制与扫描逻辑 | 39 项通过，使用生产的 MediaTransport、MediaSessionBinding、UiDispatcher、LyricLibrary、LyricFiles；Windows API 和窗口事件仍由模拟输入提供 |
| 暂停后控制 | 暂停 → 继续 → 下一首可连续执行；暂停时系统推荐另一播放应用仍保留原目标 |
| 会话身份 | 同一 COM 身份的新包装对象保留 token；同应用唯一重建会话重新解析当前目标；歧义替换、明确换播放器、退出后重开拒绝旧命令；发送前仍校验真实歌曲快照 |
| 扫描 | 实际临时 LRC 目录的 1 文件、45 文件扫描成功；中间和完成回调先调度到所有者线程；取消后原目录和索引不变 |
| 线程调度 | 后台报告不读取 UI 就绪属性，调度后才检查；窗口退出与句柄销毁不会执行旧消息 |
| 界面 | 11 项检查通过：文档透明、原生背景消息、实色/高对比回退、反光清理、减少动效、664×411 布局、设置滚动、透明标题/图标、窗口控制消息、最大化/全屏消息状态 |
| 播放控制界面 | 10 项通过：暂停/继续/上下首、等待与 ACK、失败、能力变化、切歌旧回复隔离、小窗口、断连、无音频元素 |
| 歌词交互 | 14 项整合检查通过，包括暂停换动效真实时间通知、偏移、倒退、沉浸、在线搜索选择和过期结果隔离 |
| 原版动效 | 284 个 visualizer 文件与原基线源码包逐字节一致。0.4.0 已验证 12 种全部挂载；0.4.1 针对 Luminous、基础模式与更新区域验证，未重复宣称全量 12 种实测 |
| 发布构建 | .NET 10.0.401 自带运行时的 Windows x64 单文件 WinExe，发布无错误/警告；Vite 成功，保留原模块体积提示 |

浏览器验证使用 Chromium 153、生产构建、模拟 WebView 消息与软件 WebGL。原生逻辑测试模拟系统会话和 UI 消息队列，不等同于真实 WinRT、WebView2 或 Windows 窗口验证。目录测试使用真实文件读取和生产扫描器，但索引持久化使用隔离测试替身。

## Windows 实机仍需确认

椒盐音乐实际公开的会话/控制能力、暂停重建行为、进度同步；WinRT 指针获取与 COM 身份映射；WebView2 在真实 STA 的跨线程投递；原生 DWM 亚克力、透明开关和主题切换；自绘标题栏的拖动、双击、边缘缩放、最大化工作区、多屏/DPI、最小化恢复和 F11；鼠标穿透、托盘快捷键与 WASAPI。

当前证据足以说明源码缺陷已修正和构建已完成，不能据此保证椒盐音乐所有版本实机兼容。发生问题时提供本地 `media.log` 与 `errors.log`；媒体日志有大小上限，不记录歌词正文或音频。

## 证据及重现

- `validation/repair-ui-0.4.1.json`
- `validation/media-controls-native-0.4.1.json`
- `validation/build-0.4.1.json`、`validation/executable-sha256.txt`
- 历史完整动效验证：`validation/v0.4.0-VALIDATION.md`、`validation/acrylic-ui.json`

```sh
npm run typecheck:desktop
npm run test:desktop
dotnet run --project test/transport-smoke/TransportSmoke.csproj
npm run build:desktop
FOLIA_MODE_INDEX=2 node test/verify-renderers.mjs
```

可用 `FOLIA_CHROMIUM_PATH` 指定 Chromium。Windows 执行 `build-windows.cmd` 重新构建。

## 原生 API 依据

- https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/threading-model
- https://learn.microsoft.com/en-us/windows/win32/com/rules-for-implementing-queryinterface
- https://learn.microsoft.com/en-us/windows/win32/dwm/customframe
- https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/ne-dwmapi-dwm_systembackdrop_type

四个在线歌词来源沿用此前实现，本版不改变匹配协议。其真实请求验证范围见 `ONLINE-SOURCES.md` 与历史验证记录。
