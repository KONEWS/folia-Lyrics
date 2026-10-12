import { describe, expect, it, vi } from 'vitest';
import en from '../../../src/i18n/locales/en';
import zhCN from '../../../src/i18n/locales/zh-CN';
import ind from '../../../src/i18n/locales/in';
import { flattenLocale } from '../../../src/i18n/flattenLocale';

// test/unit/i18n/flattenLocale.test.ts — the linear flatten matches the copying version it replaced, key for key and in order,
// and config.ts builds the Chinese fallback table only when a key is missing from every language.
const probe = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../../../src/i18n/flattenLocale', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/i18n/flattenLocale')>();
  return { ...actual, flattenLocale: (...args: Parameters<typeof actual.flattenLocale>) => { probe.calls++; return actual.flattenLocale(...args); } };
});

// The implementation config.ts used before: every nested section is merged into a fresh copy of everything gathered so far.
function copyingFlatten(obj: Record<string, any>, prefix = ''): Record<string, string> {
  let result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) result = { ...result, ...copyingFlatten(value, path) };
    else result[path] = String(value);
  }
  return result;
}
const sameTable = (actual: Record<string, string>, expected: Record<string, string>) => {
  expect(Object.keys(actual)).toEqual(Object.keys(expected));
  expect(Object.values(actual)).toEqual(Object.values(expected));
};

describe('flattenLocale', () => {
  it.each([['en', en], ['zh-CN', zhCN], ['in', ind]])('produces the same dotted keys, order and values as before for the real %s locale', (_name, locale) => {
    const expected = copyingFlatten(locale as Record<string, any>), actual = flattenLocale(locale as Record<string, any>);
    expect(Object.keys(expected).length).toBeGreaterThan(3000);
    sameTable(actual, expected);
  });

  it('matches the copying version on awkward shapes: collisions, arrays, null, empty containers, primitives, deep nesting', () => {
    let deep: Record<string, any> = { leaf: 'bottom' };
    for (let level = 0; level < 60; level++) deep = { [`level${level}`]: deep };
    const shapes: Record<string, any>[] = [
      {},
      { a: { b: 'nested' }, 'a.b': 'flat' },            // a later flat key overrides the nested one
      { 'a.b': 'flat', a: { b: 'nested' } },            // a later nested key overrides the flat one
      { a: { b: 1, c: { d: 2 } }, e: [3, { f: 4 }, null, undefined, 'x'] },
      { empty: {}, emptyList: [], nothing: null, missing: undefined, no: false, zero: 0, text: '', nan: NaN, big: 10n },
      { date: new Date(0), regexp: /x/, fn: () => 1, nested: { fn: function named() { return 2; } } },
      { [Symbol('hidden')]: 'ignored', visible: 'kept' },
      deep,
      JSON.parse('{"__proto__": {"polluted": "yes"}, "constructor": {"prototype": "x"}, "plain": "ok"}'),
    ];
    for (const shape of shapes) sameTable(flattenLocale(shape), copyingFlatten(shape));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('honours a starting prefix and never shares a table between calls', () => {
    sameTable(flattenLocale({ a: { b: 'x' }, c: 'y' }, 'root'), copyingFlatten({ a: { b: 'x' }, c: 'y' }, 'root'));
    const first = flattenLocale({ one: '1' }), second = flattenLocale({ two: '2' });
    expect(first).not.toBe(second);
    expect(Object.keys(first)).toEqual(['one']);
    const shared: Record<string, string> = { keep: 'me' };
    expect(flattenLocale({ added: 'x' }, '', shared)).toBe(shared);
    expect(shared).toEqual({ keep: 'me', added: 'x' });
  });
});

describe('Chinese fallback table in i18n/config', () => {
  it('is not built at startup, is built once on the first key that is missing everywhere, and resolves like the eager table did', async () => {
    probe.calls = 0;
    const { default: i18n } = await import('../../../src/i18n/config');
    expect(probe.calls).toBe(0);
    expect(i18n.t('desktopLyrics.waiting.region', { lng: 'zh-CN' })).toBeTruthy();
    expect(probe.calls).toBe(0);
    expect(i18n.t('definitely.missing.everywhere')).toBe('definitely.missing.everywhere');
    expect(probe.calls).toBe(1);
    expect(i18n.t('also.missing', { defaultValue: 'Runtime default' })).toBe('Runtime default');
    expect(i18n.t('definitely.missing.everywhere')).toBe('definitely.missing.everywhere');
    expect(probe.calls).toBe(1);
    const handler = i18n.options.parseMissingKeyHandler as (key: string, defaultValue?: string) => string;
    const eager = copyingFlatten(zhCN as Record<string, any>);
    for (const key of Object.keys(eager).filter((_, index) => index % 97 === 0)) expect(handler(key)).toBe(eager[key]);
    expect(handler('not.a.key', 'fallback text')).toBe('fallback text');
    expect(probe.calls).toBe(1);
  });
});
