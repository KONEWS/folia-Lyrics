import { useEffect, useMemo, useState } from 'react';
import md5 from 'blueimp-md5';
import { readDesktopLyricOffset, writeDesktopLyricOffset, type DesktopOffsetStorage } from '../services/desktopLyricOffsets';
import { createDesktopOffsetIdentity, enrichDesktopOffsetIdentity, normalizeDesktopLyricOffset,
  resolveDesktopOffsetSnapshot, type DesktopOffsetSnapshot, type DesktopOffsetSong } from '../utils/lyrics/desktopLyricOffset';
import type { LyricPacket } from './bridge';

// src/desktopLyrics/useDesktopLyricOffset.ts — current-song calibration without a delayed effect-based song reset.
export function useDesktopLyricOffset(song: DesktopOffsetSong, packet: LyricPacket | null = null,
  storage: DesktopOffsetStorage = localStorage) {
  const [snapshot, setSnapshot] = useState<DesktopOffsetSnapshot | null>(null);
  const mediaVersionKnown = Boolean(song.album?.trim() || Number.isFinite(song.duration) && Math.round(song.duration) > 0);
  // Imported lyrics have no media version: fingerprint their timed payload once, without guessing song duration.
  const lyricVersion = useMemo(() => !mediaVersionKnown && packet?.content
    ? md5(JSON.stringify([packet.format ?? '', packet.content, packet.fallbackContent ?? ''])) : '',
  [mediaVersionKnown, packet?.format, packet?.content, packet?.fallbackContent]);
  const identity = enrichDesktopOffsetIdentity(snapshot?.identity, createDesktopOffsetIdentity({ ...song, lyricVersion }));
  const active = snapshot?.identity.signature === identity.signature ? snapshot
    : resolveDesktopOffsetSnapshot(snapshot, identity, readDesktopLyricOffset(storage, identity));
  if (active !== snapshot) setSnapshot(active);
  useEffect(() => {
    if (active.persist) writeDesktopLyricOffset(storage, active.identity, active.offset, active.previousKey);
  }, [active, storage]);
  const changeOffset = (next: number) => {
    setSnapshot({ ...active, offset: normalizeDesktopLyricOffset(next), edited: true, hasValue: true,
      persist: Boolean(active.identity.key) });
  };
  return { offset: active.offset, changeOffset };
}
