import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseLyricsByFormat } from '../../../src/utils/lyrics/parserCore';
import { parseLyricsAsync } from '../../../src/utils/lyrics/workerClient';
import { buildFoliaLyricDocument, serializeFoliaLyricDocument } from '../../../src/utils/lyrics/foliaLyricDocument';
import { parseDesktopLyrics } from '../../../src/desktopLyrics/parseDesktopLyrics';
import type { LyricPacket } from '../../../src/desktopLyrics/bridge';

// test/unit/desktop/parseDesktopLyrics.test.ts — bounded main-thread and worker routes retain the original parser's complete lyric data.
vi.mock('../../../src/utils/lyrics/workerClient', () => ({
  parseLyricsAsync: vi.fn(async (...args: Parameters<typeof parseLyricsByFormat>) => parseLyricsByFormat(...args)),
}));
const base: LyricPacket = { key: 'song', title: 'Song', artist: 'Artist', source: 'test', cover: '', embedded: false, content: '' };
const ttml = '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Word"><head><metadata><ttm:agent type="person" xml:id="v1"><ttm:name>Singer</ttm:name></ttm:agent></metadata></head><body dur="00:03.000"><div begin="00:01.000" end="00:03.000" itunes:songPart="Verse"><p begin="00:01.000" end="00:03.000" itunes:key="L1" ttm:agent="v1"><span begin="00:01.000" end="00:02.000">你</span><span begin="00:02.000" end="00:03.000">好</span><span ttm:role="x-translation" xml:lang="zh-CN">Hello</span></p></div></body></tt>';
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('Worker', class {}); });
afterEach(() => vi.unstubAllGlobals());
describe('desktop parser routing', () => {
  it.each([
    ['lrc', '[00:01.00]你好\n[00:03.00]下一行'],
    ['yrc', '[1000,2000](1000,1000,0)你(2000,1000,0)好'],
    ['qrc', '[1000,2000]你(1000,1000)好(2000,1000)'],
    ['krc', '[1000,2000]<0,1000,0>你<1000,1000,0>好'],
  ] as const)('retains %s words, time bounds, translations, romanization and render hints', async (format, content) => {
    const translation = '[00:01.00]Hello', romanization = '[00:01.00]Ni hao';
    const parsed = await parseDesktopLyrics({ ...base, format, content, translation, romanization });
    expect(parsed).toEqual(parseLyricsByFormat(format, content, translation, {}, romanization));
    expect(parsed?.lines.some(line => line.fullText.includes('你'))).toBe(true);
    if (format === 'lrc') expect(parseLyricsAsync).not.toHaveBeenCalled();
    else expect(parseLyricsAsync).toHaveBeenCalledWith(format, content, translation, {}, romanization);
    expect(parsed?.isWordByWord).toBe(format !== 'lrc');
  });
  it('keeps enhanced LRC word timing even when the native packet says LRC', async () => {
    const content = '[00:01.000]<00:01.000>你<00:02.000>好<00:03.000>';
    const parsed = await parseDesktopLyrics({ ...base, format: 'lrc', content });
    expect(parsed).toEqual(parseLyricsByFormat('enhanced-lrc', content, '', {}, ''));
    expect(parseLyricsAsync).toHaveBeenCalledWith('enhanced-lrc', content, '', {}, '');
  });
  it.each([32 * 1024, 32 * 1024 + 1])('routes ordinary LRC at the %i-character boundary without changing parsed data', async length => {
    const content = '[00:01.00]' + 'x'.repeat(length - '[00:01.00]'.length);
    const parsed = await parseDesktopLyrics({ ...base, format: 'lrc', content });
    expect(content.length).toBe(length);
    expect(parsed).toEqual(parseLyricsByFormat('lrc', content, '', {}, ''));
    if (length <= 32 * 1024) expect(parseLyricsAsync).not.toHaveBeenCalled();
    else expect(parseLyricsAsync).toHaveBeenCalledWith('lrc', content, '', {}, '');
  });
  it.each(['translation', 'romanization'] as const)('counts long %s toward the short-LRC budget', async field => {
    const content = '[00:01.00]Hello';
    const sidecar = '[00:01.00]' + 'x'.repeat(32 * 1024 + 1 - content.length - '[00:01.00]'.length);
    const packet = { ...base, format: 'lrc' as const, content, [field]: sidecar };
    const parsed = await parseDesktopLyrics(packet);
    expect(content.length + sidecar.length).toBe(32 * 1024 + 1);
    expect(parsed).toEqual(parseLyricsByFormat('lrc', content, packet.translation || '', {}, packet.romanization || ''));
    expect(parseLyricsAsync).toHaveBeenCalledWith('lrc', content, packet.translation || '', {}, packet.romanization || '');
  });
  it('counts content, translation and romanization together at the inclusive boundary', async () => {
    const content = '[00:01.00]Hello', translation = '[00:01.00]你好';
    const romanization = '[00:01.00]' + 'x'.repeat(32 * 1024 - content.length - translation.length - '[00:01.00]'.length);
    const parsed = await parseDesktopLyrics({ ...base, format: 'lrc', content, translation, romanization });
    expect(content.length + translation.length + romanization.length).toBe(32 * 1024);
    expect(parsed).toEqual(parseLyricsByFormat('lrc', content, translation, {}, romanization));
    expect(parseLyricsAsync).not.toHaveBeenCalled();
  });
  it('keeps TTML through the original local adapter and worker with embedded translation', async () => {
    const parsed = await parseDesktopLyrics({ ...base, format: 'ttml', content: ttml });
    expect(parsed?.lines.find(line => line.fullText === '你好')?.translation).toBe('Hello');
    expect(parsed?.lines.find(line => line.fullText === '你好')?.words.map(word => [word.startTime, word.endTime])).toEqual([[1, 2], [2, 3]]);
    expect(parseLyricsAsync).toHaveBeenCalled();
    expect(vi.mocked(parseLyricsAsync).mock.calls.at(-1)?.[0]).toBe('ttml');
  });
  it('imports FIA precise timing directly without creating a worker request', async () => {
    const lyrics = { isWordByWord: true, lines: [{ fullText: '你好', translation: 'Hello', startTime: 1, endTime: 3,
      words: [{ text: '你', startTime: 1, endTime: 2 }, { text: '好', startTime: 2, endTime: 3 }] }] };
    const content = serializeFoliaLyricDocument(buildFoliaLyricDocument(lyrics));
    const parsed = await parseDesktopLyrics({ ...base, format: 'fia', content });
    expect(parsed?.lines[0].words).toEqual(lyrics.lines[0].words);
    expect(parsed?.lines[0].translation).toBe('Hello');
    expect(parseLyricsAsync).not.toHaveBeenCalled();
  });
  it('retains the synchronized LRC fallback when encrypted QQ data fails', async () => {
    const content = '[00:01.00]Fallback', translation = '[00:01.00]备用歌词';
    const parsed = await parseDesktopLyrics({ ...base, format: 'qq-qrc', content: 'invalid-hex', fallbackContent: content, fallbackTranslation: translation });
    expect(parsed).toEqual(parseLyricsByFormat('lrc', content, translation));
    expect(parseLyricsAsync).not.toHaveBeenCalled();
  });
  it.each([
    ['lrc', '[00:01.00]' + 'x'.repeat(32 * 1024)],
    ['yrc', '[1000,2000](1000,1000,0)你(2000,1000,0)好'],
  ] as const)('preserves the existing native %s checks in Node without a browser Worker', async (format, content) => {
    vi.unstubAllGlobals();
    const translation = '[00:01.00]实采样本';
    expect(await parseDesktopLyrics({ ...base, format, content, translation }))
      .toEqual(parseLyricsByFormat(format, content, translation, {}, ''));
    expect(parseLyricsAsync).not.toHaveBeenCalled();
  });
});
