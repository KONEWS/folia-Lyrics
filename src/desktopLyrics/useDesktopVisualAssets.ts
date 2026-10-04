import { useEffect, useMemo, useRef } from 'react';
import { useVisualizerAssetStore } from '../stores/useVisualizerAssetStore';
import { useVisualizerSettingsStore } from '../stores/useVisualizerSettingsStore';
import { useTypographySettingsStore } from '../stores/useTypographySettingsStore';
import { getCustomCappellaEmojiPack } from '../services/cappellaEmojiPack';
import { getCustomCappellaAvatar } from '../services/cappellaAvatarPack';
import { getMonetBackgroundImage } from '../services/monetBackgroundImage';
import { getMonetPortraitImage } from '../services/monetPortraitImage';
import { restoreUploadedLyricsFont } from '../services/customLyricsFont';
import { createSafeObjectUrl } from '../utils/blobGuards';
import i18n from '../i18n/config';

// src/desktopLyrics/useDesktopVisualAssets.ts — own restored Blob URLs for the desktop lifetime, outside conditional settings UI.
export function useDesktopVisualAssets() {
  const queues = useRef<Record<'emoji' | 'avatars' | 'background' | 'portrait', Promise<void>>>({ emoji: Promise.resolve(), avatars: Promise.resolve(), background: Promise.resolve(), portrait: Promise.resolve() });
  const emoji = useVisualizerAssetStore(s => s.storedCappellaEmojiPack), avatars = useVisualizerAssetStore(s => s.storedCappellaAvatarPack);
  const background = useVisualizerAssetStore(s => s.storedMonetBackgroundImage), portrait = useVisualizerAssetStore(s => s.storedMonetPortraitImage);
  const font = useTypographySettingsStore(s => s.lyricsCustomFont);
  useEffect(() => {
    let active = true;
    const initial = useVisualizerAssetStore.getState();
    // Each resource is restored before its queued edits. A slow startup read cannot resurrect a cleared image or lose an appended pack.
    const reads = {
      emoji: getCustomCappellaEmojiPack().then(value => { if (active && useVisualizerAssetStore.getState().storedCappellaEmojiPack === initial.storedCappellaEmojiPack) useVisualizerAssetStore.setState({ storedCappellaEmojiPack: value }); }),
      avatars: getCustomCappellaAvatar().then(value => { if (active && useVisualizerAssetStore.getState().storedCappellaAvatarPack === initial.storedCappellaAvatarPack) useVisualizerAssetStore.setState({ storedCappellaAvatarPack: value }); }),
      background: getMonetBackgroundImage().then(value => { if (active && useVisualizerAssetStore.getState().storedMonetBackgroundImage === initial.storedMonetBackgroundImage) useVisualizerAssetStore.setState({ storedMonetBackgroundImage: value }); }),
      portrait: getMonetPortraitImage().then(value => { if (active && useVisualizerAssetStore.getState().storedMonetPortraitImage === initial.storedMonetPortraitImage) useVisualizerAssetStore.setState({ storedMonetPortraitImage: value }); }),
    };
    for (const key of Object.keys(reads) as (keyof typeof reads)[]) queues.current[key] = reads[key].catch(() => undefined);
    void Promise.allSettled(Object.values(reads)).then(() => { if (active) useVisualizerAssetStore.setState({ isLoadingCappellaCustomEmojiPack: false, isLoadingCappellaCustomAvatarPack: false, isLoadingMonetBackgroundImage: false, isLoadingMonetPortraitImage: false }); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const urls: string[] = [];
    const images = emoji.flatMap(image => { const url = createSafeObjectUrl(image.blob); if (!url) return []; urls.push(url); return [{ id: image.id, name: image.name, url }]; });
    useVisualizerAssetStore.setState({ cappellaCustomEmojiImages: images });
    return () => { urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [emoji]);
  useEffect(() => {
    const urls: string[] = [];
    const images = avatars.flatMap(image => { const url = createSafeObjectUrl(image.blob); if (!url) return []; urls.push(url); return [{ id: image.id, name: image.name, url }]; });
    useVisualizerAssetStore.setState({ cappellaCustomAvatarImages: images });
    return () => { urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [avatars]);
  useEffect(() => {
    const url = createSafeObjectUrl(background?.blob);
    useVisualizerAssetStore.setState({ monetBackgroundImage: background && url ? { id: background.id, name: background.name, url } : null });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [background]);
  useEffect(() => {
    const url = createSafeObjectUrl(portrait?.blob);
    useVisualizerAssetStore.setState({ monetPortraitImage: portrait && url ? { id: portrait.id, name: portrait.name, url } : null });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [portrait]);
  useEffect(() => {
    if (font?.source !== 'uploaded' || !font.fontId) return;
    let active = true;
    void restoreUploadedLyricsFont(font.fontId).then(restored => {
      if (active && !restored && useTypographySettingsStore.getState().lyricsCustomFont === font) useTypographySettingsStore.getState().clearLyricsCustomFontAfterRestoreFailure({ type: 'info', text: i18n.t('notifications.uploadedFontUnavailable') });
    }).catch(() => { if (active && useTypographySettingsStore.getState().lyricsCustomFont === font) useTypographySettingsStore.getState().clearLyricsCustomFontAfterRestoreFailure({ type: 'error', text: i18n.t('notifications.uploadedFontLoadFailed') }); });
    return () => { active = false; };
  }, [font]);
  return useMemo(() => {
    // Serialize original writes per resource: later upload/clear requests keep the user's ordering.
    const serial = <Args extends unknown[], Result>(key: keyof typeof queues.current, action: (...args: Args) => Promise<Result>) => (...args: Args): Promise<Result> => {
      const task = queues.current[key].then(() => action(...args));
      queues.current[key] = task.then(() => undefined, () => undefined);
      return task;
    };
    const store = useVisualizerSettingsStore.getState();
    return { handleImportCustomCappellaEmojiPack: serial('emoji', store.handleImportCustomCappellaEmojiPack), handleClearCustomCappellaEmojiPack: serial('emoji', store.handleClearCustomCappellaEmojiPack),
      handleImportCustomCappellaAvatar: serial('avatars', store.handleImportCustomCappellaAvatar), handleClearCustomCappellaAvatar: serial('avatars', store.handleClearCustomCappellaAvatar),
      handleUploadMonetBackgroundImage: serial('background', store.handleUploadMonetBackgroundImage), handleClearMonetBackgroundImage: serial('background', store.handleClearMonetBackgroundImage),
      handleUploadMonetPortraitImage: serial('portrait', store.handleUploadMonetPortraitImage), handleClearMonetPortraitImage: serial('portrait', store.handleClearMonetPortraitImage) };
  }, []);
}
