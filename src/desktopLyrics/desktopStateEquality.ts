import type { LyricPacket, MediaSource, Preferences, Session } from './bridge';

// src/desktopLyrics/desktopStateEquality.ts — preserve stable presentation identities across repeated host packets.
const sessionFields = ['key', 'title', 'artist', 'album', 'cover', 'source', 'sessionId', 'duration', 'playing', 'rate', 'hasTimeline'] as const;
const controls = ['play', 'pause', 'toggle', 'previous', 'next'] as const;
const lyricFields = ['key', 'title', 'artist', 'content', 'source', 'cover', 'embedded', 'format', 'translation', 'romanization', 'fallbackContent', 'fallbackTranslation'] as const;
const lyricContentFields = ['content', 'embedded', 'format', 'translation', 'romanization', 'fallbackContent', 'fallbackTranslation'] as const;

// A metadata-only song update does not invalidate menus that depend solely on the source list.
export function reuseMediaSources(previous: MediaSource[], next: MediaSource[]) {
  return previous.length === next.length && previous.every((source, index) => source.id === next[index].id
    && source.label === next[index].label && Boolean(source.playing) === Boolean(next[index].playing)) ? previous : next;
}

// Position and receive time belong to the live clock ref; all UI and transport fields still invalidate the session.
export function sameSessionPresentation(previous: Session, next: Session) {
  if (!sessionFields.every(key => previous[key] === next[key])) return false;
  if (Boolean(previous.controls) !== Boolean(next.controls)) return false;
  if (previous.controls && next.controls && !controls.every(key => previous.controls![key] === next.controls![key])) return false;
  return reuseMediaSources(previous.sources, next.sources) === previous.sources;
}

export function sameLyricPacket(previous: LyricPacket | null, next: LyricPacket) {
  return Boolean(previous && lyricFields.every(key => previous[key] === next[key]));
}

// Artwork and display metadata can arrive after the lyrics without requiring the parser to run again.
export function sameLyricContent(previous: LyricPacket | null, next: LyricPacket) {
  return Boolean(previous && lyricContentFields.every(key => previous[key] === next[key]));
}

export function mergeDesktopPreferences(previous: Preferences, next: Partial<Preferences>) {
  const changed = (Object.keys(next) as (keyof Preferences)[]).some(key => key === 'onlineProviders'
    ? previous.onlineProviders.length !== next.onlineProviders?.length
      || next.onlineProviders?.some((provider, index) => provider !== previous.onlineProviders[index])
    : key === 'musicApps' || key === 'blockedMusicApps'
      ? previous[key].length !== next[key]?.length
        || next[key]?.some((app, index) => {
          const saved = previous[key][index];
          return !saved || ('slot' in app && (!('slot' in saved) || app.slot !== saved.slot))
            || ('id' in app && (!('id' in saved) || app.id !== saved.id))
            || app.name !== saved.name || app.path !== saved.path || app.icon !== saved.icon
            || app.launchKind !== saved.launchKind || app.appUserModelId !== saved.appUserModelId;
        })
      : previous[key] !== next[key]);
  return changed ? { ...previous, ...next } : previous;
}
