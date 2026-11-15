# 桌面歌词源码

本分支只维护独立的 Windows .NET 桌面歌词程序。联网功能只保留歌词搜索、下载和匹配，入口为 `native/Online/OnlineLyrics.cs`；界面通过 `src/desktopLyrics/bridge.ts` 发送统一消息。

- `desktopLyrics/main.tsx` → `bootstrap.tsx` → `DesktopLyrics.tsx`：桌面界面装配、媒体时钟和窗口控件。
- `components/visualizer/registry.tsx`：自动发现各样式 `entry.tsx`；`backgrounds/registry.tsx` 发现本地背景。
- `components/visualizer/window/`：歌词样式与背景设置、实时预览。
- `utils/lyrics/`、`workers/lyricsParser.worker.ts`：本地及在线歌词的解析、时序和分词。
- `services/onlineMusic/qq/qrcDecrypt.ts`：QQ QRC 的本地解密，没有平台请求。
- `services/analysis/`、`workers/audioAnalysis.worker.ts`：用户选择的本地音频分析；权重由桌面宿主注册并从包内读取。
- `stores/`、`services/appDatabase.ts`：本地偏好及 IndexedDB 数据。已发布的存储名称和数据库升级历史保持兼容。
- `components/modal/settings/kit/`、`components/shared/`：共用控件。
- `types/`：渲染、历史数据和桌面设置契约；部分旧数据字段仅为兼容已保存的歌词与配置保留。

原版的 App、Electron、Omni 平台实现、登录、在线音乐播放、云同步、更新、远程控制、扩展和网页部署代码已移除。播放器控制由 Windows 媒体会话完成，音乐由外部播放器播放。

构建和验证以根目录 `README.md`、`README-DESKTOP.md` 为准；完整源码图由 `npm run codemap` 生成到 `docs/CODEMAP.md`。
