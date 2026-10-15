import { useEffect, useMemo, useState } from 'react';
import { useTypographySettingsStore } from '../stores/useTypographySettingsStore';
import { restoreUploadedLyricsFont } from '../services/customLyricsFont';
import i18n from '../i18n/config';
import { desktopFontRequests, prepareDesktopFonts, type DesktopFontInput, type DesktopFontRequest } from './desktopFonts';

// src/desktopLyrics/useDesktopFonts.ts — isolate lyric measurement until the current font and any uploaded FontFace are ready.
const uploaded = new Map<string, ReturnType<typeof restoreUploadedLyricsFont>>();

// Restoring the same upload twice while StrictMode replays effects must not register duplicate FontFaces.
function restoreFont(id: string) {
  const existing = uploaded.get(id);
  if (existing) return existing;
  const loading = restoreUploadedLyricsFont(id);
  uploaded.set(id, loading);
  while (uploaded.size > 8) uploaded.delete(uploaded.keys().next().value!);
  return loading;
}

export function useDesktopFonts(input: DesktopFontInput, onNotice: (text: string) => void) {
  const font = useTypographySettingsStore(settings => settings.lyricsCustomFont);
  const active = input.lines.length > 0;
  const signature = useMemo(() => JSON.stringify({ requests: desktopFontRequests(input),
    fontId: font?.source === 'uploaded' ? font.fontId : null }), [input.lines, input.theme, input.subtitleTheme, input.title, input.artist,
    input.hideTranslationSubtitle, input.subtitleContentMode, input.showHarmonySubtitle, font]);
  const [ready, setReady] = useState('');
  useEffect(() => {
    if (!active) return;
    let current = true;
    const prepare = async () => {
      if (font?.source === 'uploaded' && font.fontId) {
        let restored = false, failed = false;
        try { restored = Boolean(await restoreFont(font.fontId)); } catch { failed = true; }
        if (!current) return;
        if (!restored) {
          // A late failure belongs only to its captured font; a newer upload or clear must keep its current setting.
          if (useTypographySettingsStore.getState().lyricsCustomFont === font) {
            const text = i18n.t(failed ? 'notifications.uploadedFontLoadFailed' : 'notifications.uploadedFontUnavailable');
            useTypographySettingsStore.getState().clearLyricsCustomFontAfterRestoreFailure({ type: failed ? 'error' : 'info', text });
            onNotice(text);
          }
          return;
        }
      }
      if (!current) return;
      await prepareDesktopFonts((JSON.parse(signature) as { requests: DesktopFontRequest[] }).requests);
      if (current) setReady(signature);
    };
    void prepare();
    return () => { current = false; };
  }, [active, signature, font, onNotice]);
  return !active || ready === signature;
}
