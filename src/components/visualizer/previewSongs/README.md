# Lyric-only preview songs

The style studio and theme editor share these two local lyric data files through `../PreviewPlaceholder.ts`:

- `odo.json`: 踊 — Ado. Enhanced LRC from the user-provided FLAC's `LYRICS` tag, with original word timestamps and Chinese translations.
- `hoshifuruUmi.json`: 星降る海 — Aqu3ra / 月見ヤチヨ(cv.早見沙織). LRC from the user-provided FLAC's `LYRICS` tag, with original line timestamps and Chinese translations. Word timings are estimates from the existing LRC parser, not original word synchronization.

The data was prepared with `parseEnhancedLRC` / `parseLRC` from `src/utils/lyrics/parserCore.ts`, with interlude insertion disabled. Opening title/credit rows were omitted; rows sharing a timestamp were separated into original lyrics and translation before parsing. Render hints are resolved by the renderer. Each loop ends one second after the final lyric, rounded up.

Only text, timestamps and song metadata are included. No audio, embedded artwork, file paths or playback URLs are retained. The generic preview covers remain the app's existing placeholders. Preview playback uses the existing silent clock and never opens the source music files.
