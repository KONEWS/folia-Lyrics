import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { installDesktopBridgeMock } from './desktop-bridge-mock.mjs';

// test/verify-music-apps.mjs — real desktop UI interactions with explicit, host-supplied launcher replies.
const icon = (page, color, letter) => page.evaluate(({ color, letter }) => {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 48;
  const context = canvas.getContext('2d'); context.fillStyle = color; context.fillRect(0, 0, 48, 48);
  context.fillStyle = 'white'; context.font = '29px sans-serif'; context.textAlign = 'center'; context.fillText(letter, 24, 34);
  return canvas.toDataURL('image/png');
}, { color, letter });
const apps = [
  { slot: 0, name: '网易云音乐', path: 'C:\\Program Files\\NetEase\\CloudMusic\\cloudmusic.exe', icon: '' },
  { slot: 1, name: 'QQ 音乐', path: 'C:\\Program Files\\Tencent\\QQMusic\\QQMusic.exe', icon: '' },
];
const musicCommandTypes = ['addMusicApp', 'bindMusicApp', 'removeMusicApp', 'launchMusicApp', 'showMusicAppAddButton', 'autoDiscoverMusicApps', 'scanMusicApps'];
const musicCommands = page => page.evaluate(types => window.__foliaCommands.filter(command => types.includes(command.type)), musicCommandTypes);
const emit = (page, type, data) => page.evaluate(({ type, data }) => window.__foliaEmit(type, data), { type, data });
const setApps = (page, musicApps) => page.evaluate(musicApps => window.__foliaSetMockPreferences({ musicApps }), musicApps);
const frame = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));

// Measure actual hit targets after layout settles, including scrolling inside short windows.
async function verifyGeometry(page, buttons, context, samples, scroll = true) {
  await frame(page);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${context}: no page horizontal overflow`);
  const boxes = [];
  for (const button of await buttons.all()) {
    if (scroll) await button.scrollIntoViewIfNeeded(); await frame(page);
    const box = await button.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { label: element.getAttribute('aria-label') || element.textContent, ...rect.toJSON(), reachable: hit === element || element.contains(hit), viewportWidth: innerWidth, viewportHeight: innerHeight };
    });
    assert(box.reachable, `${context}: ${box.label} is reachable above surrounding controls`);
    assert(box.width >= 32 && box.height >= 32, `${context}: ${box.label} retains a usable target`);
    assert(box.left >= 0 && box.right <= box.viewportWidth && box.top >= 0 && box.bottom <= box.viewportHeight, `${context}: ${box.label} remains inside the viewport`);
    boxes.push(box);
  }
  samples.push({ context, boxes });
}

// Binding/removal commands do not pretend to succeed: the test explicitly delivers each native preference reply.
export async function verifyMusicApps(page, output) {
  const checks = [], samples = [];
  apps[0].icon = await icon(page, '#d94548', 'N'); apps[1].icon = await icon(page, '#258f59', 'Q');
  const waiting = page.locator('.waiting-screen');
  const shortcut = slot => waiting.locator(`[data-music-app-slot="${slot}"]`);
  const shortcuts = waiting.locator('[data-music-app-slot]');
  const addTiles = waiting.locator('[data-music-app-add]');
  const settings = page.locator('.music-app-settings');
  const row = slot => settings.locator(`[data-music-app-binding="${slot}"]`);
  const add = settings.getByRole('button', { name: '绑定新的音乐软件', exact: true });
  const showAdd = settings.getByRole('checkbox', { name: '首页显示添加按钮', exact: true });
  const autoDiscover = settings.getByRole('checkbox', { name: '自动发现音乐软件', exact: true });
  const scan = settings.getByRole('button', { name: '扫描音乐软件', exact: true });
  const close = async () => { await page.locator('[data-settings-trigger]').click(); await page.locator('.desktop-main-settings').waitFor({ state: 'detached' }); };
  const open = async () => { await page.getByRole('button', { name: '打开歌词设置', exact: true }).click(); await settings.waitFor(); };
  const expectCommand = async (action, expected) => {
    const before = await musicCommands(page); await action();
    await page.waitForFunction(({ types, length }) => window.__foliaCommands.filter(command => types.includes(command.type)).length > length, { types: musicCommandTypes, length: before.length });
    assert.deepEqual((await musicCommands(page)).slice(before.length), [expected], `${expected.type}: one exact native command without an executable path`);
  };
  const expectCounts = async (bound, plus) => {
    await page.waitForFunction(({ bound, plus }) => document.querySelectorAll('.waiting-screen [data-music-app-slot]').length === bound
      && document.querySelectorAll('.waiting-screen [data-music-app-add]').length === plus, { bound, plus });
    assert.equal(await shortcuts.count(), bound); assert.equal(await addTiles.count(), plus);
  };
  const expectedSlots = async bound => assert.deepEqual(await shortcuts.evaluateAll(elements => elements.map(element => Number(element.dataset.musicAppSlot))), bound.map(app => app.slot));
  await waiting.waitFor();
  assert.equal(await waiting.getAttribute('data-wait-state'), 'no-player');
  assert.equal(await page.evaluate(() => Object.hasOwn(window.__foliaReadyPreferences, 'showMusicAppAddButton')), false, 'legacy native preferences omit the new visibility setting');
  await expectCounts(0, 3);
  await page.screenshot({ path: `${output}/homepage-empty.png` });
  const beforeUnbound = await musicCommands(page);
  await addTiles.first().focus(); await page.keyboard.press('Enter'); await settings.waitFor();
  await verifyGeometry(page, add, 'empty-plus-opens-add-setting', samples, false);
  assert.equal(await settings.locator('[data-music-app-binding]').count(), 0, 'settings list only bound apps');
  assert(await showAdd.isChecked(), 'the plus visibility option defaults to on for legacy preferences');
  assert(await autoDiscover.isChecked(), 'automatic app discovery defaults to on for legacy preferences');
  assert.deepEqual(await musicCommands(page), beforeUnbound, 'opening empty-slot settings never starts a process or opens a picker');
  checks.push('legacy preferences show three add tiles; keyboard activation opens the visible add setting without invoking a picker or launch');

  await expectCommand(() => scan.click(), { type: 'scanMusicApps' });
  await frame(page);
  assert.equal(await settings.locator('[data-music-app-binding]').count(), 0, 'a scan without a native discovery reply does not invent bindings');
  await setApps(page, [apps[1]]);
  await row(1).getByText(apps[1].name, { exact: true }).waitFor();
  assert.equal(await row(1).locator('img').getAttribute('src'), apps[1].icon, 'discovered apps render the exact icon supplied by the host');
  assert.equal((await musicCommands(page)).filter(command => command.type === 'launchMusicApp' || command.type === 'addMusicApp').length, 0, 'discovery never launches an app or opens a file picker');
  await expectCommand(() => autoDiscover.uncheck(), { type: 'autoDiscoverMusicApps', value: false });
  await emit(page, 'preferences', { topmost: true }); await frame(page);
  assert.equal(await autoDiscover.isChecked(), false, 'unrelated partial preferences retain the disabled discovery setting');
  assert.equal(await settings.locator('[data-music-app-binding]').count(), 1, 'turning discovery off keeps existing bindings');
  await expectCommand(() => scan.click(), { type: 'scanMusicApps' });
  await setApps(page, []);
  checks.push('discovery is enabled for legacy preferences; explicit scan sends no paths, renders host-provided app icons without launch/picker side effects, and remains usable with automatic discovery disabled');

  await expectCommand(() => add.click(), { type: 'addMusicApp' });
  await frame(page);
  assert.equal(await settings.locator('[data-music-app-binding]').count(), 0, 'canceling the first native picker leaves an empty list');
  await setApps(page, [apps[0]]);
  await row(0).getByText(apps[0].name, { exact: true }).waitFor();
  await close(); await expectCounts(1, 2); await open();
  await expectCommand(() => add.click(), { type: 'addMusicApp' });
  await setApps(page, apps);
  await row(1).getByText(apps[1].name, { exact: true }).waitFor();
  assert.equal((await musicCommands(page)).filter(command => command.type === 'launchMusicApp').length, 0, 'binding never launches the app automatically');
  await page.screenshot({ path: `${output}/settings-bound.png` });
  await close(); await expectCounts(2, 1);
  const mediaBefore = await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'mediaControl').length);
  for (const app of apps) {
    assert.match(await shortcut(app.slot).getAttribute('aria-label'), new RegExp(app.name));
    assert.match(await shortcut(app.slot).getAttribute('title'), new RegExp(app.name));
    assert.equal(await shortcut(app.slot).locator('img').getAttribute('src'), app.icon, 'the exact icon provided by the host is displayed');
    assert.equal((await shortcut(app.slot).innerText()).trim(), '', 'home launch tiles show only the music app icon');
    await expectCommand(async () => {
      if (app.slot === 1) { await shortcut(app.slot).focus(); await page.keyboard.press('Enter'); }
      else await shortcut(app.slot).click();
    }, { type: 'launchMusicApp', value: app.slot });
  }
  await expectCommand(async () => { await shortcut(0).focus(); await page.keyboard.press('Space'); }, { type: 'launchMusicApp', value: 0 });
  assert.equal(await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'mediaControl').length), mediaBefore, 'keyboard launch never falls through to media controls');
  await verifyGeometry(page, shortcuts, '1280x800-bound', samples);
  await page.screenshot({ path: `${output}/homepage-bound.png` });
  checks.push('one and two bindings retain three total tiles; native icons/names render and click, Enter and Space launch the exact app without media-control side effects');

  const extra = [
    { slot: 2, name: 'MusicBee', path: 'D:\\MusicBee\\MusicBee.exe', icon: await icon(page, '#bd742d', 'B') },
    { slot: 7, name: 'foobar2000', path: 'D:\\foobar2000\\foobar2000.exe', icon: await icon(page, '#616771', 'F') },
    { slot: 12, name: 'AIMP', path: 'D:\\AIMP\\AIMP.exe', icon: await icon(page, '#8953a8', 'A') },
  ];
  let bound = [...apps];
  for (const app of extra) {
    await open(); await expectCommand(() => add.click(), { type: 'addMusicApp' });
    bound = [...bound, app]; await setApps(page, bound); await row(app.slot).getByText(app.name, { exact: true }).waitFor();
    await close(); await expectCounts(bound.length, 1); await expectedSlots(bound);
    if (bound.length === 3) await page.screenshot({ path: `${output}/homepage-third-app.png` });
    await expectCommand(() => shortcut(app.slot).click(), { type: 'launchMusicApp', value: app.slot });
  }
  await page.screenshot({ path: `${output}/homepage-five-apps.png` });
  checks.push('third through fifth apps add dynamically, each retains an extra add tile and launches using its non-contiguous native ID');

  await emit(page, 'preferences', { topmost: true }); await frame(page);
  await expectedSlots(bound);
  await open();
  await expectCommand(() => row(0).getByRole('button', { name: /^更换/ }).click(), { type: 'bindMusicApp', value: 0 });
  await frame(page);
  assert(await row(0).getByText(apps[0].name, { exact: true }).isVisible(), 'canceling the picker leaves the old binding visible');
  const replacement = { ...apps[0], name: '新的音乐播放器（较长名称验证）', path: 'D:\\音乐软件\\New Music Player\\player.exe', icon: await icon(page, '#5352b0', 'P') };
  bound = bound.map(app => app.slot === 0 ? replacement : app); await setApps(page, bound);
  await row(0).getByText(replacement.name, { exact: true }).waitFor();
  const launchesBeforeRemoval = (await musicCommands(page)).filter(command => command.type === 'launchMusicApp').length;
  await expectCommand(() => row(1).getByRole('button', { name: /^解除/ }).click(), { type: 'removeMusicApp', value: 1 });
  bound = bound.filter(app => app.slot !== 1); await setApps(page, bound);
  await row(1).waitFor({ state: 'detached' });
  assert.equal((await musicCommands(page)).filter(command => command.type === 'launchMusicApp').length, launchesBeforeRemoval);
  await close();
  await expectCounts(4, 1); await expectedSlots(bound);
  assert.equal(await shortcut(0).locator('img').getAttribute('src'), replacement.icon);
  for (const app of bound) await expectCommand(() => shortcut(app.slot).click(), { type: 'launchMusicApp', value: app.slot });
  checks.push('partial preferences preserve bindings; canceled replacement keeps the old app; replacement/removal retain all surviving IDs and never launch automatically');

  await open(); await expectCommand(() => showAdd.uncheck(), { type: 'showMusicAppAddButton', value: false }); await close();
  await expectCounts(4, 0); await expectedSlots(bound);
  const commandsBeforeReload = await musicCommands(page);
  await page.evaluate(() => sessionStorage.setItem('folia.test.mockPreferences', JSON.stringify(window.__foliaMockPreferences())));
  await page.reload({ waitUntil: 'networkidle' }); await waiting.waitFor(); await expectCounts(4, 0); await expectedSlots(bound);
  await page.screenshot({ path: `${output}/homepage-add-hidden.png` });
  assert.deepEqual(await musicCommands(page), [], 'restoring hidden add tiles does not rewrite preferences or launch an app');
  await waiting.getByRole('button', { name: '管理播放器', exact: true }).click(); await settings.waitFor();
  assert.equal(await showAdd.isChecked(), false);
  assert.equal(await autoDiscover.isChecked(), false, 'the host-preference reload retains disabled discovery');
  await expectCommand(() => autoDiscover.check(), { type: 'autoDiscoverMusicApps', value: true });
  assert.equal(await settings.locator('[data-music-app-binding]').count(), 4, 're-enabling discovery keeps existing bindings until the host discovers more');
  await expectCommand(() => add.click(), { type: 'addMusicApp' });
  const fifth = { slot: 20, name: '另一个音乐播放器', path: 'E:\\音乐库\\Player\\Music Player.exe', icon: await icon(page, '#347f9b', 'M') };
  bound = [...bound, fifth]; await setApps(page, bound); await close(); await expectCounts(5, 0); await expectedSlots(bound);
  await setApps(page, []); await expectCounts(0, 0);
  await page.screenshot({ path: `${output}/homepage-empty-add-hidden.png` });
  await waiting.getByRole('button', { name: '管理播放器', exact: true }).click(); await settings.waitFor();
  assert(await add.isEnabled(), 'hiding all plus tiles never removes the add entry in settings, even with zero apps');
  await setApps(page, bound);
  await expectCommand(() => showAdd.check(), { type: 'showMusicAppAddButton', value: true }); await close(); await expectCounts(5, 1);
  checks.push('hiding add tiles preserves all apps across a host-preference reload; management and settings add remain usable, even with no bindings, and re-enabling restores the extra tile');

  await page.setViewportSize({ width: 450, height: 300 });
  await verifyGeometry(page, waiting.locator('[data-music-app-slot],[data-music-app-add]'), '450x300-five-apps-long-name', samples);
  const manage = waiting.getByRole('button', { name: '管理播放器', exact: true });
  await verifyGeometry(page, manage, '450x300-manage', samples);
  const manageBox = await manage.boundingBox(), footerBox = await page.locator('.desktop-statusbar').boundingBox();
  assert(manageBox.y + manageBox.height <= footerBox.y, 'the management entry stays above the bottom playback controls');
  await page.screenshot({ path: `${output}/homepage-narrow.png` });
  const many = [...bound, ...Array.from({ length: 9 }, (_, index) => ({ ...fifth, slot: 30 + index, name: `音乐播放器 ${index + 6}` }))];
  await setApps(page, many); await expectCounts(14, 1);
  assert(await waiting.locator('.music-app-buttons').evaluate(element => element.scrollHeight > element.clientHeight), 'a large app list really overflows its own scroll area');
  await verifyGeometry(page, waiting.locator('[data-music-app-slot],[data-music-app-add]'), '450x300-fourteen-apps-scroll', samples);
  assert(await waiting.locator('.music-app-buttons').evaluate(element => element.scrollTop > 0), 'the final add tile is reached by scrolling through the large list');
  await page.screenshot({ path: `${output}/homepage-many-narrow.png` });
  await setApps(page, bound); await expectCounts(5, 1);
  await addTiles.first().click(); await settings.waitFor();
  await verifyGeometry(page, add, '450x300-plus-opens-add-below-five-bindings', samples, false);
  for (const app of bound) await verifyGeometry(page, row(app.slot).getByRole('button'), `450x300-settings-slot-${app.slot}`, samples);
  assert.equal(await page.locator('.desktop-settings-scroll').evaluate(element => element.scrollWidth > element.clientWidth), false, 'a long app name/path does not widen the settings scrollport');
  await page.screenshot({ path: `${output}/settings-narrow.png` }); await close();
  await page.setViewportSize({ width: 1280, height: 800 });
  checks.push('five apps and management fit above playback at 450×300; fourteen apps scroll to the final add tile; all settings remain reachable without horizontal overflow and add opens below the list');

  // A connected player keeps the lyric recovery workflow instead of replacing it with launch shortcuts.
  const session = { key: 'music-app-regression', title: '等待歌词', artist: '测试', cover: '', source: 'Test player', sources: [], sessionId: 'music-app-session', playing: false, position: 1, duration: 60, rate: 1, hasTimeline: true };
  await emit(page, 'session', session);
  await page.waitForFunction(() => document.querySelector('.waiting-screen')?.dataset.waitState === 'connected-empty');
  assert.equal(await shortcuts.count(), 0);
  await waiting.getByRole('button', { name: '搜索在线歌词', exact: true }).click();
  assert(await page.locator('[data-settings-section="online"]').isVisible()); await close();
  await page.evaluate(() => window.__foliaSetMockPreferences({ onlineEnabled: false }));
  const importsBefore = await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'import').length);
  await waiting.locator('.waiting-primary-action').click();
  assert.equal(await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'import').length), importsBefore + 1);
  checks.push('connected-player waiting states retain online search and offline lyric import actions');

  return { checks, samples, nativeMockOnly: true, commandsBeforeReload, commandsAfterReload: await musicCommands(page) };
}

// Reuse a running desktop dev server when supplied; otherwise serve the existing desktop output without rebuilding.
async function run() {
  const output = resolve(process.env.FOLIA_UI_OUTPUT || 'test-results/music-apps');
  await mkdir(output, { recursive: true });
  let server, browser, page;
  const errors = [];
  try {
    let url = process.env.FOLIA_TEST_URL;
    if (!url) {
      const root = resolve(process.env.FOLIA_BENCH_DIST || 'dist-desktop');
      const mimes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.otf': 'font/otf', '.woff2': 'font/woff2' };
      server = createServer(async (request, response) => {
        try {
          const path = resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
          if (!path.startsWith(root + sep)) throw Error('Invalid path');
          const body = await readFile(path); response.writeHead(200, { 'Content-Type': mimes[extname(path)] || 'application/octet-stream' }); response.end(body);
        } catch { response.writeHead(404); response.end(); }
      });
      await new Promise(done => server.listen(0, '127.0.0.1', done));
      url = `http://127.0.0.1:${server.address().port}/desktop.html`;
    }
    browser = await chromium.launch({ executablePath: process.env.FOLIA_CHROMIUM_PATH, headless: true, args: ['--no-sandbox', '--no-proxy-server', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
    page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await installDesktopBridgeMock(page);
    await page.addInitScript(() => localStorage.setItem('folia.desktop.mode.v1', 'classic'));
    await page.goto(url, { waitUntil: 'networkidle' });
    const report = await verifyMusicApps(page, output);
    assert.deepEqual(errors, [], 'no page runtime errors');
    await writeFile(resolve(output, 'results.json'), JSON.stringify({ ...report, errors }, null, 2));
    console.log(`PASS desktop music launchers: ${report.checks.length} checks`);
  } catch (error) {
    await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
    await writeFile(resolve(output, 'failure.json'), JSON.stringify({ error: String(error), errors }, null, 2));
    throw error;
  } finally {
    await browser?.close();
    if (server) await new Promise(done => server.close(done));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await run();
