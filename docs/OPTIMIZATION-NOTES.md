<!-- docs/OPTIMIZATION-NOTES.md — English notes on the 2026-10-12 desktop optimization review: findings, changes, non-changes and how to verify. -->

# Desktop optimization notes (2026-10-12)

Scope: the standalone Windows desktop host (`native/`) and its WebView page (`src/desktopLyrics/`). Claude made the optimization
changes; Codex performed final Windows validation and packaged `release/0.4.35/win-x64/FoliaLyrics.exe`. The eight earlier EXEs,
0.4.27 through 0.4.34, retain their original hashes. Nothing was committed, pushed or uploaded.
The music-application launcher (slot IDs, 3+`+` layout rule, icon extraction, small-window scrolling), the 13 renderers and all
product text are unchanged.

## What could and could not be checked while authoring

Claude's first authoring environment could not run the Windows toolchain. The follow-up Windows checks below supersede the
earlier unrun-check status. The final test fixture also corrected its paused-from-start setup: bars first rise while playing,
then decay after the playing flag changes. No product layout or animation code was changed to accommodate the tests.

## Final Windows evidence (Codex, 0.4.35)

- Desktop TypeScript and version checks passed; final desktop unit suite: **191 passed, 3 existing skips**, including all 31 idle
  clock cases. The separate locale equivalence suite passed 6 cases. Native suites passed 357 checks, plus 53 background-state
  checks. Measurement-tool checks passed all 129 cases on Windows PowerShell 7.6.5, including the fresh-process entrypoint seam.
- The integrated progress subscriber uses the actual spectrum helpers and the existing 33 ms paint gate. Normal 60 Hz frames,
  a suspension after input was already stale, and repeated 1000/200 ms callbacks reach the exact silent SVG before parking.
  A copied hook with the former wall-clock deadline fails the long-gap and 1000 ms regressions; production files remain unchanged.
- The full browser regression covered all 13 renderer mounts and the remaining interaction/settings/parser/background flows.
  A pre-existing immersive-control timeout reproduced on the frozen baseline; a temporary runner wakes that existing control
  with real pointer movement. Its rebuilt 0.4.35 audio-progress run passed all 11 checks. No product behavior was adjusted for it.
- All 18 launcher contexts and 6 existing UX contexts preserve geometry, content, fonts and visibility. Small unmasked pixel
  differences reproduced on unchanged frozen assets and are recorded as capture/compositing variability, not hidden by masks.
  All CSS, JSX layout, Chinese locale/text, existing comments and all 13 renderer sources retain their preserved bytes.
- Exact spectrum comparison passed 1813 cases (Float32 bytes and SVG paths). Seven paired local helper trials measured about
  62% less band-calculation time, 70% less smoothing time and 26% less complete helper/SVG time. These are helper timings,
  not a claimed whole-application CPU improvement. Earlier short isolated native samples are exploratory only.
- The final isolated source host uses its own profile and mutex, with audio/online matching disabled and a nonexistent selected
  media source. Its real WebView2 window became hidden with memory target Low on minimize, visible with target Normal on restore,
  accepted Tab focus and exited via Alt+F4. The shipping EXE and real user profile/music were not opened for this smoke check.
- Codex's production build/publish passed. The new EXE is **81,990,712 bytes**, file version **0.4.35.0**, SHA-256
  `0454C1871A60D6A25CA9D178B9F655C70E41660CBC0E8DD9825B576DC7192197`. All 138 archive resources, embedded ZIP/hash marker,
  published main assembly, runtime, shipped documents/licenses and checksum match. All eight previous EXEs remain unchanged.

Local evidence: `test-results/optimization-final` and `test-results/release-0.4.35`. Browser checks use synthetic bridge data;
real file-picker/player launches, long-term playback and multi-monitor/DPI behavior are not newly claimed by this pass.

## Already fixed by the earlier uncommitted work (read and confirmed, not changed)

| Suspected problem | Where it is already handled |
| --- | --- |
| Repeated session / preference / lyric packets re-rendering the page | `desktopStateEquality.ts`, `MediaPresentation.Same`, `sameLyricPacket` |
| Spectrum frames sent and decoded while silent | `MainWindow.SendSpectrum` (`spectrumSilent`), `AudioSpectrum.Read` skips the FFT without fresh samples, `AudioProgress` settles to a static path |
| Audio device COM calls on the UI thread | `AudioCaptureMaintenance` (single coalescing worker); capture already pauses when minimized |
| Volume changes blocking the UI | `SystemVolumeWorker` |
| Slow or hung media reads freezing polling | `MediaReadDeadline` (3 s, then reconnect), cover loaded off the poll path (`MediaCoverCache`) |
| Warm-start asset hashing / copying | `DesktopAssets.Resolve` digest marker; measured 35 ms / 90 MB allocated -> 0.2 ms / 9 KB in `validation/performance/startup-assets-audio.json`; stale folders removed 15 s after start |
| Lyric / online-cache disk work on the UI thread | `OnlineCache.Run`, `LyricLibrary` work on `Task.Run`, `libraryLoad` in parallel with WebView2 start |
| Settings bundles blocking first paint | `useDesktopSettingsModules` (idle warm-up, one shared import) |
| Per-frame React state | `useVisualizerClock` (MotionValues), `AudioProgress` (direct SVG writes, 30 fps cap), `useGlassHighlights` (one RAF per pointer frame) |
| Page startup cost | measured in `validation/performance/comparison.json` (cold ready 561 -> 470 ms in Edge with a mock bridge) |

## Changes made

### 1. A minimized window no longer keeps the page running (`native/WindowBackgroundState.cs`, `WindowBackgroundPolicy.cs`)

- **Problem.** Nothing told WebView2 that the host window was minimized. The WebView2 reference for
  `CoreWebView2Controller.IsVisible` states that the child WebView "does not get window messages when the top window is minimized
  or restored" and that, "for performance reasons", the app should hide it on minimize and show it on restore; hidden pages stop
  `requestAnimationFrame` and throttle timers ("CPU and memory benefits"). The host already paused WASAPI capture on minimize but
  left the 13 renderers, the compositor and the 20 Hz spectrum timer running.
- **Change.** `WM_SIZE` (the only place minimize/restore is reported) now calls `UpdateBackgroundState`:
  - minimized: `web.Visible = false`, then `CoreWebView2.MemoryUsageTargetLevel = Low` (documented companion for apps that keep
    running scripts). The WinForms `WebView2` control exposes no controller; its `OnVisibleChanged` sets the controller's `IsVisible`
    once initialization has finished (see MicrosoftEdge/WebView2Feedback#898), which is why the code only toggles `Visible` after
    `CoreWebView2` exists and applies the current window state again on the page's `ready` message;
  - restored / maximized: target back to `Normal`, `web.Visible = true`, then `FocusLyricsIfActive()` so keyboard shortcuts keep working
    even if activation arrived before the control was visible again;
  - the 50 ms spectrum `Timer` runs only while the page is ready, sound response is on and the window is not minimized
    (previously it ticked 20 times a second, doing nothing, while minimized or with sound response off).
- **Preserved.** Host messages (`clock`, `session`, lyrics) are still posted to the hidden page, so nothing needs catching up on restore.
  Audio capture, the 500 ms media poll, lyric matching and the tray/Ctrl+Alt+L restore path are untouched. The memory-target call is wrapped
  so a WebView2 runtime that predates it cannot break minimize/restore (failures go to `errors.log`). Visibility failures are also
  caught; a failed restore retains the hidden marker so a later restore can retry.
- **Wiring.** `WindowCommands.WndProc` (WM_SIZE), the page `ready` handshake (replaces the unconditional `audioTimer.Start()`) and the
  `audioReactive` preference command. `WindowFrame.cs` / `WindowAudio.cs` (compiled into `test/window-close-smoke`) were not given new
  dependencies on non-linked code.
- **Verified scope.** Windows lifecycle checks confirm visibility, memory-target and timer decisions. Short isolated samples
  indicate lower minimized activity; they do not establish a general CPU/GPU percentage or long-term memory result.

### 2. Window-state messages only when the state changes (`native/WindowFrame.cs`)

- **Problem.** `OnResize` posted a `windowState` message on every `WM_SIZE`, i.e. continuously while a window edge is dragged, although the
  payload only holds three flags (maximized / fullscreen / click-through). Each message cost serialisation, IPC and a page-side parse
  and state-setter call while the page is also re-laying out the renderer.
- **Change.** `SendWindowState` remembers the last sent flags and returns early when none changed. The page's `ready` message clears the
  memory (`windowStateSent = false`), so a reloaded page (render-process recovery) always receives the current state.
- **Effect (by construction).** One message per real change instead of one per resize event; the new check sends 100 identical resize
  notifications and expects zero additional messages.

### 3. Frontend: clock loop parks while idle (`src/desktopLyrics/frameDemand.ts`, `useVisualizerClock.ts`, `useDesktopState.ts`, `DesktopLyrics.tsx`)

- **Problem.** With no lyrics loaded and nothing changing on screen, the animation loop still called `requestAnimationFrame` 60 times
  per second, doing nothing but re-reading unchanged values and writing unchanged MotionValues.
- **Change.** A `FrameDemand` signal threads from `useDesktopState` (which hears every host message) down to `useVisualizerClock`.
  The loop enters a `lines.length === 0` guard that accumulates an idle budget using `min(delta, IDLE_BUDGET_STEP_MS)` per tick
  (matching the 100 ms decay cap in `audioProgressSpectrum.ts`). When the budget reaches `IDLE_PARK_MS = 2500 ms` it parks. Any activity
  (woken signal, advancing playback, live audio, time change, audioChanged) resets the budget to zero.
- **Suspended-gap safety (second-pass fix after review).** Because the budget advances by at most `IDLE_BUDGET_STEP_MS = 100 ms` per
  tick regardless of the real elapsed time, a minimized or background-tab gap contributes only one capped step on the resumed tick,
  never the full wall-clock elapsed time. This prevents the edge case where the budget deadline had passed before the first resumed
  frame, causing a single silence-spectrum publish followed by an immediate park that would leave residual progress bars frozen at a
  non-zero level (`data-energy="0.029"` in the review-reported scenario). At normal 60 fps cadence the budget fills in ~150 frames
  (≈2500 ms), unchanged from before. Under 1 Hz throttling each tick contributes 100 ms, parking after 25 idle ticks; decay from
  a level up to 1 reaches zero within 17 capped steps, before parking. Multiple suspend/resume cycles are handled correctly because each
  resumed tick resets neither the budget nor the previous-tick timestamp unusually.
- **Preserved.** When lyrics are present (any renderer mounted), the loop never parks. Without a wake signal, it never parks.
  Playback, audio-reactive, manual-clock and all 13 renderer paths are unchanged; the guard is a single `if` in the empty-lyrics idle
  branch. The smoothing formula in `audioProgressSpectrum.ts` and all SVG precision are untouched.

### 4. Frontend: i18n flatten and lazy Chinese fallback (`src/i18n/flattenLocale.ts`, `config.ts`)

- **Problem.** The old `config.ts` Chinese fallback was built at startup by spreading merged copies of every section, allocating
  a new object per nested level. The locale objects are large (>3000 keys each).
- **Change.** `flattenLocale` traverses the tree once with a single accumulator, no intermediate copies. `config.ts` defers building
  the full Chinese fallback table until the first time a key is actually missing from every language; normal translated keys never
  trigger it.
- **Preserved.** Output is key-for-key and value-for-value identical to the old implementation (proven by the locale equivalence tests
  across `en`, `zh-CN` and `in`). Runtime behavior is identical; only the timing and allocation of the fallback build changed.

### 5. Tests and tooling

- `test/window-close-smoke`: the stand-in window now records `windowState` messages; new checks cover the first report, 100 identical
  notifications, maximize / fullscreen / click-through changes, re-send after `ready`, and the `WindowBackgroundPolicy` decision table.
  The project links the new pure file `native/WindowBackgroundPolicy.cs`.
- `test/window-background-smoke`: new suite with observable stand-ins; 53 checks passed on Windows (reported by Codex). Covers
  minimize/restore visibility+memory-target, spectrum-timer gating, retry-on-failed-visibility-restore, and the full policy decision table.
- `tools/measure-background-cost.ps1`: samples CPU and working set of the running program plus its WebView2 processes while visible and
  while minimized. Run it with the old EXE and a new build to obtain real before/after numbers. The report output path is now resolved
  before measurement begins, so a long run is never wasted on a path conflict.
- `tools/test-background-cost.ps1`: expanded to 129 checks including a fresh-process entry-script seam that reproduces the original
  Windows `GetNewClosure()` failure in a private copy of the script, then proves the fixed version passes in that same environment.
  Recursive-delete safety was strengthened: the guard now also checks for links anywhere inside an owned folder (not just at the root),
  provides `Find-LinkInside` and `New-DirectoryLink` / `Remove-DirectoryLink` helpers, and accepts an explicit prefix argument so the
  tests can create and clean up decoy folders without a bare `Remove-Item -Recurse`. Codex verified all 129 checks on Windows
  PowerShell 7.6.5. Compatible syntax alone does not establish an actual Windows PowerShell 5.1 run.

## Reviewed and deliberately not changed

| Finding | Evidence | Why it was left alone |
| --- | --- | --- |
| `lucide-react` is a 756 KB startup chunk (27% of the 2.75 MB preloaded JS) | three `import * as LucideIcons` in `lucideIconResolver.ts`, `GeometricBackground.tsx`, `sonnetIcons.ts` | Icon names come from theme / AI data and are resolved by name, so the whole set is required. A safe fix (lazy `GeometricBackground` plus idle prefetch) changes shared renderer code and needs the Playwright renderer suite to prove nothing regressed. |
| `NotoSansCJKsc-Regular.otf` is 16.4 MB (54% of `dist-desktop`) and loaded at start | `desktopFonts.ts`, `glass.css` | Subsetting would drop glyph coverage (visual quality). Preload variants were already benchmarked (`experiment-font-preload-*`, `experiment-worker-only-*`). |
| `spectrum.set(raw.slice())` runs every frame | `useVisualizerClock.ts` comment | Renderers rely on a fresh immutable snapshot per animation frame; skipping silent frames could freeze their internal decay. |
| Hoisting `CoreWebView2Environment.CreateAsync` before `Shown` | WebView2 process-model doc: the browser process starts with the first WebView2 *instance*, not the environment | Almost no overlap to gain; the controller needs the form handle. |
| Pixi core eagerly imported in `main.tsx` | only ~100 KB of preloaded chunks | Not worth the evaluation-order risk. |
| `clock` message re-sent every 500 ms while paused | `clock.received` is only used to cap extrapolation while playing | About two tiny messages per second; dropping them would also have to preserve the "clear connection error on next clock" recovery path. |
| `session` message re-sends the cover data URL on every presentation change | `MediaMonitor.Read` / `Send("session")` | Needs a separate cover message and page merge logic; infrequent (play/pause, source list changes). |

## Package composition (measured from the 0.4.34 EXE's bundle manifest, read-only)

Parsed with a throw-away script; the EXE was not modified. 268 bundle entries, 156,368,177 bytes of assemblies and resources, 71,942,784
bytes stored.

- **Checked and refuted:** the 22.9 MB `web-assets.zip` is *not* inflated at start. `FoliaLyrics.dll` (23,196,672 bytes with the embedded
  zip) is stored raw, because the bundler skips compression when it does not pay off.
- 265 of 268 entries are compressed (133,132,936 bytes uncompressed). The host inflates each assembly into memory when it is first loaded.
  The largest: `Microsoft.Windows.SDK.NET.dll` 24.9 MB, `System.Private.CoreLib.dll` 16.0 MB, `System.Windows.Forms.dll` 13.7 MB,
  `System.Private.Xml.dll` 7.8 MB, `System.Windows.Forms.Design.dll` 6.1 MB.

## Options worth measuring next (not applied; each needs a Windows build)

1. **Windows SDK projection (24.9 MB).** The `net10.0-windows10.0.19041.0` target pulls the whole `Microsoft.Windows.SDK.NET.dll`, yet the
   host only uses `Windows.Media.Control`, `Windows.Storage.Streams` and `WinRT.MarshalInspectable` (`MediaMonitor`, `WindowsMediaControlTarget`,
   `WindowsSessionIdentity`). It is inflated and held in memory when the first media poll runs. A minimal CsWinRT projection of just those
   namespaces would remove most of it. This changes the build graph, so it needs a real publish plus a smoke run of the media paths.
2. **`EnableCompressionInSingleFile=false`.** Uncompressed assemblies are mapped from the file instead of inflated into private memory, which
   should lower start time and resident memory, at the price of an EXE of roughly 156 MB instead of 82 MB. It is a product decision; compare
   start time and the Visible `WorkingSetMB` from `tools/measure-background-cost.ps1` between two publishes before deciding.
3. **`PublishReadyToRun`** for `FoliaLyrics.dll` could cut JIT time at start; it needs the crossgen2 package on the build machine.

## Verify on Windows

```powershell
Set-Location -LiteralPath 'G:/AI/folia-Lyrics'
dotnet run --project test/window-close-smoke/WindowCloseSmoke.csproj -c Release     # window-state and policy checks
dotnet run --project test/window-background-smoke/WindowBackgroundSmoke.csproj -c Release  # visibility and memory-target checks
dotnet build native/FoliaLyrics.csproj -c Release                                   # compile check of the new partial classes
powershell -ExecutionPolicy Bypass -File tools/test-background-cost.ps1             # 129 tool checks including entry-script seam
powershell -ExecutionPolicy Bypass -File tools/measure-background-cost.ps1 -Seconds 30  # real CPU/memory sample (run twice: before and after)
npm run test:desktop                                                                  # includes idle-loop and frame-demand tests
npm exec vitest -- run -c vitest.config.ts test/unit/i18n/flattenLocale.test.ts            # separate locale equivalence suite
```

The second pass changed the TypeScript idle-parking guard and tests. Codex reran desktop typechecking, the full desktop unit suite
and the affected audio-progress browser checks after that fix. CSS and mounted renderer cadence remain unchanged.

Manual checks worth doing once with a new EXE: minimize and restore from the taskbar, the tray menu and Win+D; space / arrow keys work immediately after a restore; lyric position is right after a long minimize; dragging a window edge feels smoother; fullscreen, click-through and the sound-response toggle still behave; the sound-response bars resume after restore.
