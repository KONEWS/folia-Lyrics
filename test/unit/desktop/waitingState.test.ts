import { describe, expect, it } from 'vitest';
import { EMPTY, EMPTY_ONLINE, DEFAULT_PREFERENCES } from '../../../src/desktopLyrics/bridge';
import { waitingState } from '../../../src/desktopLyrics/waitingState';

// test/unit/desktop/waitingState.test.ts — truthful next steps across lookup, player and lyric preparation states.
const connected = () => ({ session: { ...EMPTY, key: 'current-song', title: 'Song', source: 'Player' },
  online: { ...EMPTY_ONLINE, key: 'current-song' }, preferences: { ...DEFAULT_PREFERENCES }, connectionError: '', lyricStatus: 'idle' as const });

describe('desktop waiting actions', () => {
  it('offers player selection when no session has been detected', () => {
    expect(waitingState({ ...connected(), session: EMPTY, online: EMPTY_ONLINE })).toEqual({ kind: 'no-player', action: 'player' });
  });
  it('does not confuse an available unbound player with a connected song', () => {
    expect(waitingState({ ...connected(), session: { ...EMPTY, sources: [{ id: 'player', label: 'Player' }] }, online: EMPTY_ONLINE }).kind).toBe('no-player');
  });
  it('recognizes a connected player that has not supplied a song title', () => {
    expect(waitingState({ ...connected(), session: { ...EMPTY, source: 'Player', sessionId: 'session' }, online: EMPTY_ONLINE })).toEqual({ kind: 'connected-empty', action: 'online' });
  });
  it('does not claim an initial empty online packet is a failed attempt', () => {
    expect(waitingState(connected())).toEqual({ kind: 'connected-empty', action: 'online' });
  });
  it.each(['matching', 'failed'] as const)('ignores stale %s metadata from the previous song', phase => {
    expect(waitingState({ ...connected(), online: { ...EMPTY_ONLINE, key: 'previous-song', phase, busy: true, errors: ['old'] } }).kind).toBe('connected-empty');
  });
  it('shows matching during local and cache lookup before a network request is busy', () => {
    expect(waitingState({ ...connected(), online: { ...connected().online, phase: 'matching', busy: false } })).toEqual({ kind: 'matching', action: 'online' });
  });
  it('supports a busy packet from an older host without phase metadata', () => {
    expect(waitingState({ ...connected(), online: { ...connected().online, busy: true } }).kind).toBe('matching');
  });
  it('offers retry after a completed lookup with no results and no provider errors', () => {
    expect(waitingState({ ...connected(), online: { ...connected().online, phase: 'failed' } })).toEqual({ kind: 'failed', action: 'retry' });
  });
  it.each(['choice', 'ready', 'idle'] as const)('does not mistake partial or previous source errors for failure in phase %s', phase => {
    expect(waitingState({ ...connected(), online: { ...connected().online, phase, errors: ['one unavailable source'] } }).kind).toBe('connected-empty');
  });
  it('supports an explicit failure from an older host without phase metadata', () => {
    expect(waitingState({ ...connected(), online: { ...connected().online, errors: ['network failed'] } }).kind).toBe('failed');
  });
  it.each(['disabled', 'no-providers'])('does not offer a network retry with online matching %s', condition => {
    const base = connected();
    const preferences = condition === 'disabled' ? { ...base.preferences, onlineEnabled: false } : { ...base.preferences, onlineProviders: [] };
    expect(waitingState({ ...base, preferences, online: { ...base.online, phase: 'failed' } })).toEqual({ kind: 'failed', action: 'import' });
  });
  it('opens manual search instead of retrying a missing song title', () => {
    const base = connected();
    expect(waitingState({ ...base, session: { ...base.session, title: '' }, online: { ...base.online, phase: 'failed' } }).action).toBe('online');
  });
  it('keeps preparation visible after lyrics arrive, even when the network phase is ready', () => {
    expect(waitingState({ ...connected(), online: { ...connected().online, phase: 'ready' }, lyricStatus: 'parsing' })).toEqual({ kind: 'matching', action: 'parsing' });
  });
  it('offers a replacement file for lyrics without a usable time axis', () => {
    expect(waitingState({ ...connected(), lyricStatus: 'invalid' })).toEqual({ kind: 'failed', action: 'import' });
  });
  it('points a disconnected media session back to player selection', () => {
    expect(waitingState({ ...connected(), connectionError: 'connection lost', online: { ...connected().online, phase: 'failed' } })).toEqual({ kind: 'no-player', action: 'player' });
  });
});
