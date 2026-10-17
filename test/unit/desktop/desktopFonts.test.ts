import { afterEach, describe, expect, it, vi } from 'vitest';
import { desktopFontRequests, desktopFontsReady, prepareDesktopFonts, type DesktopFontInput } from '../../../src/desktopLyrics/desktopFonts';
import { DESKTOP_DEFAULT_THEME } from '../../../src/desktopLyrics/desktopTheme';

// test/unit/desktop/desktopFonts.test.ts — selected font stacks, real lyric characters and declared weight variants gate measurement.
afterEach(() => { vi.unstubAllGlobals(); });
const input = (style: 'sans' | 'serif' | 'mono' = 'sans'): DesktopFontInput => ({
  lines: [{ startTime: 0, endTime: 10, fullText: '第一句', words: [{ text: '首', startTime: 0, endTime: 1 }], translation: 'Translation', romanization: 'unused' },
    { startTime: 10, endTime: 20, fullText: '末尾𠮷', words: [], backgroundVocal: { text: '和声', words: [], startTime: 10, endTime: 12 } }],
  theme: { ...DESKTOP_DEFAULT_THEME, fontStyle: style, fontWeight: 600 },
  subtitleTheme: { ...DESKTOP_DEFAULT_THEME, fontStyle: style }, title: '歌曲', artist: '演唱者',
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('desktop font preparation', () => {
  it('recognizes already loaded glyphs synchronously and keeps unloaded glyphs gated', () => {
    const check = vi.fn().mockReturnValue(true);
    vi.stubGlobal('document', { fonts: { check } });
    const requests = desktopFontRequests(input());
    expect(desktopFontsReady(requests)).toBe(true);
    expect(check).toHaveBeenCalledWith(requests[0].font, requests[0].text);
    check.mockReturnValue(false); expect(desktopFontsReady(requests)).toBe(false);
    check.mockImplementation(() => { throw new Error('invalid font'); }); expect(desktopFontsReady(requests)).toBe(false);
  });
  it('keeps unloaded declared weight variants gated even when the requested regular face is loaded', () => {
    const regular = { family: 'Selected', status: 'loaded' }, bold = { family: '"Selected"', status: 'loading' };
    const unrelated = { family: 'Other', status: 'unloaded' };
    vi.stubGlobal('document', { fonts: { check: () => true,
      forEach: (visit: (face: unknown) => void) => [regular, bold, unrelated].forEach(visit) } });
    const requests = [{ font: '400 16px "Selected", sans-serif', text: '实际字形' }];
    expect(desktopFontsReady(requests)).toBe(false);
    bold.status = 'loaded'; expect(desktopFontsReady(requests)).toBe(true);
  });
  it.each(['serif', 'mono'] as const)('does not select the bundled Noto Sans font for %s layouts', style => {
    const requests = desktopFontRequests(input(style));
    expect(requests).toHaveLength(2);
    for (const request of requests) expect(request.font).not.toContain('"Noto Sans CJK SC"');
    expect(requests[0].font).toMatch(/^600 16px /);
  });
  it('uses actual main/alternate/harmony characters and hides unused subtitle font requests', () => {
    const configured = input(), [main, subtitle] = desktopFontRequests(configured);
    for (const character of ['首', '末', '𠮷', '和', '声', '歌']) expect(main.text).toContain(character);
    expect(subtitle.text).toContain('T');
    expect(subtitle.text).not.toContain('u');
    expect(desktopFontRequests({ ...configured, hideTranslationSubtitle: true })).toHaveLength(1);
    expect(desktopFontRequests({ ...configured, showHarmonySubtitle: false })[0].text).not.toContain('声');
  });
  it('waits for the matched family weight variants and shares the same in-flight preparation', async () => {
    const load = deferred<FontFace[]>(), variant = deferred<FontFace>();
    const normal = { family: 'Selected', load: vi.fn().mockResolvedValue({}) };
    const bold = { family: 'Selected', load: vi.fn().mockReturnValue(variant.promise) };
    const unused = { family: 'Noto Sans CJK SC', load: vi.fn() };
    const fonts = { load: vi.fn().mockReturnValue(load.promise), forEach: (visit: (face: unknown) => void) => [normal, bold, unused].forEach(visit) };
    vi.stubGlobal('document', { fonts });
    const requests = [{ font: '600 16px "Selected"', text: '真𠮷' }];
    let ready = false;
    const first = prepareDesktopFonts(requests);
    expect(prepareDesktopFonts(requests)).toBe(first);
    void first.then(() => { ready = true; });
    expect(fonts.load).toHaveBeenCalledWith(requests[0].font, '真𠮷');
    load.resolve([normal as unknown as FontFace]);
    await Promise.resolve(); await Promise.resolve();
    expect(bold.load).toHaveBeenCalledTimes(1);
    expect(unused.load).not.toHaveBeenCalled();
    expect(ready).toBe(false);
    variant.resolve(bold as unknown as FontFace);
    await first;
    expect(ready).toBe(true);
  });
  it('uses normal fallback after a failed font load and works without the Font Loading API', async () => {
    vi.stubGlobal('document', { fonts: { load: vi.fn().mockRejectedValue(new Error('font missing')) } });
    await expect(prepareDesktopFonts(desktopFontRequests(input()))).resolves.toBeUndefined();
    vi.stubGlobal('document', {});
    await expect(prepareDesktopFonts(desktopFontRequests(input()))).resolves.toBeUndefined();
  });
});
