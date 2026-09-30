import { describe, expect, it } from 'vitest';
import { clockPosition, type ManualClock } from '../src/desktopLyrics/clock';
import type { Clock } from '../src/desktopLyrics/bridge';
import { normalizeEmbeddedLrcText } from '../src/utils/lyrics/embeddedLrcNormalization';
import { detectTimedLyricFormat } from '../src/utils/lyrics/formatDetection';
import { parseLyricsByFormat } from '../src/utils/lyrics/parserCore';
import { parseDesktopLyrics } from '../src/desktopLyrics/parseDesktopLyrics';
import { DesktopClockValue } from '../src/desktopLyrics/DesktopClockValue';

// test/desktopClock.test.ts
const clock: Clock = { position: 20, duration: 120, playing: true, rate: 1, hasTimeline: true, received: 1000 };
const manual: ManualClock = { enabled: false, playing: false, position: 0, received: 0 };
describe('Paused mode subscriptions', () => {
  it('initializes a late renderer without advancing the player clock', async () => {
    const value = new DesktopClockValue(36), received: number[] = [];
    const unsubscribe = value.on('change', time => received.push(time));
    await Promise.resolve();
    expect(received).toEqual([36]); expect(value.get()).toBe(36);
    value.set(36); expect(received).toEqual([36]);
    value.set(12); expect(received).toEqual([36, 12]);
    unsubscribe(); value.destroy();
  });
  it('does not initialize a renderer that unmounted before the replay', async () => {
    const value = new DesktopClockValue(36), received: number[] = [];
    const unsubscribe = value.on('change', time => received.push(time));
    unsubscribe(); await Promise.resolve();
    expect(received).toEqual([]); value.destroy();
  });
});
describe('External player clock', () => {
  it('interpolates between host updates', () => expect(clockPosition(clock, 1500, manual)).toBe(20.5));
  it('does not move while paused', () => expect(clockPosition({ ...clock, playing: false }, 8000, manual)).toBe(20));
  it('accepts a backwards seek immediately', () => expect(clockPosition({ ...clock, position: 4, received: 9000 }, 9100, manual)).toBe(4.1));
  it('honors playback speed and track duration', () => expect(clockPosition({ ...clock, position: 119, rate: 2 }, 2000, manual)).toBe(120));
  it('stops extrapolating a stale native connection after two seconds', () => expect(clockPosition(clock, 21000, manual)).toBe(22));
  it('does not invent a timeline when one is unavailable', () => expect(clockPosition({ ...clock, hasTimeline: false }, 2000, manual)).toBe(0));
  it('supports independent manual timing and pause', () => {
    expect(clockPosition(clock, 2000, { enabled: true, playing: true, position: 90, received: 1000 })).toBe(91);
    expect(clockPosition(clock, 2000, { enabled: true, playing: false, position: 30, received: 1000 })).toBe(30);
  });
});
it('retains word timing and separates embedded translation from the main lyric', () => {
  const raw = '[00:01.000]<00:01.000>あ<00:01.500>した<00:02.000>\n[00:01.000]明天\n[00:03.000]<00:03.000>ひかり<00:04.000>';
  const n = normalizeEmbeddedLrcText(raw);
  const result = parseLyricsByFormat(detectTimedLyricFormat(n.mainText), n.mainText, n.translationText, {}, n.romanizationText);
  expect(result.lines[0].words[0].text).toBe('あ');
  expect(result.lines[0].words[0].startTime).toBe(1);
  expect(result.lines[0].translation).toBe('明天');
});
it('keeps online translation on the matching line', async () => {
  const parsed = await parseDesktopLyrics({ key: 'test', title: 'Test', artist: 'Test', source: 'test', cover: '', embedded: false,
    format: 'lrc', content: '[00:01.00]あした\n[00:03.00]ひかり', translation: '[00:01.00]明天\n[00:03.00]光芒' });
  expect(parsed?.lines[0].translation).toBe('明天'); expect(parsed?.lines[0].startTime).toBe(1);
});
it('retains online KRC word timing', async () => {
  const parsed = await parseDesktopLyrics({ key: 'test', title: 'Test', artist: 'Test', source: 'test', cover: '', embedded: false,
    format: 'krc', content: '[1000,2000]<0,1000,0>明<1000,1000,0>天\n[4000,1000]<0,1000,0>光' });
  expect(parsed?.lines[0].words[1].startTime).toBe(2);
});
it('falls back to synchronized LRC if a QRC payload is corrupt', async () => {
  const parsed = await parseDesktopLyrics({ key: 'test', title: 'Test', artist: 'Test', source: 'test', cover: '', embedded: false,
    format: 'qq-qrc', content: 'not-valid-hex', fallbackContent: '[00:01.00]あした\n[00:03.00]ひかり', fallbackTranslation: '[00:01.00]明天' });
  expect(parsed?.lines[0].translation).toBe('明天'); expect(parsed?.lines[0].startTime).toBe(1);
});
