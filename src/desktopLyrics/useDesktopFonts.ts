import { useEffect, useMemo, useState } from 'react';
import { useTypographySettingsStore } from '../stores/useTypographySettingsStore';
import { restoreUploadedLyricsFont } from '../services/customLyricsFont';
import i18n from '../i18n/config';
import { desktopFontRequests, desktopFontsReady, prepareDesktopFonts, type DesktopFontInput } from './desktopFonts';

// src/desktopLyrics/useDesktopFonts.ts — isolate lyric measurement until the current font and any uploaded FontFace are ready.
const uploaded = new Map<string, ReturnType<typeof restoreUploadedLyricsFont>>();
const restoredUploads = new Set<string>();

// Restoring the same upload twice while StrictMode replays effects must not register duplicate FontFaces.
function restoreFont(id: string) {
  const existing = uploaded.get(id);
  if (existing) return existing;
  const loading = restoreUploadedLyricsFont(id).then(result => {
    if (result && uploaded.get(id) === loading) restoredUploads.add(id);
    return result;
  });
  uploaded.set(id, loading);
  while (uploaded.size > 8) { const oldest = uploaded.keys().next().value!; uploaded.delete(oldest); restoredUploads.delete(oldest); }
  return loading;
}

export function useDesktopFonts(input: DesktopFontInput, onNotice: (text: string) => void) {
  const font = useTypographySettingsStore(settings => settings.lyricsCustomFont);
  const active = input.lines.length > 0;
  const prepared = useMemo(() => {
    const requests = active ? desktopFontRequests(input) : [];
    return { requests, signature: JSON.stringify({ requests, fontId: font?.source === 'uploaded' ? font.fontId : null }) };
  }, [active, input.lines, input.theme, input.subtitleTheme, input.title, input.artist,
    input.hideTranslationSubtitle, input.subtitleContentMode, input.showHarmonySubtitle, font]);
  const { signature, requests } = prepared;
  const [ready, setReady] = useState('');
  const available = useMemo(() => active && (font?.source !== 'uploaded' || Boolean(font.fontId && restoredUploads.has(font.fontId)))
    && desktopFontsReady(requests), [active, prepared, font, ready]);
  useEffect(() => {
    if (!active || ready === signature) return;
    if (available) { void prepareDesktopFonts(requests); return; }
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
      await prepareDesktopFonts(requests);
      if (current) setReady(signature);
    };
    void prepare();
    return () => { current = false; };
  }, [active, signature, requests, font, onNotice, ready, available]);
  return !active || ready === signature || available;
}
