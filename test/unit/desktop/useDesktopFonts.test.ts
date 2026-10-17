import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesktopFonts } from '../../../src/desktopLyrics/useDesktopFonts';
import { desktopFontsReady, prepareDesktopFonts, type DesktopFontInput } from '../../../src/desktopLyrics/desktopFonts';
import { restoreUploadedLyricsFont } from '../../../src/services/customLyricsFont';
import { DESKTOP_DEFAULT_THEME } from '../../../src/desktopLyrics/desktopTheme';
import type { StoredCustomLyricsFont } from '../../../src/types';

// test/unit/desktop/useDesktopFonts.test.ts — async typography gates never expose stale measurements or clear a newer font selection.
type Slot = { value?: unknown; deps?: readonly unknown[]; cleanup?: (() => void) | void };
const hooks = vi.hoisted(() => ({ slots: [] as Slot[], cursor: 0, pending: [] as (() => void)[], writes: 0 }));
const typography = vi.hoisted(() => ({ font: null as StoredCustomLyricsFont | null, clear: vi.fn() }));
vi.mock('../../../src/services/customLyricsFont', () => ({ restoreUploadedLyricsFont: vi.fn() }));
vi.mock('../../../src/i18n/config', () => ({ default: { t: (key: string) => key } }));
vi.mock('../../../src/desktopLyrics/desktopFonts', async original => ({ ...await original<object>(), prepareDesktopFonts: vi.fn(), desktopFontsReady: vi.fn() }));
vi.mock('../../../src/stores/useTypographySettingsStore', () => ({ useTypographySettingsStore: Object.assign(
  (select: (state: object) => unknown) => select({ lyricsCustomFont: typography.font }),
  { getState: () => ({ lyricsCustomFont: typography.font, clearLyricsCustomFontAfterRestoreFailure: typography.clear }) },
) }));
vi.mock('react', () => {
  const same = (a?: readonly unknown[], b?: readonly unknown[]) => !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  return {
    useMemo: (create: () => unknown, deps: readonly unknown[]) => {
      const index = hooks.cursor++, old = hooks.slots[index];
      if (!old || !same(old.deps, deps)) hooks.slots[index] = { value: create(), deps };
      return hooks.slots[index].value;
    },
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!hooks.slots[index]) hooks.slots[index] = { value: initial };
      return [hooks.slots[index].value, (value: unknown) => { if (!Object.is(value, hooks.slots[index].value)) hooks.writes++; hooks.slots[index].value = value; }];
    },
    useEffect: (effect: () => (() => void) | void, deps: readonly unknown[]) => {
      const index = hooks.cursor++, old = hooks.slots[index];
      if (!old || !same(old.deps, deps)) {
        hooks.slots[index] = { deps };
        hooks.pending.push(() => { old?.cleanup?.(); hooks.slots[index].cleanup = effect(); });
      }
    },
  };
});
const prepare = vi.mocked(prepareDesktopFonts), restore = vi.mocked(restoreUploadedLyricsFont);
let cleanup: (() => void) | undefined;
beforeEach(() => {
  hooks.slots = []; hooks.cursor = 0; hooks.pending = []; hooks.writes = 0; typography.font = null;
  typography.clear.mockReset(); prepare.mockReset().mockResolvedValue(); restore.mockReset(); vi.mocked(desktopFontsReady).mockReset().mockReturnValue(false);
});
afterEach(() => { cleanup?.(); cleanup = undefined; });
const initial: DesktopFontInput = { lines: [{ startTime: 0, endTime: 20, fullText: '字形', words: [] }],
  theme: DESKTOP_DEFAULT_THEME, subtitleTheme: DESKTOP_DEFAULT_THEME, title: '', artist: '' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function mount(options = initial) {
  let input = options;
  const notice = vi.fn();
  const render = () => {
    hooks.cursor = 0;
    const ready = useDesktopFonts(input, notice);
    for (const effect of hooks.pending.splice(0)) effect();
    return ready;
  };
  cleanup = () => { for (const slot of hooks.slots) slot.cleanup?.(); };
  return { render, notice, update: (next: DesktopFontInput) => { input = next; return render(); }, unmount: cleanup,
    settle: async () => { for (let step = 0; step < 6; step++) await Promise.resolve(); return render(); } };
}

describe('desktop font layout gate', () => {
  it('keeps an already loaded font available across lyric and descriptive metadata updates', () => {
    vi.mocked(desktopFontsReady).mockReturnValue(true);
    const mounted = mount();
    expect(mounted.render()).toBe(true);
    expect(mounted.update({ ...initial, title: 'A new title', lines: [...initial.lines] })).toBe(true);
    expect(restore).not.toHaveBeenCalled(); expect(hooks.writes).toBe(0);
  });
  it('still restores an uploaded face even when the browser reports the fallback family ready', () => {
    vi.mocked(desktopFontsReady).mockReturnValue(true);
    typography.font = { source: 'uploaded', family: 'Unregistered', fontId: 'unregistered-ready', label: 'Upload' };
    restore.mockReturnValue(new Promise(() => {}));
    const mounted = mount(); expect(mounted.render()).toBe(false);
    expect(restore).toHaveBeenCalledTimes(1); expect(prepare).not.toHaveBeenCalled();
  });
  it('does no font or upload work without lyrics and waits for the current selection once lyrics arrive', async () => {
    const loading = deferred<void>(); prepare.mockReturnValue(loading.promise);
    const mounted = mount({ ...initial, lines: [] });
    expect(mounted.render()).toBe(true);
    expect(prepare).not.toHaveBeenCalled(); expect(restore).not.toHaveBeenCalled();
    expect(mounted.update(initial)).toBe(false);
    loading.resolve(); expect(await mounted.settle()).toBe(true);
    for (let render = 0; render < 20; render++) expect(mounted.render()).toBe(true);
    expect(prepare).toHaveBeenCalledTimes(1);
  });
  it('keeps the replacement layout gated when a previous font resolves late', async () => {
    const old = deferred<void>(), current = deferred<void>();
    prepare.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const mounted = mount(); expect(mounted.render()).toBe(false);
    const next = { ...initial, theme: { ...initial.theme, fontStyle: 'mono' as const } };
    expect(mounted.update(next)).toBe(false);
    old.resolve(); expect(await mounted.settle()).toBe(false);
    current.resolve(); expect(await mounted.settle()).toBe(true);
  });
  it('restores an uploaded FontFace before preparing any renderer font measurements', async () => {
    typography.font = { source: 'uploaded', family: 'Upload', fontId: 'gate-upload', label: 'Uploaded' };
    const registration = deferred<StoredCustomLyricsFont | null>(), loading = deferred<void>();
    restore.mockReturnValue(registration.promise); prepare.mockReturnValue(loading.promise);
    const mounted = mount(); expect(mounted.render()).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
    registration.resolve(typography.font); expect(await mounted.settle()).toBe(false);
    expect(prepare).toHaveBeenCalledTimes(1);
    loading.resolve(); expect(await mounted.settle()).toBe(true);
  });
  it.each(['system', 'uploaded', 'clear'])('does not clear a newer %s selection when an obsolete upload restore fails', async kind => {
    const oldId = `obsolete-${kind}`;
    typography.font = { source: 'uploaded', family: 'Old', fontId: oldId, label: 'Old' };
    const replacement: StoredCustomLyricsFont | null = kind === 'clear' ? null : kind === 'uploaded'
      ? { source: 'uploaded', family: 'NewUpload', fontId: 'replacement-upload', label: 'New upload' }
      : { source: 'system', family: 'Consolas', label: 'Consolas' };
    const old = deferred<StoredCustomLyricsFont | null>();
    restore.mockImplementation(id => id === oldId ? old.promise : Promise.resolve(replacement));
    const mounted = mount(); mounted.render();
    typography.font = replacement;
    mounted.update({ ...initial, theme: { ...initial.theme, fontFamily: replacement?.family } });
    expect(await mounted.settle()).toBe(true);
    old.resolve(null); expect(await mounted.settle()).toBe(true);
    expect(typography.clear).not.toHaveBeenCalled(); expect(mounted.notice).not.toHaveBeenCalled();
  });
  it('reports a missing upload through existing failure handling and the desktop notice', async () => {
    typography.font = { source: 'uploaded', family: 'Missing', fontId: 'missing-upload', label: 'Missing' };
    restore.mockResolvedValue(null);
    const mounted = mount(); mounted.render(); expect(await mounted.settle()).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
    expect(typography.clear).toHaveBeenCalledWith({ type: 'info', text: 'notifications.uploadedFontUnavailable' });
    expect(mounted.notice).toHaveBeenCalledWith('notifications.uploadedFontUnavailable');
  });
  it('reports an unreadable uploaded font and preserves the error fallback handling', async () => {
    typography.font = { source: 'uploaded', family: 'Broken', fontId: 'broken-upload', label: 'Broken' };
    restore.mockRejectedValue(new Error('font decode failed'));
    const mounted = mount(); mounted.render(); expect(await mounted.settle()).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
    expect(typography.clear).toHaveBeenCalledWith({ type: 'error', text: 'notifications.uploadedFontLoadFailed' });
    expect(mounted.notice).toHaveBeenCalledWith('notifications.uploadedFontLoadFailed');
  });
  it('does not update the layout gate after unmount', async () => {
    const loading = deferred<void>(); prepare.mockReturnValue(loading.promise);
    const mounted = mount(); mounted.render(); mounted.unmount();
    loading.resolve(); await mounted.settle();
    expect(hooks.writes).toBe(0);
  });
});
