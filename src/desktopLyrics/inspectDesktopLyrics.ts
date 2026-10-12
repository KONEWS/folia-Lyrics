import type { LyricPacket } from './bridge';

// src/desktopLyrics/inspectDesktopLyrics.ts: Inspect the same parsed content used by the visualizer, including encrypted QQ fallback.
export type DesktopLyricInspection = { usable: boolean; wordTimed: boolean };

// A provider's format label cannot prove word timing; require real timed words in a nonempty lyric line.
export async function inspectDesktopLyrics(packet: LyricPacket): Promise<DesktopLyricInspection> {
  try {
    const [{ parseDesktopLyrics }, { isInterludeLine }] = await Promise.all([
      import('./parseDesktopLyrics'), import('../utils/lyrics/parserCore'),
    ]);
    const parsed = await parseDesktopLyrics(packet);
    const lines = parsed?.lines.filter(line => !isInterludeLine(line) && line.fullText.trim().length > 0
      && Number.isFinite(line.startTime) && Number.isFinite(line.endTime) && line.endTime > line.startTime) ?? [];
    // The KRC parser can synthesize animation timings for a line without word tags; those are not provider word timing.
    const explicitTiming = packet.format !== 'krc' || packet.content.replace(/^\uFEFF/, '').split(/\r?\n/).some(line => /^\[\d+,\d+\]/.test(line)
      && /<\d+,[1-9]\d*(?:,\d+)?>[^<\r\n]+/.test(line));
    const wordTimed = Boolean(explicitTiming && parsed?.isWordByWord && lines.some(line => line.words.some(word => word.text.trim().length > 0
      && Number.isFinite(word.startTime) && Number.isFinite(word.endTime) && word.endTime > word.startTime)));
    return { usable: lines.length > 0, wordTimed };
  } catch { return { usable: false, wordTimed: false }; }
}
