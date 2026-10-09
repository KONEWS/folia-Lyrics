// src/desktopLyrics/desktopFonts.ts — warm the bundled lyric font without delaying host connection or playback controls.
let ready: Promise<unknown> | undefined;
export function prepareDesktopFonts() {
  return ready ??= document.fonts.load('16px "Noto Sans CJK SC"').catch(() => undefined);
}
