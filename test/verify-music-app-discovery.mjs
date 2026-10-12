import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installDesktopBridgeMock } from './desktop-bridge-mock.mjs';

// test/verify-music-app-discovery.mjs — foreground confirmation, Store shortcuts and discovery blocks use an isolated host fixture.
const output = resolve(process.env.FOLIA_UI_OUTPUT || 'test-results/music-app-discovery');
const exe = { id: '1'.repeat(64), name: '桌面音乐测试', path: 'C:\\fake\\desktop-music.exe', icon: '', launchKind: 'exe' };
const store = { id: '2'.repeat(64), name: '椒盐音乐测试', path: '', icon: '', launchKind: 'store', appUserModelId: 'SaltMusic_abc123!SaltMusic' };
const extra = { id: '3'.repeat(64), name: '新增音乐测试', path: 'C:\\fake\\added-music.exe', icon: '', launchKind: 'exe' };
const musicTypes = ['confirmMusicApps', 'dismissMusicAppDiscovery', 'blockMusicApp', 'unblockMusicApp', 'launchMusicApp', 'addMusicApp', 'bindMusicApp', 'removeMusicApp', 'scanMusicApps', 'mediaControl'];
const checks = [], samples = [], errors = [];
let server, browser, page;
await mkdir(output, { recursive: true });

// Measure the scrollable candidate list and footer hit targets in the actual native dialog layout.
async function verifyGeometry(page, dialog, context) {
  const sample = await dialog.evaluate(element => {
    const list = element.querySelector('.music-app-discovery-list');
    return { dialog: element.getBoundingClientRect().toJSON(), list: list.getBoundingClientRect().toJSON(),
      listScrollHeight: list.scrollHeight, listClientHeight: list.clientHeight,
      dialogScrollHeight: element.scrollHeight, dialogClientHeight: element.clientHeight,
      width: innerWidth, height: innerHeight, pageScrollX: scrollX, pageScrollY: scrollY,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert(sample.dialog.left >= 0 && sample.dialog.right <= sample.width && sample.dialog.top >= 0 && sample.dialog.bottom <= sample.height, `${context}: dialog fits the viewport`);
  assert.equal(sample.horizontalOverflow, false, `${context}: no page horizontal overflow`);
  assert.equal(sample.pageScrollX + sample.pageScrollY, 0, `${context}: background remains stationary`);
  assert(sample.dialogScrollHeight <= sample.dialogClientHeight + 1, `${context}: footer stays outside candidate scrolling`);
  const buttons = [];
  for (const button of await dialog.locator('footer button').all()) {
    const box = await button.evaluate(element => {
      const rect = element.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { ...rect.toJSON(), label: element.textContent, reachable: hit === element || element.contains(hit) };
    });
    assert(box.reachable && box.top >= 0 && box.bottom <= sample.height && box.width >= 32 && box.height >= 32, `${context}: ${box.label} is visible and usable`);
    buttons.push(box);
  }
  samples.push({ context, ...sample, buttons });
}

try {
  let url = process.env.FOLIA_TEST_URL;
  if (!url) {
    server = await createServer({ configFile: resolve('vite.desktop.config.ts'), server: { host: '127.0.0.1', port: 0, hmr: false } });
    await server.listen(); url = `http://127.0.0.1:${server.httpServer.address().port}/desktop.html`;
  }
  const origin = new URL(url).origin;
  browser = await chromium.launch({ executablePath: process.env.FOLIA_CHROMIUM_PATH, headless: true, args: ['--no-proxy-server'] });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await installDesktopBridgeMock(page);
  await page.addInitScript(() => {
    let foreground = { hidden: false, focused: true };
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => foreground.hidden });
    document.hasFocus = () => foreground.focused;
    window.__foliaSetTestForeground = (hidden, focused) => {
      foreground = { hidden, focused };
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event(focused ? 'focus' : 'blur'));
    };
    localStorage.setItem('folia.desktop.mode.v1', 'classic');
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('.waiting-screen h1').waitFor();
  const emit = (type, data) => page.evaluate(({ type, data }) => window.__foliaEmit(type, data), { type, data });
  const discovery = (batchId, candidates, busy = false) => emit('musicAppDiscovery', { batchId, busy, candidates });
  const commands = () => page.evaluate(types => window.__foliaCommands.filter(command => types.includes(command.type)), musicTypes);
  const prefs = () => page.evaluate(() => window.__foliaMockPreferences());
  const dialog = page.locator('.music-app-discovery-dialog');
  const row = app => dialog.locator('.music-app-discovery-row').filter({ has: page.getByText(app.name, { exact: true }) });
  const confirm = dialog.locator('footer .primary-button'), later = dialog.locator('footer').getByRole('button', { name: '稍后', exact: true });
  const visible = () => dialog.waitFor({ state: 'visible' });
  const closed = () => dialog.waitFor({ state: 'hidden' });
  const waitRows = count => page.waitForFunction(count => document.querySelectorAll('.music-app-discovery-row').length === count, count);
  const expectCommand = async (action, expected) => {
    const before = await commands(); await action();
    await page.waitForFunction(({ types, count }) => window.__foliaCommands.filter(command => types.includes(command.type)).length > count, { types: musicTypes, count: before.length });
    assert.deepEqual((await commands()).slice(before.length), [expected], `${expected.type}: one host command containing only host-owned identifiers`);
  };

  await discovery('first-batch', [exe, store]); await visible(); await waitRows(2);
  assert.equal(await page.locator('.waiting-screen [data-music-app-slot]').count(), 0, 'discovery does not bind candidates automatically');
  assert.deepEqual(await commands(), [], 'discovery does not launch, open a picker or send a selection');
  await emit('notice', { text: '五秒后消失的普通提示' });
  await page.waitForTimeout(5300);
  await page.locator('.desktop-message-notice').waitFor({ state: 'detached' });
  assert(await dialog.isVisible(), 'discovery confirmation outlives the ordinary five-second notice');
  await page.screenshot({ path: `${output}/persistent-candidates.png` });
  checks.push('candidate discovery never auto-binds or launches; confirmation remains open after the ordinary five-second notice expires');

  await row(exe).locator('input').uncheck();
  await discovery('first-batch', [exe, store, extra], true); await waitRows(3);
  assert.equal(await row(exe).locator('input').isChecked(), false, 'same-batch updates preserve unchecked state');
  assert.equal(await row(store).locator('input').isChecked(), true); assert.equal(await row(extra).locator('input').isChecked(), true);
  await row(extra).locator('input').uncheck();
  await expectCommand(() => confirm.click(), { type: 'confirmMusicApps', value: { batchId: 'first-batch', ids: [store.id] } });
  await waitRows(2);
  await page.waitForFunction(() => window.__foliaMockPreferences().musicApps.length === 1);
  assert.deepEqual((await prefs()).musicApps, [{ name: store.name, path: '', icon: '', launchKind: 'store', appUserModelId: store.appUserModelId, slot: 0 }]);
  assert(await dialog.isVisible(), 'unselected candidates remain pending after adding selected apps');
  assert.equal(await row(exe).locator('input').isChecked(), false); assert.equal(await row(extra).locator('input').isChecked(), false);
  assert(await confirm.isDisabled(), 'confirm is disabled when all pending candidates are unchecked');
  await expectCommand(() => later.click(), { type: 'dismissMusicAppDiscovery', value: { batchId: 'first-batch' } }); await closed();
  await page.locator('.waiting-screen [data-music-app-slot="0"]').waitFor();
  assert.equal(await page.locator('.waiting-screen [data-music-app-slot]').count(), 1);
  checks.push('same-batch updates retain user selection; selected Store apps keep their empty executable path and AUMID; unchecked candidates remain pending with disabled confirmation');

  await discovery('second-batch', [exe, extra]); await visible();
  assert.equal(await row(exe).locator('input').isChecked(), true, 'fresh batches reset selection');
  const beforeLater = await prefs();
  await expectCommand(() => later.click(), { type: 'dismissMusicAppDiscovery', value: { batchId: 'second-batch' } }); await closed();
  assert.deepEqual((await prefs()).musicApps, beforeLater.musicApps); assert.deepEqual((await prefs()).blockedMusicApps, beforeLater.blockedMusicApps);
  await discovery('second-batch', [exe, extra]);
  assert.equal(await dialog.isVisible(), false, 'a deferred batch does not reopen if the same packet is repeated');
  await discovery('block-batch', [exe, extra]); await visible();
  await expectCommand(() => row(exe).getByRole('button', { name: `不再发现 ${exe.name}`, exact: true }).click(), { type: 'blockMusicApp', value: { batchId: 'block-batch', id: exe.id } });
  await waitRows(1);
  assert.deepEqual((await prefs()).blockedMusicApps, [exe]);
  assert.equal(await row(extra).locator('input').isChecked(), true, 'removing a blocked candidate preserves other selections');
  await later.click(); await closed();
  checks.push('later preserves bindings and blocks, ignores repeat packets of the deferred batch, and a fresh batch can reopen; candidate blocking removes only that candidate');

  await emit('openSettings', { target: { id: 'music-apps' } });
  const settings = page.locator('.music-app-settings'); await settings.waitFor();
  const binding = settings.locator('[data-music-app-binding="0"]');
  assert.equal(await binding.locator('.music-app-details span').innerText(), '微软商店应用');
  assert.equal(await binding.locator('.music-app-details span').getAttribute('title'), store.appUserModelId);
  await settings.locator('.music-app-blocked summary').click();
  await expectCommand(() => settings.getByRole('button', { name: `恢复发现 ${exe.name}`, exact: true }).click(), { type: 'unblockMusicApp', value: { id: exe.id } });
  await visible(); await row(exe).waitFor();
  assert.deepEqual((await prefs()).blockedMusicApps, [], 'restoring a block updates preferences before the mock rescan reply');
  await later.click(); await closed();
  await expectCommand(() => binding.getByRole('button', { name: `不再发现 ${store.name}`, exact: true }).click(), { type: 'blockMusicApp', value: { slot: 0 } });
  await settings.locator('.music-app-blocked summary').waitFor();
  assert.equal(await binding.count(), 1, 'blocking a bound app preserves the current shortcut');
  assert.equal(await binding.getByRole('button', { name: `不再发现 ${store.name}`, exact: true }).isDisabled(), true);
  assert.equal((await prefs()).musicApps.length, 1);
  await settings.locator('.music-app-blocked summary').click();
  await expectCommand(() => settings.getByRole('button', { name: `恢复发现 ${store.name}`, exact: true }).click(), { type: 'unblockMusicApp', value: { id: store.id } });
  await page.waitForFunction(() => window.__foliaMockPreferences().blockedMusicApps.length === 0);
  assert.equal(await dialog.isVisible(), false, 'unblocking an already bound app does not offer a duplicate candidate');
  await page.keyboard.press('Escape'); await page.locator('.desktop-main-settings').waitFor({ state: 'detached' });
  checks.push('Store bindings show the package identity; blocked candidates can be restored through settings; blocking and restoring a bound app keeps its shortcut without duplicate discovery');

  const gear = page.locator('[data-settings-trigger]'); await gear.focus();
  await page.evaluate(() => {
    window.__foliaSetTestForeground(true, false); window.__foliaDiscoveryFocusEvents = [];
    document.addEventListener('focusin', event => window.__foliaDiscoveryFocusEvents.push(event.target.className));
  });
  const beforeBackground = await commands();
  await discovery('background-batch', [exe, extra]);
  assert.equal(await dialog.isVisible(), false); assert.equal(await gear.evaluate(element => element === document.activeElement), true);
  assert.deepEqual(await page.evaluate(() => window.__foliaDiscoveryFocusEvents), [], 'background discovery does not change focus');
  assert.deepEqual(await commands(), beforeBackground, 'background discovery sends no host action');
  await page.evaluate(() => window.__foliaSetTestForeground(true, true)); assert.equal(await dialog.isVisible(), false, 'hidden document stays closed despite focus');
  await page.evaluate(() => window.__foliaSetTestForeground(false, false)); assert.equal(await dialog.isVisible(), false, 'unfocused document stays closed despite visibility');
  await page.evaluate(() => window.__foliaSetTestForeground(false, true)); await visible();
  assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true, 'foreground modal receives local keyboard focus');
  await row(exe).locator('input').uncheck();
  await page.evaluate(() => window.__foliaSetTestForeground(false, false)); await closed();
  await discovery('background-batch', [exe, extra]);
  await page.evaluate(() => window.__foliaSetTestForeground(false, true)); await visible();
  assert.equal(await row(exe).locator('input').isChecked(), false, 'background updates retain selection in the same batch');
  await expectCommand(() => page.keyboard.press('Escape'), { type: 'dismissMusicAppDiscovery', value: { batchId: 'background-batch' } }); await closed();
  assert.equal(await page.locator('.desktop-main-settings').count(), 0, 'modal Escape does not open or toggle underlying settings');
  checks.push('hidden and unfocused discovery queues without focus changes or commands; foreground resumes the pending dialog and retains same-batch selection across blur; Escape defers only the modal');

  const many = Array.from({ length: 12 }, (_, index) => ({ ...exe, id: (index + 10).toString(16).padStart(64, '0'), name: `长名称音乐软件 ${index + 1} 及其桌面播放器`, path: `C:\\fake\\very-long-music-path\\player-${index + 1}.exe` }));
  for (const [width, height] of [[1280, 800], [450, 300]]) {
    await page.setViewportSize({ width, height }); await discovery(`geometry-${width}`, many); await visible(); await waitRows(12);
    await verifyGeometry(page, dialog, `${width}x${height}`);
    assert.equal(await dialog.locator('.music-app-discovery-list').evaluate(element => element.scrollHeight > element.clientHeight), true, 'large candidate lists own their scrolling');
    await row(many.at(-1)).locator('input').scrollIntoViewIfNeeded();
    await row(many.at(-1)).locator('input').uncheck();
    await verifyGeometry(page, dialog, `${width}x${height}-last-candidate`);
    await page.screenshot({ path: `${output}/candidate-dialog-${width}.png` });
    await later.click(); await closed();
  }
  checks.push('twelve long-name candidates scroll internally at 1280×800 and 450×300 while the confirmation footer remains visible and clickable');
  assert.equal((await commands()).some(command => ['launchMusicApp', 'addMusicApp', 'bindMusicApp', 'removeMusicApp', 'mediaControl'].includes(command.type)), false, 'discovery interactions never trigger launcher, picker, removal or media actions');
  assert.deepEqual(errors, [], 'no browser runtime errors');
  console.log(`PASS music app discovery: ${checks.length} checks, ${samples.length} geometry samples`);
} catch (error) {
  await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(`${output}/failure.json`, JSON.stringify({ error: String(error), checks, samples, errors }, null, 2));
  throw error;
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ checks, samples, errors, nativeMockOnly: true }, null, 2));
  await browser?.close(); await server?.close();
}
