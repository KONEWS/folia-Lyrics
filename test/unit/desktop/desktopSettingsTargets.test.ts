import { describe, expect, it } from 'vitest';
import { normalizeMessage } from '../../../src/desktopLyrics/bridge';
import { normalizeDesktopSettingsTarget } from '../../../src/types/desktopSettings';

// test/unit/desktop/desktopSettingsTargets.test.ts — validate destination identity without guessing from localized text.
describe('desktop settings notice targets', () => {
  it('preserves a native binding slot and ignores unrelated payload fields', () => {
    expect(normalizeMessage({ type: 'notice', data: { text: '软件路径失效', target: { id: 'music-app-binding', slot: 7, extra: true } } }))
      .toEqual({ type: 'notice', data: { text: '软件路径失效', target: { id: 'music-app-binding', slot: 7 } } });
  });

  it('accepts explicit host navigation only with a validated destination', () => {
    expect(normalizeMessage({ type: 'openSettings', data: { target: { id: 'audio' } } }))
      .toEqual({ type: 'openSettings', data: { target: { id: 'audio' } } });
    expect(normalizeMessage({ type: 'openSettings', data: { target: { id: 'unknown' } } })).toBeNull();
  });

  it('keeps every supported destination without inspecting message text', () => {
    for (const id of ['player-source', 'music-apps', 'music-app-add', 'manual-clock', 'online-search', 'online-sources',
      'online-results', 'local-import', 'local-folders', 'audio', 'segmentation', 'visual-settings', 'background-settings'])
      expect(normalizeDesktopSettingsTarget({ id })).toEqual({ id });
  });

  it('keeps legacy or malformed destinations as a dismissible notice instead of inventing a destination', () => {
    for (const target of [undefined, null, 'audio', {}, { id: 'unknown' }, { id: 'music-app-binding', slot: -1 },
      { id: 'music-app-binding', slot: '1' }, { id: 'music-app-binding', slot: 1.2 }, { id: 'music-app-binding', slot: Infinity }])
      expect(normalizeMessage({ type: 'notice', data: { text: '提示', target } }))
        .toEqual({ type: 'notice', data: { text: '提示', target: undefined } });
    expect(normalizeMessage({ type: 'notice', data: { target: { id: 'audio' } } })).toBeNull();
  });
});
