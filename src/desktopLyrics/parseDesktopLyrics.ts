import { LyricParserFactory } from '../utils/lyrics/LyricParserFactory';
import { parseLyricsByFormat } from '../utils/lyrics/parserCore';
import { detectTimedLyricFormat } from '../utils/lyrics/formatDetection';
import { qrcDecrypt } from '../utils/lyrics/providers/qrcDecrypt';
import type { LyricPacket } from './bridge';

// src/desktopLyrics/parseDesktopLyrics.ts: Feed normalized provider data to the original Folia parser.
export async function parseDesktopLyrics(packet: LyricPacket) {
  if (packet.format === 'qq-qrc') {
    try {
      const content = await qrcDecrypt(packet.content);
      const decodeOptional = async (value?: string) => value ? qrcDecrypt(value).catch(() => '') : '';
      const translation = await decodeOptional(packet.translation), roma = await decodeOptional(packet.romanization);
      const format = /\[\d+,\d+\]/.test(content) ? 'qrc' : detectTimedLyricFormat(content);
      const parsed = parseLyricsByFormat(format, content, translation, {}, roma);
      if (parsed.lines.length) return parsed;
    } catch { /* Some QQ tracks only offer a usable synchronized LRC fallback. */ }
    if (packet.fallbackContent) return parseLyricsByFormat(detectTimedLyricFormat(packet.fallbackContent), packet.fallbackContent, packet.fallbackTranslation || '');
    throw new Error('QQ 逐字歌词解码失败，请选择其他版本或歌词源');
  }
  if (packet.format === 'yrc' || packet.format === 'krc' || packet.format === 'qrc' || packet.format === 'lrc') {
    const format = packet.format === 'lrc' ? detectTimedLyricFormat(packet.content) : packet.format;
    return parseLyricsByFormat(format, packet.content, packet.translation || '', {}, packet.romanization || '');
  }
  return LyricParserFactory.parse(packet.embedded ? { type: 'embedded', textContent: packet.content } : { type: 'local', lrcContent: packet.content });
}
