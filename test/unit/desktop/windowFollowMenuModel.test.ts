import { describe, expect, it } from 'vitest';
import { EMPTY } from '../../../src/desktopLyrics/bridge';
import { buildFollowMenuOptions, followMenuSelectedLabel } from '../../../src/desktopLyrics/windowFollowMenuModel';

// test/unit/desktop/windowFollowMenuModel.test.ts — live sessions and saved shortcuts stay distinct in the title menu.
const apps = [
  { slot: 0, name: '椒盐音乐', path: '', icon: '', launchKind: 'store' as const, appUserModelId: 'Salt_player!App' },
  { slot: 1, name: 'foobar2000', path: 'C:\\Music\\foobar2000.exe', icon: '', launchKind: 'exe' as const },
  { slot: 2, name: '未运行程序', path: 'C:\\Music\\offline.exe', icon: '', launchKind: 'exe' as const },
];

describe('title-bar follow menu options', () => {
  it('keeps the closed-menu tooltip aligned with selected live, offline, aliased and ambiguous sources', () => {
    const copies = [...apps, { slot: 3, name: '另一份 foobar2000', path: 'D:\\Music\\foobar2000.exe', icon: '', launchKind: 'exe' as const }];
    const sessions = [EMPTY, ...['Salt_player!App', 'foobar2000.exe', 'Foobar Player', 'D:\\Music\\foobar2000.exe', 'unknown'].map(id => ({
      ...EMPTY, source: id, sources: [{ id, label: `Live ${id}`, playing: true }],
    })), { ...EMPTY, sources: [{ id: 'foobar2000.exe', label: 'foobar2000', playing: false }] }];
    for (const bindings of [apps, copies, []]) for (const session of sessions) {
      for (const preferred of ['', 'Salt_player!App', 'C:\\Music\\foobar2000.exe', 'foobar2000.exe', 'Foobar Player', 'unknown']) {
        const selected = buildFollowMenuOptions(session, bindings, preferred).find(option => option.selected)?.label || preferred || '自动跟随';
        expect(followMenuSelectedLabel(session, bindings, preferred)).toBe(selected);
      }
    }
    expect(followMenuSelectedLabel(EMPTY, apps, 'Salt_player!App')).toBe('椒盐音乐');
    expect(followMenuSelectedLabel(EMPTY, apps, 'C:\\Music\\foobar2000.exe')).toBe('foobar2000');
  });
  it('shows live apps with playback state, friendly binding names and no duplicate offline rows', () => {
    const options = buildFollowMenuOptions({ ...EMPTY, sources: [
      { id: 'Salt_player!App', label: 'Package Family ID', playing: true },
      { id: 'C:\\Music\\foobar2000.exe', label: 'foobar2000', playing: false },
      { id: 'Salt_player!App', label: 'duplicate', playing: false },
    ] }, apps, 'Salt_player!App');
    expect(options).toMatchObject([
      { id: 'Salt_player!App', label: '椒盐音乐', running: true, playing: true, selected: true },
      { id: 'C:\\Music\\foobar2000.exe', label: 'foobar2000', running: true, playing: false, selected: false },
      { id: 'C:\\Music\\offline.exe', label: '未运行程序', running: false, disabled: false },
    ]);
    expect(options).toHaveLength(3);
  });

  it('lets Store and executable shortcuts be preselected while offline and keeps an unknown preference visible', () => {
    const offline = buildFollowMenuOptions(EMPTY, apps, 'Salt_player!App');
    expect(offline[0]).toMatchObject({ id: 'Salt_player!App', label: '椒盐音乐', running: false, disabled: false, selected: true });
    expect(offline[1]).toMatchObject({ id: 'C:\\Music\\foobar2000.exe', label: 'foobar2000', disabled: false });
    expect(offline).toHaveLength(3);
    const rememberedExe = buildFollowMenuOptions(EMPTY, apps, 'foobar2000.exe');
    expect(rememberedExe[1]).toMatchObject({ id: 'foobar2000.exe', label: 'foobar2000', status: '未运行 · 已选择', disabled: false, selected: true });
    expect(rememberedExe).toHaveLength(3);
    const preferredPath = 'C:\\Music\\foobar2000.exe';
    const stoppedExe = buildFollowMenuOptions(EMPTY, apps, preferredPath);
    expect(stoppedExe[1]).toMatchObject({ id: preferredPath, label: 'foobar2000', disabled: false, selected: true });
    expect(stoppedExe).toHaveLength(3); // no duplicate row with the raw preferred path
    const twoCopies = [...apps, { slot: 3, name: '另一份 foobar2000', path: 'D:\\Music\\foobar2000.exe', icon: '', launchKind: 'exe' as const }];
    const exact = buildFollowMenuOptions(EMPTY, twoCopies, preferredPath);
    expect(exact[1]).toMatchObject({ id: preferredPath, label: 'foobar2000', selected: true });
    expect(exact[3]).toMatchObject({ id: 'D:\\Music\\foobar2000.exe', label: '另一份 foobar2000',
      status: '未运行 · 同名程序需完整会话路径', disabled: false, selected: false });
    expect(exact).toHaveLength(4);
    const remembered = buildFollowMenuOptions(EMPTY, [], 'old-player');
    expect(remembered).toEqual([{ id: 'old-player', label: 'old-player', status: '未运行 · 已选择',
      running: false, playing: false, disabled: false, selected: true }]);
  });

  it('recognizes a preselected executable after a filename or native-confirmed alias appears', () => {
    const path = 'C:\\Music\\foobar2000.exe';
    const basename = buildFollowMenuOptions({ ...EMPTY, source: 'foobar2000.exe', sources: [
      { id: 'foobar2000.exe', label: 'foobar2000', playing: true },
    ] }, apps, path);
    expect(basename[0]).toMatchObject({ id: path, label: 'foobar2000', running: true, selected: true, playing: true });
    expect(basename).toHaveLength(3);
    const alias = buildFollowMenuOptions({ ...EMPTY, source: 'Foobar Player', sources: [
      { id: 'Foobar Player', label: 'Foobar Player', playing: false },
    ] }, apps, path);
    expect(alias[0]).toMatchObject({ id: path, label: 'foobar2000', running: true, selected: true, playing: false });
    expect(alias).toHaveLength(3);
  });

  it('does not claim an ambiguous filename or another copy as the selected executable', () => {
    const path = 'C:\\Music\\foobar2000.exe';
    const copies = [...apps, { slot: 3, name: '另一份 foobar2000', path: 'D:\\Music\\foobar2000.exe', icon: '', launchKind: 'exe' as const }];
    const ambiguous = buildFollowMenuOptions({ ...EMPTY, sources: [
      { id: 'foobar2000.exe', label: 'foobar2000', playing: true },
    ] }, copies, path);
    expect(ambiguous[0]).toMatchObject({ id: 'foobar2000.exe', label: 'foobar2000', selected: false });
    expect(ambiguous[2]).toMatchObject({ id: path, label: 'foobar2000', running: false, selected: true });
    const otherCopy = buildFollowMenuOptions({ ...EMPTY, sources: [
      { id: 'D:\\Music\\foobar2000.exe', label: 'foobar2000', playing: false },
    ] }, copies, path);
    expect(otherCopy[0]).toMatchObject({ id: 'D:\\Music\\foobar2000.exe', label: '另一份 foobar2000', selected: false });
    expect(otherCopy[2]).toMatchObject({ id: path, label: 'foobar2000', running: false, selected: true });
  });
});
