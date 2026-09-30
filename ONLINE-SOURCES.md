# 在线歌词来源与核对

本文件记录 0.2.0 的实现依据。第三方服务可能随时调整，并非永久可用承诺。

| 来源 | 入口 | 本次观察 |
| --- | --- | --- |
| QQ 音乐 | u.y.qq.com/cgi-bin/musicu.fcg；DoSearchForQQMusicLite / GetPlayLyricInfo | Reborn 搜索成功；QRC、译文、罗马音和逐行回退返回；原版 Folia 解码和逐字解析通过 |
| 网易云音乐 | music.163.com/api/search/get；api/song/lyric/v1 | Reborn 搜索成功；返回逐行原文、译文和罗马音；该条目未返回 YRC |
| 酷狗音乐 | lyrics.kugou.com/search；download | Ado《唱》搜索成功；KRC 逐字返回、解码和原版解析通过 |
| LRCLIB | lrclib.net/api/search | Reborn 条目可查；本次只有无时间轴歌词，界面标记不可用于同步 |

QQ 请求结构和 QRC 解码复用 Folia 已有实现依据；酷狗 KRC 的 XOR/zlib 容器由原 Folia 实现核对。所有结果经适配层归一化后交给原版歌词解析器和 12 个渲染模式。

- Folia 上游：https://github.com/chthollyphile/folia-major
- 复用基线：481805873a0b04ca6277dd21c0968ab1e1c4ab02
- 上游 QQ 适配：src/utils/lyrics/providers/qqLyricProvider.ts
- 上游 QRC 解码：src/utils/lyrics/providers/qrcDecrypt.ts
- 上游酷狗适配及解码：src/utils/lyrics/providers/kugouLyricProvider.ts、krcDecrypt.ts
- 网易云客户端模块依据：@neteasecloudmusicapienhanced/api 的 module/lyric_new.js（package-lock.json 固定依赖版本）
- LRCLIB 官方 API 文档：https://lrclib.net/docs
- 对照用户截图的应用说明：https://github.com/WXRIW/Lyricify-App

QQ、网易云、酷狗使用的是当前可访问的客户端接口，并非稳定性承诺的公开开发者 API。LRCLIB 要求客户端标识、请求节流及遵守 429 Retry-After；本版已实现。软件只读取歌词，不下载音频、不登录账号，也不上传或发布歌词。

真实请求所得完整歌词仅用于本次本地验证，不随源码包或 EXE 预置。测试结果只记录来源、格式和数量。
