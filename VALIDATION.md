# folia-Lyrics 0.4.2 验证记录

验证日期：2026-09-30。源码以用户附件为基础，上游基线 v0.7.11，桌面宿主版本 0.4.2。此前用户确认解决的暂停继续、媒体绑定、目录扫描和整窗亚克力修复均保留。

## 本次结果

| 项目 | 结果与范围 |
| --- | --- |
| 上游核对 | GitHub 最新稳定发行及默认分支最新提交均为 v0.7.11，提交 `6fe68d89abb7031eb266d71fda01b36a0fa0573e`；344 个 `src/components/visualizer` 文件的 Git blob SHA-1 与上游完全一致，未改写渲染器 |
| 桌面类型检查 | `npm run typecheck:desktop` 通过 |
| 桌面前端单测 | 13 项通过；3 项需要临时真实在线样本的测试跳过，此次没有真实请求第三方歌词源 |
| 绘光设置 | 上游既有设置/导入导出测试 13 项通过 |
| 绘光与共享运行时 | 上游既有编译程序、运行时、GPU 资源释放及换歌交接测试 67 项通过；部分环境使用隔离替身 |
| 原生控制与扫描 | 既有生产逻辑检查 39 项通过，媒体会话与 Windows UI 调度使用替身，目录扫描使用真实临时文件 |
| 动态样式 | 13 种全部挂载成功，无页面/控制台错误；设置显示的数量与实际按钮数量一致，包含绘光；still 不属于桌面动态样式列表 |
| 绘光暂停与继续 | 暂停挂载后 Canvas 非零尺寸，像素与时钟保持；继续后像素变化、时钟推进；再次暂停后画面保持 |
| 绘光缩放与换歌 | 暂停时缩放 Canvas 尺寸跟随窗口；换歌清除旧 Canvas，新歌词只挂载一个 Canvas；标题及时间正确更新 |
| 绘光卸载 | 3 次来回切换均移除旧 Canvas、调用 ResizeObserver.disconnect 及 WebGL 资源删除；同时以源码检查确认 ticker、场景缓存、纹理、filter 和 Pixi Application 清理路径。没有进行长时间内存曲线实测 |
| 桌面界面与桥接 | 11 项外观检查、10 项控制检查及既有歌词交互检查通过，包括小窗口、亚克力回退、在线手动选择、过期回复隔离、偏移和倒退 |
| 前端生产构建 | `npm run build:desktop` 通过。保留上游的大模块/混合静态与动态导入提示，不影响本次构建 |
| Windows 发布编译 | .NET SDK 10.0.401 发布 Windows x64、自带 .NET 的单文件 GUI EXE；发布无编译错误或警告。**未启动真实 Windows EXE** |

浏览器检查使用 Chromium 153、生产构建、模拟 WebView2 消息及软件 WebGL。Canvas 像素检查证明当前浏览器场景中的停止/恢复行为，不能保证真实显卡性能；资源释放检查不等同于长时间零泄漏证明。普通 LRC 测试仅验证逐行同步，不宣称精准逐字时间轴。

## Windows 实机验证边界

本次环境为 Linux，无 Windows 实机。椒盐音乐实际公开的会话/控制能力、进度同步与暂停重建，真实 WinRT/COM 和 WebView2 STA 线程行为，DWM 亚克力/主题变更、多屏/DPI、标题栏拖动缩放、鼠标穿透、托盘热键和 WASAPI 均未在本次实机复验。

这些是验证环境的边界，不是把用户已确认解决的问题重新列为待修任务。四个在线歌词适配、缓存、手动选择、本地优先与请求取消逻辑沿用附件；此轮不宣称第三方服务实时可用。

## 重现

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck:desktop
npm run test:desktop
npm run test:unit -- test/unit/visualizer/lumiereSettings.test.ts test/unit/visualizer/lumiere/lumiereProgram.test.ts test/unit/visualizer/lumiere/lumiereRuntime.test.ts test/unit/visualizer/lumiere/lumiereGpuRelease.test.ts test/unit/visualizer/songHandover.test.ts
dotnet run --project test/transport-smoke/TransportSmoke.csproj
npm run build:desktop
npm run test:desktop:ui
node tools/package-web.mjs
dotnet publish native/FoliaLyrics.csproj -c Release -r win-x64 --self-contained true -o release/win-x64
```

浏览器检查需要 Playwright Chromium；可用 `FOLIA_CHROMIUM_PATH` 指向本机 Chromium。`FOLIA_MODE_INDEX=2` 可只进行绘光挂载及完整交互检查，默认遍历实际全部动态样式。时钟检查按 Luminous 名称定位，避免新增模式改变序号后选择错误模式。

Windows 可直接运行 `build-windows.cmd`。证据见 `validation/`：上游指纹核对、测试与构建日志、完整浏览器检查 JSON、绘光截图以及 EXE 的 SHA-256。浏览器检查 JSON 中的共享交互覆盖项不是每项各一条独立单测。
