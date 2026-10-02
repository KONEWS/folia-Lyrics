import type { LyricPacket, Preferences, Session } from './bridge';

// src/desktopLyrics/desktopStateEquality.ts — preserve stable presentation identities across repeated host packets.
const sessionFields = ['key', 'title', 'artist', 'album', 'cover', 'source', 'sessionId', 'duration', 'playing', 'rate', 'hasTimeline'] as const;
const controls = ['play', 'pause', 'toggle', 'previous', 'next'] as const;
const lyricFields = ['key', 'title', 'artist', 'content', 'source', 'cover', 'embedded', 'format', 'translation', 'romanization', 'fallbackContent', 'fallbackTranslation'] as const;

// Position and receive time belong to the live clock ref; all UI and transport fields still invalidate the session.
export function sameSessionPresentation(previous: Session, next: Session) {
  if (!sessionFields.every(key => previous[key] === next[key])) return false;
  if (Boolean(previous.controls) !== Boolean(next.controls)) return false;
  if (previous.controls && next.controls && !controls.every(key => previous.controls![key] === next.controls![key])) return false;
  return previous.sources.length === next.sources.length
    && previous.sources.every((source, index) => source.id === next.sources[index].id && source.label === next.sources[index].label);
}

export function sameLyricPacket(previous: LyricPacket | null, next: LyricPacket) {
  return Boolean(previous && lyricFields.every(key => previous[key] === next[key]));
}

export function mergeDesktopPreferences(previous: Preferences, next: Partial<Preferences>) {
  const changed = (Object.keys(next) as (keyof Preferences)[]).some(key => key === 'onlineProviders'
    ? previous.onlineProviders.length !== next.onlineProviders?.length
      || next.onlineProviders?.some((provider, index) => provider !== previous.onlineProviders[index])
    : previous[key] !== next[key]);
  return changed ? { ...previous, ...next } : previous;
}
