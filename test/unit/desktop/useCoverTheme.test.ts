import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCoverTheme } from '../../../src/desktopLyrics/useCoverTheme';
import { extractRepresentativeColors } from '../../../src/utils/colorExtractor';
import { buildCoverTheme } from '../../../src/desktopLyrics/coverTheme';
import { DEFAULT_THEME } from '../../../src/services/baseThemes';

// test/unit/desktop/useCoverTheme.test.ts — exercise real hook callbacks and async guards with persistent hook slots.
type Slot = { value?: unknown; deps?: readonly unknown[]; cleanup?: (() => void) | void };
const hooks = vi.hoisted(() => ({ slots: [] as Slot[], cursor: 0, pending: [] as (() => void)[], writes: 0 }));
vi.mock('../../../src/utils/colorExtractor', () => ({ extractRepresentativeColors: vi.fn() }));
vi.mock('react', () => {
  const same = (a?: readonly unknown[], b?: readonly unknown[]) => !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const memo = (create: () => unknown, deps: readonly unknown[]) => {
    const index = hooks.cursor++, old = hooks.slots[index];
    if (!old || !same(old.deps, deps)) hooks.slots[index] = { value: create(), deps };
    return hooks.slots[index].value;
  };
  return {
    useMemo: memo,
    useCallback: (callback: () => unknown, deps: readonly unknown[]) => memo(() => callback, deps),
    useRef: (current: unknown) => {
      const index = hooks.cursor++;
      if (!hooks.slots[index]) hooks.slots[index] = { value: { current } };
      return hooks.slots[index].value;
    },
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!hooks.slots[index]) hooks.slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [hooks.slots[index].value, (next: unknown) => {
        const value = typeof next === 'function' ? next(hooks.slots[index].value) : next;
        if (!Object.is(value, hooks.slots[index].value)) hooks.writes++;
        hooks.slots[index].value = value;
      }];
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
const colors = ['#246edc', '#dc5432'];
const extract = vi.mocked(extractRepresentativeColors);
let cleanup: (() => void) | undefined;
beforeEach(() => { hooks.slots = []; hooks.cursor = 0; hooks.pending = []; hooks.writes = 0; extract.mockReset(); });
afterEach(() => { cleanup?.(); cleanup = undefined; vi.restoreAllMocks(); });

// Commit dependency-aware effects and state updates; async resolutions are flushed explicitly by each test.
function mount(initialCover = 'A', initialEnabled = true) {
  let cover = initialCover, enabled = initialEnabled;
  const render = () => {
    let output: ReturnType<typeof useCoverTheme>, previousWrites: number;
    do {
      previousWrites = hooks.writes; hooks.cursor = 0; output = useCoverTheme(cover, enabled);
      for (const effect of hooks.pending.splice(0)) effect();
    } while (previousWrites !== hooks.writes);
    return output!;
  };
  cleanup = () => { for (const slot of hooks.slots) slot.cleanup?.(); };
  return { render, update: (nextCover: string, nextEnabled = enabled) => { cover = nextCover; enabled = nextEnabled; return render(); },
    settle: async () => { await Promise.resolve(); await Promise.resolve(); return render(); }, unmount: cleanup };
}
function deferred() {
  let resolve!: (value: string[]) => void;
  const promise = new Promise<string[]>(accept => { resolve = accept; });
  return { promise, resolve };
}

describe('desktop cover theme refresh', () => {
  it('keeps the automatic and refreshed palettes stable across pause-like renders without reading the image again', async () => {
    extract.mockResolvedValue(colors); vi.spyOn(Math, 'random').mockReturnValue(.5);
    const mounted = mount(); expect(mounted.render().refreshUnavailableReason).toBe('loading');
    const automatic = await mounted.settle(); expect(automatic.canRefresh).toBe(true);
    expect(automatic.theme).toEqual(buildCoverTheme(colors));
    for (let i = 0; i < 10; i++) expect(mounted.render().theme).toBe(automatic.theme);
    const request = automatic.refresh(); expect(mounted.render().refreshing).toBe(true);
    expect(await request).toBe(true);
    const refreshed = mounted.render(); expect(refreshed.refreshing).toBe(false);
    expect(refreshed.theme.accentColor).not.toBe(automatic.theme.accentColor);
    expect(refreshed.style['--cover-accent' as keyof typeof refreshed.style]).toBe(refreshed.theme.accentColor);
    for (let i = 0; i < 10; i++) expect(mounted.render().theme).toBe(refreshed.theme);
    expect(extract).toHaveBeenCalledTimes(1);
  });
  it('accepts only the newest refresh during rapid clicks', async () => {
    extract.mockResolvedValue(colors);
    const mounted = mount(); mounted.render(); const ready = await mounted.settle();
    const first = ready.refresh(), second = ready.refresh();
    expect(await first).toBe(false); expect(await second).toBe(true);
    expect(mounted.render().refreshing).toBe(false); expect(extract).toHaveBeenCalledTimes(1);
  });
  it('discards late extraction from the previous song without caching its obsolete result', async () => {
    const a = deferred(), b = deferred(); extract.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise).mockResolvedValue(colors);
    const mounted = mount(); mounted.render(); mounted.update('B');
    b.resolve(['#dc5432']); const current = await mounted.settle();
    a.resolve(['#246edc']); expect((await mounted.settle()).theme).toBe(current.theme);
    expect(mounted.update('A').theme).toBe(DEFAULT_THEME); await mounted.settle(); expect(extract).toHaveBeenCalledTimes(3);
  });
  it('cancels a refresh when the current artwork changes and restores the prior palette when returning', async () => {
    extract.mockResolvedValue(colors);
    const mounted = mount(); mounted.render(); const ready = await mounted.settle();
    const request = ready.refresh(); mounted.update('B');
    expect(await request).toBe(false); await mounted.settle();
    expect(mounted.update('A').theme).toBe(ready.theme); expect(mounted.render().refreshing).toBe(false);
    expect(extract).toHaveBeenCalledTimes(2);
  });
  it('ignores pending extraction after disabling and re-extracts when enabled again', async () => {
    const pending = deferred(); extract.mockReturnValueOnce(pending.promise).mockResolvedValue(colors);
    const mounted = mount(); mounted.render(); expect(mounted.update('A', false).refreshUnavailableReason).toBe('disabled');
    pending.resolve(colors); expect((await mounted.settle()).theme).toBe(DEFAULT_THEME);
    mounted.update('A', true); expect((await mounted.settle()).canRefresh).toBe(true); expect(extract).toHaveBeenCalledTimes(2);
  });
  it('cancels manual refresh on disabling but retains completed session palettes when re-enabled', async () => {
    extract.mockResolvedValue(colors);
    const mounted = mount(); mounted.render(); const ready = await mounted.settle();
    const request = ready.refresh(); mounted.update('A', false); expect(await request).toBe(false);
    expect(mounted.update('A', true).theme).toBe(ready.theme); expect(extract).toHaveBeenCalledTimes(1);
  });
  it('does not update state after unmount while extraction is pending', async () => {
    const pending = deferred(); extract.mockReturnValue(pending.promise);
    const mounted = mount(); mounted.render(); mounted.unmount(); const writes = hooks.writes;
    pending.resolve(colors); await Promise.resolve(); await Promise.resolve(); expect(hooks.writes).toBe(writes);
  });
  it('does not update state or allow an old callback after unmount during refresh', async () => {
    extract.mockResolvedValue(colors);
    const mounted = mount(); mounted.render(); const ready = await mounted.settle();
    const request = ready.refresh(); mounted.unmount(); const writes = hooks.writes;
    expect(await request).toBe(false); expect(await ready.refresh()).toBe(false); expect(hooks.writes).toBe(writes);
  });
  it.each([['', true, 'missing-cover'], ['A', false, 'disabled']] as const)('does not load or refresh %s with enabled=%s', async (cover, enabled, reason) => {
    const mounted = mount(cover, enabled), result = mounted.render();
    expect(result.canRefresh).toBe(false); expect(result.refreshUnavailableReason).toBe(reason);
    expect(await result.refresh()).toBe(false); expect(result.theme).toBe(DEFAULT_THEME); expect(extract).not.toHaveBeenCalled();
  });
  it('keeps black-and-white artwork neutral and disables refresh without random generation', async () => {
    extract.mockResolvedValue(['#000000', '#ffffff', '#888888']); const random = vi.spyOn(Math, 'random');
    const mounted = mount(); mounted.render(); const result = await mounted.settle();
    expect(result.refreshUnavailableReason).toBe('neutral'); expect(result.canRefresh).toBe(false);
    expect(await result.refresh()).toBe(false); expect(mounted.render().theme).toBe(result.theme);
    expect(random).not.toHaveBeenCalled(); expect(extract).toHaveBeenCalledTimes(1);
  });
  it.each(['empty', 'rejected', 'invalid'])('disables unreadable covers after %s extraction', async failure => {
    if (failure === 'rejected') extract.mockRejectedValue(new Error('unreadable'));
    else extract.mockResolvedValue(failure === 'invalid' ? ['invalid'] : []);
    const mounted = mount(); mounted.render(); const result = await mounted.settle();
    expect(result.theme).toBe(DEFAULT_THEME); expect(result.refreshUnavailableReason).toBe('unreadable');
    expect(result.canRefresh).toBe(false); expect(await result.refresh()).toBe(false);
  });
  it('remembers manual palettes when returning and bounds cover URL retention to four entries', async () => {
    extract.mockResolvedValue(colors);
    const mounted = mount(); mounted.render(); const ready = await mounted.settle(); await ready.refresh(); const manual = mounted.render().theme;
    for (const cover of ['B', 'C', 'D']) { mounted.update(cover); await mounted.settle(); }
    expect(mounted.update('A').theme).toBe(manual); expect(extract).toHaveBeenCalledTimes(4);
    mounted.update('E'); await mounted.settle(); mounted.update('B'); await mounted.settle();
    expect(extract).toHaveBeenCalledTimes(6); expect(mounted.update('A').theme).toBe(manual);
  });
});
