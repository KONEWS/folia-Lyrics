# 代码地图

<!-- 这份文件由 `npm run codemap` 生成，不要手改。CI 会重新生成并比对。 -->

全部内容由 TypeScript 编译器和模块图推导，不是人工维护的清单。
想知道某个具体符号在哪，用 `node dev/mcp/ts-code-map/cli.mjs search '{"query":"..."}'`。

文件里所有的量都只给**数量级**（向下取整到 2 的幂，写作 `512+`），排序也按量级。
这是有意的：精确计数会让每个新文件、每条 import 都产生一次同步提交，而那些提交
没有一条说明结构变了。要精确数字就问 `cli.mjs`，它是按需查询、不进版本库的。

## 区域分布

| 区域 | 文件数量级 |
| --- | --- |
| components | 512+ |
| test/dev | 256+ |
| src (其他) | 64+ |
| utils | 64+ |
| services | 32+ |
| 其他 | 32+ |
| hooks | 8+ |
| stores | 8+ |
| types | 8+ |
| i18n | 4+ |
| workers | 4+ |
| 共享脚本 | 1+ |

## 枢纽模块

被 32 个以上模块依赖的文件。改动它们波及面最大，读代码时也最值得先看。

| 被依赖量级 | 模块 |
| --- | --- |
| 256+ | `src/types.ts` |
| 64+ | `src/components/visualizer/definition.ts` |
| 32+ | `src/components/modal/settings/kit/index.ts` |
| 32+ | `src/components/visualizer/hanabi/types.ts` |
| 32+ | `src/components/visualizer/machi/engine/materials.ts` |
| 32+ | `src/components/visualizer/tuningDefinition.ts` |
| 32+ | `src/desktopLyrics/bridge.ts` |
| 32+ | `src/i18n/config.ts` |
| 32+ | `src/stores/useVisualizerSettingsStore.ts` |
| 32+ | `src/utils/fontStacks.ts` |
| 32+ | `src/utils/lyricRenderQuality.ts` |
| 32+ | `src/utils/lyrics/graphemeTiming.ts` |
| 32+ | `src/utils/lyrics/renderHints.ts` |

## 动态注册点

这些地方用 `import.meta.glob` 自动发现成员，**清单随目录变化，不要手写**。
以下是当前的完整展开：

### `src/components/scenes/registry.ts`

- `src/components/scenes/cinema/entry.ts`

### `src/components/visualizer/backgrounds/registry.tsx`

- `src/components/visualizer/backgrounds/common/entry.tsx`
- `src/components/visualizer/backgrounds/latent/entry.tsx`
- `src/components/visualizer/backgrounds/monet/entry.tsx`
- `src/components/visualizer/backgrounds/nomand/entry.tsx`
- `src/components/visualizer/backgrounds/sora/entry.tsx`

### `src/components/visualizer/registry.tsx`

- `src/components/visualizer/cadenza/entry.tsx`
- `src/components/visualizer/cappella/entry.tsx`
- `src/components/visualizer/claddagh/entry.tsx`
- `src/components/visualizer/classic/entry.tsx`
- `src/components/visualizer/diorama/entry.tsx`
- `src/components/visualizer/fume/entry.tsx`
- `src/components/visualizer/hanabi/entry.tsx`
- `src/components/visualizer/lumiere/entry.tsx`
- `src/components/visualizer/machi/entry.tsx`
- `src/components/visualizer/monet/entry.tsx`
- `src/components/visualizer/nebbia/entry.tsx`
- `src/components/visualizer/partita/entry.tsx`
- `src/components/visualizer/pendolo/entry.tsx`
- `src/components/visualizer/sonnet/entry.tsx`
- `src/components/visualizer/still/entry.tsx`
- `src/components/visualizer/tempera/entry.tsx`
- `src/components/visualizer/tilt/entry.tsx`

### `src/components/visualizer/tuningRegistry.ts`

- `src/components/visualizer/backgrounds/latent/tuning.ts`
- `src/components/visualizer/backgrounds/monet/tuning.ts`
- `src/components/visualizer/backgrounds/nomand/tuning.ts`
- `src/components/visualizer/backgrounds/sora/tuning.ts`
- `src/components/visualizer/cadenza/tuning.ts`
- `src/components/visualizer/cappella/tuning.ts`
- `src/components/visualizer/claddagh/tuning.ts`
- `src/components/visualizer/classic/tuning.ts`
- `src/components/visualizer/diorama/tuning.ts`
- `src/components/visualizer/fume/tuning.ts`
- `src/components/visualizer/hanabi/tuning.ts`
- `src/components/visualizer/lumiere/tuning.ts`
- `src/components/visualizer/machi/tuning.ts`
- `src/components/visualizer/monet/tuning.ts`
- `src/components/visualizer/nebbia/tuning.ts`
- `src/components/visualizer/partita/tuning.ts`
- `src/components/visualizer/pendolo/tuning.ts`
- `src/components/visualizer/sonnet/tuning.ts`
- `src/components/visualizer/tempera/tuning.ts`
- `src/components/visualizer/tilt/tuning.ts`

## 分层边界违规

规则是人定的（见 `codemap.mjs` 的 `BOUNDARY_RULES`），拿真实的值导入图去比对。
`import type` 不算——它在运行时不存在。

当前没有违规。

### 目录归属存疑

这些边命中了规则，但目标模块在运行时根本不含 UI（不传递依赖 react）。
依赖方向没问题，是文件住在了 UI 目录（`src/components/`、`src/library/` 的 suites / app）下面。修法是移动文件，不是改依赖。

- `src/stores/useVisualizerSettingsStore.ts` → `src/components/visualizer/tuningRegistry.ts`

