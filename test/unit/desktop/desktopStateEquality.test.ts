import { describe, expect, it } from 'vitest';
import { EMPTY, DEFAULT_PREFERENCES, type LyricPacket, type Session } from '../../../src/desktopLyrics/bridge';
import { mergeDesktopPreferences, reuseMediaSources, sameLyricContent, sameLyricPacket, sameSessionPresentation } from '../../../src/desktopLyrics/desktopStateEquality';

// test/unit/desktop/desktopStateEquality.test.ts — repeated host packets must retain identities without hiding real changes.
const session: Session = { ...EMPTY, key: 'song', sessionId: 'session', title: 'Title', artist: 'Artist', duration: 180,
  sources: [{ id: 'pepper', label: '椒盐音乐' }], controls: { play: true, pause: true, toggle: true, previous: true, next: true } };
const packet: LyricPacket = { key: 'song', title: 'Title', artist: 'Artist', source: 'local', cover: '', embedded: false,
  format: 'lrc', content: '[00:01.00]歌词', translation: '[00:01.00]translation' };

describe('desktop packet identities', () => {
  it('reuses equal source lists across metadata updates and preserves real playback, rename, removal and ordering changes', () => {
    const sources = [...session.sources, { id: 'second', label: 'Second', playing: true }];
    expect(reuseMediaSources(sources, sources.map(source => ({ ...source })))).toBe(sources);
    expect(reuseMediaSources(sources, sources.map(source => ({ ...source, playing: Boolean(source.playing) })))).toBe(sources);
    const changed = [sources.map(source => ({ ...source, playing: !source.playing })), [...sources].reverse(), sources.slice(1),
      sources.map(source => ({ ...source, label: `${source.label} changed` }))];
    for (const next of changed) expect(reuseMediaSources(sources, next)).toBe(next);
  });
  it('ignores clock-only session changes and independently allocated equal source/capability objects', () => {
    expect(sameSessionPresentation(session, { ...session, position: 99, received: 12345,
      controls: { ...session.controls! }, sources: session.sources.map(source => ({ ...source })) })).toBe(true);
  });
  it.each(['key', 'sessionId', 'title', 'artist', 'album', 'cover', 'source', 'duration', 'playing', 'rate', 'hasTimeline'] as const)
    ('preserves a real %s presentation or transport change', field => {
      const next = { ...session, [field]: typeof session[field] === 'boolean' ? !session[field] : typeof session[field] === 'number' ? 999 : 'different' };
      expect(sameSessionPresentation(session, next)).toBe(false);
    });
  it('preserves controls appearing, disappearing or losing any operation and sources being renamed/reordered', () => {
    expect(sameSessionPresentation(session, { ...session, controls: null })).toBe(false);
    for (const action of ['play', 'pause', 'toggle', 'previous', 'next'] as const) {
      expect(sameSessionPresentation(session, { ...session, controls: { ...session.controls!, [action]: false } })).toBe(false);
    }
    expect(sameSessionPresentation(session, { ...session, sources: [{ id: 'pepper', label: 'New' }] })).toBe(false);
    expect(sameSessionPresentation(session, { ...session, sources: [{ id: 'other', label: '椒盐音乐' }] })).toBe(false);
    expect(sameSessionPresentation(session, { ...session, sources: [{ id: 'pepper', label: '椒盐音乐', playing: true }] })).toBe(false);
  });
  it('deduplicates exact lyrics while preserving format, timing content, translations and fallback changes', () => {
    expect(sameLyricPacket(packet, { ...packet })).toBe(true);
    expect(sameLyricPacket(null, packet)).toBe(false);
    for (const field of ['key', 'content', 'format', 'translation', 'romanization', 'fallbackContent', 'fallbackTranslation', 'source'] as const) {
      expect(sameLyricPacket(packet, { ...packet, [field]: 'different' })).toBe(false);
    }
  });
  it('reuses parsing for metadata-only lyric updates but invalidates every parse input', () => {
    expect(sameLyricContent(null, packet)).toBe(false);
    expect(sameLyricContent(packet, { ...packet })).toBe(true);
    for (const field of ['key', 'source', 'cover', 'title', 'artist'] as const) {
      expect(sameLyricContent(packet, { ...packet, [field]: 'changed' })).toBe(true);
    }
    for (const field of ['content', 'embedded', 'format', 'translation', 'romanization', 'fallbackContent', 'fallbackTranslation'] as const) {
      expect(sameLyricContent(packet, { ...packet, [field]: field === 'embedded' ? !packet.embedded : 'changed' })).toBe(false);
    }
  });
  it('keeps identical full/partial preferences stable while applying every real switch and provider order', () => {
    expect(mergeDesktopPreferences(DEFAULT_PREFERENCES, {})).toBe(DEFAULT_PREFERENCES);
    expect(mergeDesktopPreferences(DEFAULT_PREFERENCES, { ...DEFAULT_PREFERENCES, onlineProviders: [...DEFAULT_PREFERENCES.onlineProviders] })).toBe(DEFAULT_PREFERENCES);
    expect(mergeDesktopPreferences(DEFAULT_PREFERENCES, { closeToTaskbar: true }).closeToTaskbar).toBe(true);
    expect(DEFAULT_PREFERENCES.showMusicAppAddButton).toBe(true);
    expect(DEFAULT_PREFERENCES.autoDiscoverMusicApps).toBe(true);
    expect(mergeDesktopPreferences(DEFAULT_PREFERENCES, { autoDiscoverMusicApps: false }).autoDiscoverMusicApps).toBe(false);
    expect(mergeDesktopPreferences(DEFAULT_PREFERENCES, { showMusicAppAddButton: false }).showMusicAppAddButton).toBe(false);
    expect(mergeDesktopPreferences(DEFAULT_PREFERENCES, { immersiveDelay: 180 }).immersiveDelay).toBe(180);
    expect(mergeDesktopPreferences(DEFAULT_PREFERENCES, { onlineProviders: [] }).onlineProviders).toEqual([]);
    expect(mergeDesktopPreferences(DEFAULT_PREFERENCES, { onlineProviders: [...DEFAULT_PREFERENCES.onlineProviders].reverse() })).not.toBe(DEFAULT_PREFERENCES);
  });
  it('retains bound apps across partial packets and accepts replacement, icon changes and removal', () => {
    const app = { slot: 0, name: 'Music', path: 'C:\\Music\\Player.exe', icon: 'data:image/png;base64,icon' };
    const saved = { ...DEFAULT_PREFERENCES, musicApps: [app] };
    expect(mergeDesktopPreferences(saved, { topmost: true }).musicApps).toBe(saved.musicApps);
    expect(mergeDesktopPreferences(saved, { musicApps: [{ ...app }] })).toBe(saved);
    for (const field of ['slot', 'name', 'path', 'icon'] as const) {
      const replacement = { ...app, [field]: field === 'slot' ? 1 : 'changed' };
      expect(mergeDesktopPreferences(saved, { musicApps: [replacement] }).musicApps).toEqual([replacement]);
    }
    expect(mergeDesktopPreferences(saved, { musicApps: [] }).musicApps).toEqual([]);
    expect(mergeDesktopPreferences(DEFAULT_PREFERENCES, { topmost: true }).musicApps).toEqual([]);
  });
});
