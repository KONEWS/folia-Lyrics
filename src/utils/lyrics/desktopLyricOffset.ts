// src/utils/lyrics/desktopLyricOffset.ts — stable desktop song versions and metadata enrichment rules.
export type DesktopOffsetSong = {
  title: string; artist: string; album?: string; duration: number; source?: string; sessionId?: string; key?: string; lyricVersion?: string;
};
export type DesktopOffsetIdentity = {
  title: string; artist: string; album: string; duration: number; playback: string; songKey: string; lyricVersion: string;
  key: string; legacyKey: string; signature: string;
};
export type DesktopOffsetSnapshot = {
  identity: DesktopOffsetIdentity; offset: number; edited: boolean; hasValue: boolean;
  persist: boolean; previousKey: string;
};
export type DesktopOffsetSaved = { value: number | null; legacy: boolean };

// Preserve punctuation/version labels; lyric search normalization would merge distinct recordings.
const normalize = (value: string) => value.trim().replace(/\s+/gu, ' ').toLowerCase();
export const normalizeDesktopLyricOffset = (value: number) => Number.isFinite(value)
  ? Math.round(Math.min(120, Math.max(-120, value)) * 10) / 10 : 0;

const identify = (song: Omit<DesktopOffsetIdentity, 'key' | 'signature'>): DesktopOffsetIdentity => {
  const version = JSON.stringify(song.album || song.duration
    ? [song.title, song.artist, song.album, song.duration] : [song.title, song.artist, 'lyrics', song.lyricVersion]);
  return { ...song, key: song.title && (song.album || song.duration || song.lyricVersion) ? `folia.desktop.offset.v2:${version}` : '',
    signature: JSON.stringify([version, song.playback, song.songKey, song.legacyKey]) };
};

// Session tokens distinguish a live transition, but never participate in the persisted version key.
export function createDesktopOffsetIdentity(song: DesktopOffsetSong): DesktopOffsetIdentity {
  return identify({ title: normalize(song.title), artist: normalize(song.artist), album: normalize(song.album ?? ''),
    duration: Number.isFinite(song.duration) && song.duration > 0 ? Math.round(song.duration) : 0,
    playback: JSON.stringify([song.source ?? '', song.sessionId ?? '']),
    songKey: song.key ?? '', lyricVersion: song.lyricVersion ?? '',
    legacyKey: `folia.desktop.offset.v1:${song.title}\n${song.artist}` });
}

const continuesSong = (previous: DesktopOffsetIdentity, next: DesktopOffsetIdentity) => Boolean(next.title
  && previous.title === next.title && previous.artist === next.artist && previous.playback === next.playback
  && (previous.songKey === next.songKey || Boolean(next.album || next.duration))
  && (previous.album || previous.duration || next.album || next.duration
    || !previous.lyricVersion || !next.lyricVersion || previous.lyricVersion === next.lyricVersion)
  && (!previous.album || !next.album || previous.album === next.album)
  && (!previous.duration || !next.duration || previous.duration === next.duration));

// A temporary missing field cannot downgrade a known version during the same media session.
export function enrichDesktopOffsetIdentity(previous: DesktopOffsetIdentity | undefined, next: DesktopOffsetIdentity) {
  return previous && continuesSong(previous, next)
    ? identify({ ...next, album: next.album || previous.album, duration: next.duration || previous.duration }) : next;
}

// Resolve during render so an arriving track never receives the previous track's calibration for one frame.
export function resolveDesktopOffsetSnapshot(previous: DesktopOffsetSnapshot | null,
  identity: DesktopOffsetIdentity, saved: DesktopOffsetSaved): DesktopOffsetSnapshot {
  if (previous?.identity.signature === identity.signature) return previous;
  // With no player, the first imported packet may supply the title together with its timed content.
  const pendingImport = previous?.edited && !previous.identity.title && !previous.identity.key
    && identity.lyricVersion && previous.identity.playback === identity.playback;
  const continuing = previous && (continuesSong(previous.identity, identity) || pendingImport);
  const carry = Boolean(continuing && (previous.edited || saved.value === null && previous.hasValue));
  const hasValue = carry || saved.value !== null;
  return { identity, offset: carry ? previous!.offset : saved.value ?? 0,
    edited: Boolean(carry && previous!.edited), hasValue,
    persist: Boolean(identity.key && (carry || saved.legacy)),
    previousKey: carry && previous!.identity.key !== identity.key ? previous!.identity.key : '' };
}
