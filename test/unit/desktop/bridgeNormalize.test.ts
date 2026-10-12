import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, normalizeMessage, type Preferences } from '../../../src/desktopLyrics/bridge';
import { mergeDesktopPreferences } from '../../../src/desktopLyrics/desktopStateEquality';

// test/unit/desktop/bridgeNormalize.test.ts
// 宿主消息进入界面前的最后一道防线：字段缺失、非有限数、结构错误都不能让后续代码抛异常，
// 而格式正确的消息必须原样通过，否则界面会悄悄丢状态。
const session = {
  key: 'k', title: 't', artist: 'a', cover: '', source: 's', playing: true, position: 12.5, duration: 200,
  rate: 1, hasTimeline: true, sources: [{ id: 'x', label: 'X' }], album: null, sessionId: 'id', controls: null,
};

describe('normalizeMessage', () => {
  it('passes a well-formed session through unchanged', () => {
    expect(normalizeMessage({ type: 'session', data: session })).toEqual({ type: 'session', data: session });
  });

  it('repairs a session whose sources are missing or malformed', () => {
    const { sources: _ignored, ...withoutSources } = session;
    expect((normalizeMessage({ type: 'session', data: withoutSources }) as { data: { sources: unknown } }).data.sources).toEqual([]);
    const messy = normalizeMessage({ type: 'session', data: { ...session, sources: [null, 7, { id: 'a', label: 'A' }, { id: 5 }] } }) as { data: { sources: unknown } };
    expect(messy.data.sources).toEqual([{ id: 'a', label: 'A' }, { id: '5', label: '' }]);
  });

  it('replaces non-finite timeline numbers instead of letting NaN reach the clock', () => {
    const result = normalizeMessage({ type: 'session', data: { ...session, position: NaN, duration: Infinity, rate: 0 } }) as { data: { position: number; duration: number; rate: number } };
    expect(result.data).toMatchObject({ position: 0, duration: 0, rate: 1 });
    const negative = normalizeMessage({ type: 'clock', data: { position: 3, duration: 10, rate: -2, playing: true, hasTimeline: true } }) as { data: { rate: number } };
    expect(negative.data.rate).toBe(1);
  });

  it('keeps a valid clock untouched', () => {
    const clock = { position: 3, duration: 10, rate: 1.5, playing: true, hasTimeline: true };
    expect(normalizeMessage({ type: 'clock', data: clock })).toEqual({ type: 'clock', data: clock });
  });

  it('falls back to 48 kHz for a bad spectrum sample rate and drops frames without bins', () => {
    expect(normalizeMessage({ type: 'spectrum', data: { bins: 'AAAA', sampleRate: 44100 } })).toEqual({ type: 'spectrum', data: { bins: 'AAAA', sampleRate: 44100 } });
    for (const sampleRate of [0, -1, NaN, '48000', undefined]) {
      expect(normalizeMessage({ type: 'spectrum', data: { bins: 'AAAA', sampleRate } })).toEqual({ type: 'spectrum', data: { bins: 'AAAA', sampleRate: 48000 } });
    }
    expect(normalizeMessage({ type: 'spectrum', data: { bins: 123, sampleRate: 48000 } })).toBeNull();
    expect(normalizeMessage({ type: 'spectrum', data: { sampleRate: 48000 } })).toBeNull();
  });

  it('preserves explicit discovery choices and retains them across legacy or invalid partial packets', () => {
    const read = (data: unknown) => (normalizeMessage({ type: 'preferences', data }) as { data: Partial<Preferences> }).data;
    const disabled = mergeDesktopPreferences(DEFAULT_PREFERENCES, read({ autoDiscoverMusicApps: false }));
    expect(disabled.autoDiscoverMusicApps).toBe(false);
    expect(mergeDesktopPreferences(disabled, read({ topmost: true })).autoDiscoverMusicApps).toBe(false);
    for (const value of [undefined, null, 'false', 0, {}]) {
      expect(mergeDesktopPreferences(disabled, read({ autoDiscoverMusicApps: value }))).toBe(disabled);
    }
    expect(mergeDesktopPreferences(DEFAULT_PREFERENCES, read({})).autoDiscoverMusicApps).toBe(true);
    expect(mergeDesktopPreferences(disabled, read({ autoDiscoverMusicApps: true })).autoDiscoverMusicApps).toBe(true);
  });

  it('drops messages that have no usable envelope', () => {
    for (const bad of [null, undefined, 'session', 42, [], {}, { type: '' }, { type: 5, data: {} }, { type: 'session' }, { type: 'session', data: null },
      { type: 'session', data: [] }, { type: 'notice', data: 'text' }]) {
      expect(normalizeMessage(bad)).toBeNull();
    }
  });

  it('forwards other message types as they are', () => {
    const notice = { type: 'audioStatus', data: { text: '提示' } };
    expect(normalizeMessage(notice)).toBe(notice);
    const unknown = { type: 'somethingNew', data: { a: 1 } };
    expect(normalizeMessage(unknown)).toBe(unknown);
  });
});
