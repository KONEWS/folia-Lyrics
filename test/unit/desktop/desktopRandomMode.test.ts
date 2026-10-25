import { describe, expect, it } from 'vitest';
import { resolveDesktopRandomMode } from '@/desktopLyrics/visualFeatures/desktopRandomMode';
import type { VisualizerMode } from '@/types';

// Desktop media identity, rather than the upstream player's current song, owns automatic style changes.
const choose = (changes: Partial<Parameters<typeof resolveDesktopRandomMode>[0]> = {}) => resolveDesktopRandomMode({
    previousSong: 'player/song-a', song: 'player/song-a', enabled: true, mode: 'classic', pool: ['classic', 'sonnet'], ...changes,
}, () => 0);

describe('desktop random styles', () => {
    it('keeps the same style through metadata refreshes and enabling within the pool', () => {
        expect(choose().mode).toBe('classic');
        expect(choose({ previousSong: null }).mode).toBe('classic');
    });
    it('changes only once for a new song and avoids the previous style', () => {
        const next = choose({ song: 'player/song-b' });
        expect(next).toEqual({ song: 'player/song-b', mode: 'sonnet' });
        expect(choose({ previousSong: next.song, song: next.song, mode: next.mode })).toEqual(next);
    });
    it('retains the previous song across a temporary empty media session', () => {
        const empty = choose({ song: null });
        expect(empty).toEqual({ song: 'player/song-a', mode: 'classic' });
        expect(choose({ previousSong: empty.song, song: 'player/song-b' }).mode).toBe('sonnet');
    });
    it('honors pool edits, a single allowed style, and manual mode', () => {
        expect(choose({ pool: ['tilt'] }).mode).toBe('tilt');
        expect(choose({ song: 'player/song-b', mode: 'tilt', pool: ['tilt'] }).mode).toBe('tilt');
        expect(choose({ enabled: false, pool: ['tilt'], song: 'player/song-b' })).toEqual({ song: 'player/song-b', mode: 'classic' });
    });
    it('uses the complete desktop song identity, including the media source', () => {
        expect(choose({ previousSong: 'source-a/song', song: 'source-b/song' }).mode).toBe('sonnet');
    });
    it('filters obsolete and external candidates through the shared pool normalizer', () => {
        const pool = ['gone', 'mod:example:style', 'tilt'] as VisualizerMode[];
        expect(choose({ song: 'player/song-b', pool }).mode).toBe('tilt');
    });
});
