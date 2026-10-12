import { afterEach, describe, expect, it, vi } from 'vitest';
import md5 from 'blueimp-md5';
import { useDesktopLyricOffset } from '../../../src/desktopLyrics/useDesktopLyricOffset';
import { readDesktopLyricOffset, writeDesktopLyricOffset, type DesktopOffsetStorage } from '../../../src/services/desktopLyricOffsets';
import { createDesktopOffsetIdentity, type DesktopOffsetSnapshot, type DesktopOffsetSong } from '../../../src/utils/lyrics/desktopLyricOffset';
import type { LyricPacket } from '../../../src/desktopLyrics/bridge';

// test/unit/desktop/desktopLyricOffset.test.ts — isolated storage and render-before-effect song transitions.
const hooks = vi.hoisted(() => ({ snapshot: null as DesktopOffsetSnapshot | null, effects: [] as (() => void)[],
  memo: null as { deps: unknown[]; value: unknown } | null }));
vi.mock('blueimp-md5', { spy: true });
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: () => [hooks.snapshot, (next: DesktopOffsetSnapshot) => { hooks.snapshot = next; }],
  useEffect: (effect: () => void) => { hooks.effects.push(effect); },
  useMemo: (create: () => unknown, deps: unknown[]) => {
    if (!hooks.memo || deps.some((value, index) => value !== hooks.memo!.deps[index])) hooks.memo = { deps, value: create() };
    return hooks.memo.value;
  },
}));
afterEach(() => { hooks.snapshot = null; hooks.memo = null; hooks.effects.length = 0; vi.clearAllMocks(); vi.restoreAllMocks(); });

const track: DesktopOffsetSong = { title: 'Song (Live)', artist: 'Singer', album: 'Concert', duration: 200,
  source: 'player-a', sessionId: 'session-a', key: 'player-a\nSong (Live)\nSinger\nConcert' };
function memoryStorage() {
  const values = new Map<string, string>();
  const storage: DesktopOffsetStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
  };
  return { storage, values };
}
const commit = () => { hooks.effects.splice(0).forEach(effect => effect()); };
const readSnapshot = (): DesktopOffsetSnapshot | null => hooks.snapshot;

describe('desktop song-version offsets', () => {
  it('uses album and rounded duration, preserving version labels and ignoring media session tokens', () => {
    const identity = createDesktopOffsetIdentity(track);
    expect(createDesktopOffsetIdentity({ ...track, source: 'player-b', sessionId: 'session-b', key: 'other', duration: 200.2 }).key).toBe(identity.key);
    expect(createDesktopOffsetIdentity({ ...track, title: ' SONG (Live) ', artist: ' Singer ', album: ' Concert ' }).key).toBe(identity.key);
    expect(createDesktopOffsetIdentity({ ...track, album: 'Studio' }).key).not.toBe(identity.key);
    expect(createDesktopOffsetIdentity({ ...track, duration: 210 }).key).not.toBe(identity.key);
    expect(createDesktopOffsetIdentity({ ...track, title: 'Song' }).key).not.toBe(identity.key);
  });

  it('recalls the same version after changing players', () => {
    const { storage } = memoryStorage();
    writeDesktopLyricOffset(storage, createDesktopOffsetIdentity(track), 1.4);
    const current = useDesktopLyricOffset({ ...track, source: 'player-b', sessionId: 'other-session', key: 'other' }, null, storage);
    expect(current.offset).toBe(1.4);
  });

  it.each([{ album: '', duration: 200 }, { album: 'Concert', duration: 0 }])('persists a version with partial metadata: %o', metadata => {
    const { storage } = memoryStorage(), song = { ...track, ...metadata };
    const current = useDesktopLyricOffset(song, null, storage);
    current.changeOffset(-0.8); useDesktopLyricOffset(song, null, storage); commit();
    expect(readDesktopLyricOffset(storage, createDesktopOffsetIdentity(song)).value).toBe(-0.8);
  });

  it('keeps entirely unknown-version edits in the session until metadata arrives', () => {
    const { storage, values } = memoryStorage(), pending = { ...track, album: '', duration: 0, key: 'pending' };
    const current = useDesktopLyricOffset(pending, null, storage);
    current.changeOffset(1.2); expect(useDesktopLyricOffset(pending, null, storage).offset).toBe(1.2); commit();
    expect(values.size).toBe(0);
    // A known version may already have an older saved value; the current manual edit wins.
    writeDesktopLyricOffset(storage, createDesktopOffsetIdentity(track), 4);
    expect(useDesktopLyricOffset(track, null, storage).offset).toBe(1.2); commit();
    expect(readDesktopLyricOffset(storage, createDesktopOffsetIdentity(track)).value).toBe(1.2);
  });

  it('moves an edited duration-only version to the late album without keeping a weaker alias', () => {
    const { storage, values } = memoryStorage(), pending = { ...track, album: '', key: 'pending' };
    const oldKey = createDesktopOffsetIdentity(pending).key;
    useDesktopLyricOffset(pending, null, storage).changeOffset(0.6);
    useDesktopLyricOffset(pending, null, storage); commit();
    expect(values.get(oldKey)).toBe('0.6');
    expect(useDesktopLyricOffset(track, null, storage).offset).toBe(0.6); commit();
    expect(values.has(oldKey)).toBe(false);
    expect(readDesktopLyricOffset(storage, createDesktopOffsetIdentity(track)).value).toBe(0.6);
  });

  it('moves an album-only edit to a late duration and retains known fields during temporary omissions', () => {
    const { storage } = memoryStorage(), pending = { ...track, duration: 0 };
    useDesktopLyricOffset(pending, null, storage).changeOffset(-1.6);
    useDesktopLyricOffset(pending, null, storage); commit();
    expect(useDesktopLyricOffset(track, null, storage).offset).toBe(-1.6); commit();
    expect(useDesktopLyricOffset({ ...track, duration: 0 }, null, storage).offset).toBe(-1.6);
    expect(hooks.snapshot?.identity.key).toBe(createDesktopOffsetIdentity(track).key);
  });

  it('resolves an arriving version before effects, immediately clearing the previous version offset', () => {
    const { storage } = memoryStorage();
    useDesktopLyricOffset(track, null, storage).changeOffset(3);
    useDesktopLyricOffset(track, null, storage); commit();
    expect(useDesktopLyricOffset({ ...track, duration: 210 }, null, storage).offset).toBe(0);
    expect(useDesktopLyricOffset({ ...track, title: 'Next song' }, null, storage).offset).toBe(0);
    expect(useDesktopLyricOffset({ title: '', artist: '', duration: 0 }, null, storage).offset).toBe(0);
  });

  it('does not retain the last version when a changed song key arrives without version metadata', () => {
    const { storage } = memoryStorage();
    useDesktopLyricOffset(track, null, storage).changeOffset(2);
    useDesktopLyricOffset(track, null, storage); commit();
    expect(useDesktopLyricOffset({ ...track, album: '', duration: 0, key: 'new-song' }, null, storage).offset).toBe(0);
  });
});

describe('desktop legacy-offset migration', () => {
  it('claims v1 once for a duration-only version, then follows its late album', () => {
    const { storage, values } = memoryStorage(), pending = { ...track, album: '', key: 'pending' };
    const oldIdentity = createDesktopOffsetIdentity(pending), fullIdentity = createDesktopOffsetIdentity(track);
    values.set(oldIdentity.legacyKey, '1.8');
    expect(useDesktopLyricOffset(pending, null, storage).offset).toBe(1.8); commit();
    expect(readDesktopLyricOffset(storage, createDesktopOffsetIdentity({ ...pending, duration: 210 })).value).toBeNull();
    expect(useDesktopLyricOffset(track, null, storage).offset).toBe(1.8); commit();
    expect(values.get(`folia.desktop.offset.v2.claim:${fullIdentity.legacyKey}`)).toBe(fullIdentity.key);
    expect(values.has(oldIdentity.key)).toBe(false);
    expect(values.get(fullIdentity.legacyKey)).toBe('1.8');
    expect(readDesktopLyricOffset(storage, createDesktopOffsetIdentity({ ...track, album: 'Other concert' })).value).toBeNull();
  });

  it('defers legacy migration while album and duration are both unknown', () => {
    const { storage, values } = memoryStorage(), pending = { ...track, album: '', duration: 0 };
    values.set(createDesktopOffsetIdentity(pending).legacyKey, '2');
    expect(useDesktopLyricOffset(pending, null, storage).offset).toBe(0); commit();
    expect(values.size).toBe(1);
    expect(useDesktopLyricOffset(track, null, storage).offset).toBe(2);
  });

  it('keeps an explicit zero reset instead of reviving the old calibration', () => {
    const { storage, values } = memoryStorage(), identity = createDesktopOffsetIdentity(track);
    values.set(identity.legacyKey, '2.8');
    expect(useDesktopLyricOffset(track, null, storage).offset).toBe(2.8); commit();
    useDesktopLyricOffset(track, null, storage).changeOffset(0);
    useDesktopLyricOffset(track, null, storage); commit();
    expect(values.get(identity.key)).toBe('0');
    expect(readDesktopLyricOffset(storage, identity)).toEqual({ value: 0, legacy: false });
  });

  it('restricts legacy ownership even when saving the new offset is interrupted', () => {
    const { storage, values } = memoryStorage(), identity = createDesktopOffsetIdentity(track);
    values.set(identity.legacyKey, '1');
    const write = storage.setItem;
    vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      if (key === identity.key) throw new Error('storage full');
      write(key, value);
    });
    expect(writeDesktopLyricOffset(storage, identity, 1)).toBe(false);
    expect(readDesktopLyricOffset(storage, createDesktopOffsetIdentity({ ...track, duration: 230 })).value).toBeNull();
    expect(readDesktopLyricOffset(storage, identity)).toEqual({ value: 1, legacy: true });
  });

  it('handles corrupt or blocked storage and normalizes both saved and edited offsets', () => {
    const { storage, values } = memoryStorage(), identity = createDesktopOffsetIdentity(track);
    values.set(identity.key, 'not a number');
    expect(readDesktopLyricOffset(storage, identity).value).toBeNull();
    writeDesktopLyricOffset(storage, identity, 999);
    expect(readDesktopLyricOffset(storage, identity).value).toBe(120);
    useDesktopLyricOffset(track, null, storage).changeOffset(Number.NaN);
    expect(useDesktopLyricOffset(track, null, storage).offset).toBe(0);
    vi.spyOn(storage, 'getItem').mockImplementation(() => { throw new Error('storage denied'); });
    expect(readDesktopLyricOffset(storage, identity)).toEqual({ value: null, legacy: false });
    expect(writeDesktopLyricOffset(storage, identity, 2)).toBe(false);
  });
});

describe('imported lyrics without a media session', () => {
  const manualSong: DesktopOffsetSong = { title: 'Imported', artist: 'Singer', album: '', duration: 0, key: '' };
  const packet: LyricPacket = { key: '', title: 'Imported', artist: 'Singer', format: 'lrc',
    content: '[00:01.00]First line\n[00:03.00]Second line', source: 'imported.lrc', cover: '', embedded: false };

  it('persists a content version and recalls it after the hook is recreated', () => {
    const { storage } = memoryStorage();
    useDesktopLyricOffset(manualSong, packet, storage).changeOffset(1.6);
    useDesktopLyricOffset(manualSong, packet, storage); commit();
    expect(hooks.snapshot?.identity.duration).toBe(0);
    const key = hooks.snapshot?.identity.key;
    expect(key).toContain('lyrics');
    hooks.snapshot = null; hooks.memo = null;
    const recreated = useDesktopLyricOffset(manualSong, { ...packet, source: 'renamed-file.lrc' }, storage);
    expect(recreated.offset).toBe(1.6);
    expect(readSnapshot()?.identity.key).toBe(key);
  });

  it('isolates same-name versions immediately when imported timing content changes', () => {
    const { storage } = memoryStorage(), other = { ...packet, content: '[00:02.00]Other version' };
    useDesktopLyricOffset(manualSong, packet, storage).changeOffset(2);
    useDesktopLyricOffset(manualSong, packet, storage); commit();
    expect(useDesktopLyricOffset(manualSong, other, storage).offset).toBe(0);
    useDesktopLyricOffset(manualSong, other, storage).changeOffset(-1);
    useDesktopLyricOffset(manualSong, other, storage); commit();
    expect(useDesktopLyricOffset(manualSong, packet, storage).offset).toBe(2);
    expect(useDesktopLyricOffset(manualSong, other, storage).offset).toBe(-1);
  });

  it('keeps edits made before the first packet and persists them when the packet arrives', () => {
    const { storage, values } = memoryStorage();
    useDesktopLyricOffset(manualSong, null, storage).changeOffset(0.8);
    useDesktopLyricOffset(manualSong, null, storage); commit();
    expect(values.size).toBe(0);
    expect(useDesktopLyricOffset(manualSong, packet, storage).offset).toBe(0.8); commit();
    hooks.snapshot = null; hooks.memo = null;
    expect(useDesktopLyricOffset(manualSong, packet, storage).offset).toBe(0.8);
  });

  it('accepts the first imported title together with its packet after a pending manual edit', () => {
    const { storage } = memoryStorage(), emptySong = { title: '', artist: '', duration: 0, key: '' };
    useDesktopLyricOffset(emptySong, null, storage).changeOffset(1.8);
    useDesktopLyricOffset(emptySong, null, storage); commit();
    expect(useDesktopLyricOffset(manualSong, packet, storage).offset).toBe(1.8); commit();
    hooks.snapshot = null; hooks.memo = null;
    expect(useDesktopLyricOffset(manualSong, packet, storage).offset).toBe(1.8);
  });

  it('hashes only timed payload changes, ignoring presentation and supplemental language fields', () => {
    const { storage } = memoryStorage();
    useDesktopLyricOffset(manualSong, packet, storage).changeOffset(1);
    useDesktopLyricOffset(manualSong, packet, storage); commit();
    const key = hooks.snapshot?.identity.key;
    expect(useDesktopLyricOffset(manualSong, { ...packet, translation: 'translation', romanization: 'romanization',
      cover: 'cover', source: 'new-source', embedded: true }, storage).offset).toBe(1);
    expect(hooks.snapshot?.identity.key).toBe(key);
    expect(md5).toHaveBeenCalledTimes(1);
    expect(useDesktopLyricOffset(manualSong, { ...packet, fallbackContent: '[00:04.00]Fallback' }, storage).offset).toBe(0);
    expect(md5).toHaveBeenCalledTimes(2);
    expect(useDesktopLyricOffset(manualSong, { ...packet, format: 'qrc' }, storage).offset).toBe(0);
    expect(md5).toHaveBeenCalledTimes(3);
  });

  it('prefers known music metadata when the selected lyric version changes', () => {
    const { storage } = memoryStorage();
    useDesktopLyricOffset(track, packet, storage).changeOffset(1.2);
    useDesktopLyricOffset(track, packet, storage); commit();
    expect(hooks.snapshot?.identity.key).toBe(createDesktopOffsetIdentity(track).key);
    expect(useDesktopLyricOffset(track, { ...packet, content: '[00:07.00]Provider replacement' }, storage).offset).toBe(1.2);
    expect(md5).not.toHaveBeenCalled();
  });

  it('claims legacy calibration for one timed-content version', () => {
    const { storage, values } = memoryStorage();
    values.set(createDesktopOffsetIdentity(manualSong).legacyKey, '1.4');
    expect(useDesktopLyricOffset(manualSong, packet, storage).offset).toBe(1.4); commit();
    expect(useDesktopLyricOffset(manualSong, { ...packet, content: '[00:08.00]Second version' }, storage).offset).toBe(0);
  });

  it('does not guess an absent album from a different player', () => {
    const { storage } = memoryStorage();
    writeDesktopLyricOffset(storage, createDesktopOffsetIdentity(track), 2.2);
    expect(useDesktopLyricOffset(track, packet, storage).offset).toBe(2.2);
    expect(useDesktopLyricOffset({ ...track, album: '', source: 'player-b', sessionId: 'session-b' }, packet, storage).offset).toBe(0);
    expect(useDesktopLyricOffset({ ...track, source: 'player-b', sessionId: 'session-b' }, packet, storage).offset).toBe(2.2);
  });
});
