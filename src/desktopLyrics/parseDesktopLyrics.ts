import { parseLyricsAsync } from '../utils/lyrics/workerClient';
import { parseLyricsByFormat } from '../utils/lyrics/parserCore';
import { detectTimedLyricFormat } from '../utils/lyrics/formatDetection';
import type { LyricPacket } from './bridge';

// src/desktopLyrics/parseDesktopLyrics.ts: Feed normalized provider data to the original Folia parser.
const SHORT_LRC_TEXT_LIMIT = 32 * 1024;

// Avoid worker startup for small line-timed lyrics; include translations and romanization in the text budget.
async function parseProviderLyrics(...args: Parameters<typeof parseLyricsAsync>) {
  const [format, content, translation, , romanization] = args;
  const shortLrc = format === 'lrc'
    && content.length + (translation?.length || 0) + (romanization?.length || 0) <= SHORT_LRC_TEXT_LIMIT;
  // Native live-sample checks run in Node and retain the same original parser without a browser Worker.
  if (shortLrc || typeof Worker === 'undefined') return parseLyricsByFormat(...args);
  return parseLyricsAsync(...args);
}
export async function parseDesktopLyrics(packet: LyricPacket) {
  if (packet.format === 'qq-qrc') {
    try {
      const { qrcDecrypt } = await import('../utils/lyrics/providers/qrcDecrypt');
      const content = await qrcDecrypt(packet.content);
      const decodeOptional = async (value?: string) => value ? qrcDecrypt(value).catch(() => '') : '';
      const translation = await decodeOptional(packet.translation), roma = await decodeOptional(packet.romanization);
      const format = /\[\d+,\d+\]/.test(content) ? 'qrc' : detectTimedLyricFormat(content);
      const parsed = await parseProviderLyrics(format, content, translation, {}, roma);
      if (parsed?.lines.length) return parsed;
    } catch { /* Some QQ tracks only offer a usable synchronized LRC fallback. */ }
    if (packet.fallbackContent) return parseProviderLyrics(detectTimedLyricFormat(packet.fallbackContent), packet.fallbackContent, packet.fallbackTranslation || '');
    throw new Error('QQ 逐字歌词解码失败，请选择其他版本或歌词源');
  }
  if (packet.format === 'yrc' || packet.format === 'krc' || packet.format === 'qrc' || packet.format === 'lrc') {
    const format = packet.format === 'lrc' ? detectTimedLyricFormat(packet.content) : packet.format;
    return parseProviderLyrics(format, packet.content, packet.translation || '', {}, packet.romanization || '');
  }
  const { LyricParserFactory } = await import('../utils/lyrics/LyricParserFactory');
  return LyricParserFactory.parse(packet.embedded ? { type: 'embedded', textContent: packet.content } : { type: 'local', lrcContent: packet.content });
}
