import { describe, expect, it } from 'vitest';
import { normalizeMessage, DEFAULT_PREFERENCES } from '../../../src/desktopLyrics/bridge';
import { mergeDesktopPreferences } from '../../../src/desktopLyrics/desktopStateEquality';
import { normalizeMusicAppCandidates, normalizeMusicApps } from '../../../src/types/desktopMusicApps';

// test/unit/desktop/musicAppDiscovery.test.ts — legacy shortcuts and Store identities survive bounded host normalization.
const exe = { slot: 0, id: 'exe-1', name: 'Player', path: 'C:\\Player.exe', icon: '' };
const store = { slot: 2, id: 'store-1', name: '椒盐音乐', path: '', icon: '', launchKind: 'store', appUserModelId: 'Salt_family!Salt' };
describe('music app discovery contract', () => {
  it('accepts legacy executables and Store apps without executable paths', () => {
    expect(normalizeMusicApps([exe, store])).toMatchObject([{ slot: 0, launchKind: 'exe' }, { slot: 2, launchKind: 'store', path: '' }]);
  });
  it('rejects incomplete identities, duplicate candidate IDs and invalid slots', () => {
    expect(normalizeMusicApps([{ ...exe, slot: -1 }, { ...store, appUserModelId: '' }, { ...exe, path: '' }, null])).toEqual([]);
    expect(normalizeMusicAppCandidates([store, store, { ...exe, id: '' }, null])).toHaveLength(1);
  });
  it('requires a valid discovery envelope and preserves the opaque batch', () => {
    expect(normalizeMessage({ type: 'musicAppDiscovery', data: { candidates: [store] } })).toBeNull();
    expect(normalizeMessage({ type: 'musicAppDiscovery', data: { batchId: 'b1', busy: false, candidates: [store] } })).toMatchObject({ data: { batchId: 'b1', candidates: [{ id: 'store-1', path: '' }] } });
  });
  it('partial preference replies preserve blocked apps and legacy bindings', () => {
    const previous = { ...DEFAULT_PREFERENCES, blockedMusicApps: normalizeMusicAppCandidates([store]), musicApps: normalizeMusicApps([exe]) };
    const packet = normalizeMessage({ type: 'preferences', data: { topmost: true, blockedMusicApps: null } });
    if (packet?.type !== 'preferences') throw new Error('expected preferences');
    const merged = mergeDesktopPreferences(previous, packet.data);
    expect(merged.blockedMusicApps).toBe(previous.blockedMusicApps); expect(merged.musicApps).toBe(previous.musicApps);
  });
  it('keeps equal discovery preferences stable but notices changed Store identities', () => {
    const previous = { ...DEFAULT_PREFERENCES, musicApps: normalizeMusicApps([store]), blockedMusicApps: normalizeMusicAppCandidates([exe]) };
    expect(mergeDesktopPreferences(previous, { ...previous, musicApps: [...previous.musicApps], blockedMusicApps: [...previous.blockedMusicApps] })).toBe(previous);
    expect(mergeDesktopPreferences(previous, { musicApps: normalizeMusicApps([{ ...store, appUserModelId: 'Salt_other!Salt' }]) })).not.toBe(previous);
  });
});
