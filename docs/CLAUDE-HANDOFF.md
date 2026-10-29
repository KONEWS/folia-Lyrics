<!-- docs/CLAUDE-HANDOFF.md — English implementation handoff for the standalone Windows desktop project. -->

# Claude handoff: folia-Lyrics Windows desktop

Please continue this project in English, preserve the requirements below, and improve its performance, responsiveness, and reliability with justified, measurable changes. The user has authorized project optimization after packaging the music application launcher feature.

## Exact workspace and permissions

- **Work in `G:\AI\folia-Lyrics`.** This is the source repository and the folder to select in Claude's folder picker. Do not work in a copied screenshot, a release-only folder, or a different checkout.
- **Read this file first:** `G:\AI\folia-Lyrics\docs\CLAUDE-HANDOFF.md`.
- To inspect and implement improvements, request **read and write access to the project folder `G:\AI\folia-Lyrics` and its subfolders**. Read access to this document alone lets you read the instructions, but does not provide the source or permission to edit it.
- Start with `AGENTS.md`, applicable `skills/*/SKILL.md`, `README-DESKTOP.md`, `CHANGELOG-DESKTOP.md`, `VALIDATION.md`, and `docs/CODEMAP.md`. Read only relevant parts of longer documents. The root `README.md` is a reference and remains read-only under the project's skill rules.
- Access to the entire `G:\` drive or `C:\Users\jlHKO` profile is unnecessary. Do not read `.env*`, `test-results\.dev-credentials`, personal music, or actual application preferences unless a specific task requires them and the user explicitly grants access.
- Build tools already prepared on this machine are under `C:\Users\jlHKO\AppData\Local\FoliaLyricsBuild`. The build script discovers the Node.js 24 and .NET SDK 10 runtimes there. If Claude's environment cannot execute those tools, request the narrow tool access needed rather than general access to the user's profile.

## Product and implementation scope

This target is the **standalone Windows lyrics application**, implemented with **.NET 10 WinForms and Microsoft Edge WebView2**. It displays lyrics while external applications play music. Windows GSMTC supplies media sessions and transport; WASAPI captures output for existing visual effects.

The main work areas are `native/` and `src/desktopLyrics/`. Shared original Folia renderers, parser utilities, and settings modules are dependencies. The upstream Web/Electron baseline is **v0.7.22**; it is not the desktop application's version. Do not replace this host with Electron or treat an upstream Web/Electron build as the requested EXE.

The packaged application is `G:\AI\folia-Lyrics\release\0.4.34\win-x64\FoliaLyrics.exe`, built on 2026-10-12. File version: **0.4.34.0**. Size: **81,988,664 bytes**. SHA-256: **CBD236AD7983A2C02F5E6BDEF70BCF7480D651273F5D3EF74720AD2CF004147F**. The package includes the .NET runtime, license notices, desktop README, changelog, and `SHA256SUMS.txt`. Preserve this baseline and all older version directories.

The existing working tree contains extensive changes from the user and earlier tasks. Inspect it before editing. **Do not reset, clean, revert, overwrite, discard, or automatically commit/push those changes.** Continue from the current files and preserve unrelated edits. Keep changes reviewable and limited to the improvements you can justify.

## User requirements that must remain unchanged

The homepage's former “选择播放器” and “其他方式” controls, in the state with no connected player, have been replaced by multiple music application icons. Do not restore the old two-slot design or impose a limit of three applications.

When the homepage add-button setting is enabled, the required layout is:

| Bound applications | Bound icons | Add tiles |
| --- | --- | --- |
| 0 | 0 | 3 |
| 1 | 1 | 2 |
| 2 | 2 | 1 |
| 3 | 3 | 1, after the icons |
| 4 or more | All bound applications | 1, after the icons |

- Homepage bindings are **icon-only application buttons**, using the icon extracted from the bound executable. Preserve an accessible application name and tooltip, and provide the existing fallback if an icon cannot be extracted or decoded. Do not invent prebound applications.
- Clicking a bound icon launches its **saved local executable path**. The homepage sends the stable binding ID to the native host; it must not accept arbitrary command strings from the WebView or assume an array position equals an ID.
- Clicking any `+` opens settings and scrolls/focuses the **“绑定新的音乐软件”** action. Adding then opens the native executable picker. The `+` itself does not open an unrelated player selector.
- Settings support adding any number of applications, replacing a bound executable, launching a binding, and removing it. Native metadata supplies the application name and PNG icon. Canceling a picker preserves the previous binding.
- **“首页显示添加按钮”** persists across restarts. Turning it off hides all homepage `+` tiles and preserves every bound application icon. A management/settings route must remain reachable even when no applications are bound and the add tiles are hidden.
- The default for older preferences that lack the new setting is **enabled**. Preserve old binding data, stable nonnegative IDs, gap reuse for new IDs, and partial preference updates.
- Validate an existing local `.exe` path before launch, retain launch debouncing and asynchronous native operations, and preserve clear feedback for invalid or missing paths. Never convert a stored path into a shell command line.
- Launching an application does **not** automatically start a song or change the application's playback settings. Existing connected-player waiting states, online lyric search, and local lyric import remain available.
- At **450 × 300**, application icons, `+`, and the management entry remain reachable through scrolling **between the top controls and the bottom playback controls**. Preserve support for large lists, including the tested 14-application case.

Communicate and write new technical handoff notes primarily in English, but **retain the existing Chinese product interface and localization**. English communication is not a request to translate the app, the user's requirements, or existing comments.

The user additionally requested a complete frontend performance optimization pass on 2026-10-12, with **no changes to the current layout, appearance, text, interactions, or functionality**. Internal implementation changes for optimization are authorized. Preserve dimensions, spacing, colors, icons, settings, animation quality and timing, and all renderer behavior. Capture or reuse a pre-change visual baseline and verify equivalence after changes; do not redesign the interface.

Codex captured the immutable pre-change production assets at `test-results/optimization-final/baseline-dist`, with six visual/geometry baseline contexts at `test-results/claude-frontend-before-20261012`. A read-only frontend audit with measured redundant calculation counts is at `test-results/optimization-final/frontend-audit.md`. These ignored artifacts are local verification evidence, not product source or published documentation.

## First implementation entry points

| Area | Files relative to `G:\AI\folia-Lyrics` |
| --- | --- |
| Homepage icons and binding controls | `src/desktopLyrics/DesktopMusicApps.tsx`, `src/desktopLyrics/music-apps.css` |
| Waiting page and small-window layout | `src/desktopLyrics/DesktopWaitingScreen.tsx`, `src/desktopLyrics/waiting-screen.css` |
| Settings route, focus, and composition | `src/desktopLyrics/ControlPanel.tsx`, `src/desktopLyrics/DesktopLyrics.tsx` |
| WebView contract and preference updates | `src/desktopLyrics/bridge.ts`, `src/desktopLyrics/useDesktopState.ts`, `src/desktopLyrics/desktopStateEquality.ts` |
| Executable validation and metadata | `native/MusicAppLauncher.cs` |
| Native picker, launch, removal, and race protection | `native/WindowMusicApps.cs`, `native/WindowCommands.cs`, `native/Preferences.cs` |
| Desktop build and packaging | `build-windows.cmd`, `native/FoliaLyrics.csproj`, `vite.desktop.config.ts`, `tools/package-web.mjs`, `tools/check-desktop-version.mjs`, `tools/write-checksums.mjs` |
| Browser checks | `test/verify-music-apps.mjs`, `test/verify-ux-polish.mjs`, `test/verify-appearance.mjs`, `test/verify-renderers.mjs`, `test/desktop-bridge-mock.mjs` |
| State and native checks | `test/unit/desktop/bridgeNormalize.test.ts`, `test/unit/desktop/desktopStateEquality.test.ts`, `test/unit/desktop/waitingState.test.ts`, `test/music-app-smoke/MusicAppSmoke.csproj` |

Use the generated `docs/CODEMAP.md` for structural questions, `rg` for symbol and text searches, and `dev/mcp/ts-code-map/cli.mjs` only when `rg` cannot resolve ambiguity, complete references, call chains, or impact. Follow the relevant skill's boundaries. Ordinary upstream online music flows go through Omni; the standalone native online lyric facade is described in `README-DESKTOP.md`.

Do not remove existing comments. **Do not modify, delete, or translate `@note` comments without explicit instructions.** Add a file-purpose comment after the imports in new source files and a short purpose comment for complex functions. Reuse existing utilities and keep entry components small. The native desktop does not have the upstream command palette; do not add unrelated upstream wiring for a native-only launcher setting.

## Feature validation already completed

The music icon feature was verified on 2026-10-12 before this packaging handoff:

- Desktop TypeScript check passed.
- **42 desktop unit checks** covering preference/message normalization, state equality, and waiting states passed.
- **57 native launcher checks** passed, including executable validation, stable IDs, preferences, and real executable PNG icon extraction.
- **7 launcher browser groups** passed, including 0/1/2/3/5 bindings, adding/replacing/removing, keyboard launch, hiding/reloading, small windows, and a 14-application scroll list.
- **9 existing UX groups and 11 appearance checks** passed with zero page/console errors. There were 68 geometry samples in the UX evidence.
- Evidence and screenshots are in `test-results/music-apps-final` and `test-results/music-apps-ux-final`; the conclusions are in `VALIDATION.md`.

Packaging additionally passed desktop type checking, desktop version consistency, **147 desktop tests with 3 intentional skips**, the production frontend build, and Windows x64 self-contained native publishing. The production `dist-desktop` launcher UI passed all **7 browser groups with zero errors**, with evidence in `test-results/release-0.4.34/music-apps-ui`. Native publishing completed without reported warnings or errors. All **138 embedded frontend/license entries** match their source bytes, the **268-entry EXE bundle** contains the exact native assembly, web ZIP, and SHA marker, and the shipped documentation/licenses/checksum match. The seven previous EXEs (0.4.27 through 0.4.33) retain their original hashes. Reports are in `test-results/release-0.4.34`; the packaging conclusion is in `VALIDATION.md`.

Browser checks use an isolated mock WebView bridge and software WebGL. The icon screenshots use test fixtures. They do not prove that a real third-party player starts or that Windows' actual file picker and acrylic behavior work on the user's machine. Native checks did not launch the user's player or modify actual preferences. Do not claim those unperformed manual checks passed.

## Optimization work to perform

1. Read the relevant rules and inspect the current implementation and working tree. Produce a concise review of concrete issues affecting CPU usage, memory, startup time, UI responsiveness, resource cleanup, or reliability. Check whether earlier optimizations already address a suspected issue.
2. Measure or reproduce the highest-value issues, then implement bounded improvements. Prefer reducing unnecessary work, duplicate updates, unneeded parsing or allocations, blocking I/O, and lifecycle leaks while keeping the visible behavior intact. Do not optimize based only on guesses.
3. Preserve **all 13 original dynamic lyric renderers**, lyric timing/word timing, lazy renderer discovery, original animation quality and settings, subtitle placement, transparent background priority, provider selection and matching behavior, and existing visual settings import/export. Do not lower frame rates, remove modes, or disable effects merely to obtain a favorable measurement.
4. Follow `testing-strategy` before selecting checks. Reuse an existing dev server for normal development when appropriate; do not run full packaging after every reversible edit. Run relevant regression checks after actual changes, broaden only for changed shared behavior or unresolved risks, and inspect small-window screenshots if layout changes.
5. Deliver a clear English report of implemented changes, measurements before/after where available, checks run, and any remaining limitations. If a later EXE is requested, publish to its own native version directory and report its exact path. Do not upload, publish, or merge changes automatically.

Do not begin a full stable Web/Electron/Docker release, change upstream version metadata, or reorganize unrelated project areas as part of this request. The desktop version is independent.

## Useful checks and build notes

Use Node.js **24+** and .NET SDK **10**. Read the scripts and applicable testing skill before execution. The focused commands are:

```powershell
Set-Location -LiteralPath 'G:\AI\folia-Lyrics'
npm run typecheck:desktop
npm run test:unit -- test/unit/desktop/bridgeNormalize.test.ts test/unit/desktop/desktopStateEquality.test.ts test/unit/desktop/waitingState.test.ts
dotnet run --project test/music-app-smoke/MusicAppSmoke.csproj -c Release
```

For the launcher browser checks, `test/verify-music-apps.mjs` can use an existing desktop dev URL through `FOLIA_TEST_URL`, or serve an already built `dist-desktop` output without rebuilding. Microsoft Edge is available on this machine if the default Playwright browser is missing:

```powershell
$env:FOLIA_CHROMIUM_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$env:FOLIA_UI_OUTPUT = 'test-results/claude-music-apps'
node test/verify-music-apps.mjs
$env:FOLIA_CHECKS_ONLY = 'ux-polish'
$env:FOLIA_UI_OUTPUT = 'test-results/claude-music-apps-ux'
node test/verify-renderers.mjs
```

Use new evidence directories rather than overwriting the existing validation. Clear temporary process environment overrides when finished. Native command examples assume the prepared .NET 10 SDK is on the process PATH; the default machine SDK may be older.

For an explicitly requested desktop package, `build-windows.cmd` runs dependency installation, desktop type checking, version checks, frontend packaging, and native publishing. It uses the version in `native/FoliaLyrics.csproj` and outputs `release/<version>/win-x64/`. **The script clears that same version's output directory before publishing**; inspect and preserve an existing package when necessary, and never delete historical version directories. WebView2 Runtime remains a system requirement; the EXE includes the .NET runtime. Check embedded frontend archive integrity and EXE metadata rather than reporting success from a frontend build alone.
