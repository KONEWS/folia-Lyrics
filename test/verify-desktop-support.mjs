import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installDesktopBridgeMock } from './desktop-bridge-mock.mjs';

// test/verify-desktop-support.mjs — support commands, searchable destinations and cancellation preserve the visible song and settings draft.
const output = resolve(process.env.FOLIA_UI_OUTPUT || 'test-results/desktop-support');
await mkdir(output, { recursive: true });
const checks = [], errors = [];
let server, browser, page;
try {
  let url = process.env.FOLIA_TEST_URL;
  if (!url) {
    server = await createServer({ configFile: resolve('vite.desktop.config.ts'), server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
    await server.listen(); url = `http://127.0.0.1:${server.httpServer.address().port}/desktop.html`;
  }
  const origin = new URL(url).origin;
  browser = await chromium.launch({ executablePath: process.env.FOLIA_CHROMIUM_PATH, headless: true,
    args: ['--no-proxy-server', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox'] });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await installDesktopBridgeMock(page);
  await page.addInitScript(() => {
    localStorage.setItem('folia.desktop.mode.v1', 'classic');
    sessionStorage.setItem('folia.test.mockPreferences', JSON.stringify({ autoImmersive: false, audioReactive: false }));
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__foliaReadyAt != null);
  const song = { key: 'support-song', title: 'Support song', artist: 'Fixture', cover: '', source: 'support-fixture',
    sessionId: 'support-session', position: 10, duration: 60, rate: 1, playing: false, hasTimeline: true, sources: [] };
  await page.evaluate(song => {
    window.__foliaEmit('session', { ...song, sequence: 1 });
    window.__foliaEmit('lyrics', { key: song.key, title: song.title, artist: song.artist, source: 'local', embedded: true, format: 'lrc', cover: '',
      content: '[00:01.00]KEEP CURRENT LYRICS\n[00:40.00]NEXT LINE' });
  }, song);
  await page.waitForFunction(() => ['KEEP', 'CURRENT', 'LYRICS'].every(word => document.querySelector('.desktop-stage')?.textContent.includes(word)));
  await page.locator('[data-settings-trigger]').click();
  const panel = page.locator('.desktop-main-settings');
  await panel.waitFor();
  const search = panel.getByRole('combobox', { name: '搜索全部设置', exact: true });
  await search.fill('复制诊断信息');
  await panel.getByRole('option').filter({ hasText: '复制诊断信息' }).click();
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-settings-target') === 'diagnostics');
  await panel.getByRole('button', { name: '复制诊断信息', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'copyDiagnostics').length), 1);
  checks.push('settings search focuses the copy diagnostic action, which emits exactly one native command');
  await panel.getByRole('button', { name: '打开日志目录', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'openLogFolder').length), 1);
  checks.push('opening logs emits a fixed native action with no caller-supplied filesystem path');

  const title = panel.getByRole('textbox', { name: '在线搜索歌名', exact: true });
  await title.fill('Preserved search draft');
  const displayedBeforeCancel = await page.locator('.desktop-stage').innerText();
  const busy = { key: song.key, busy: true, message: 'Fixture download pending', candidates: [], errors: [], selectedKey: 'qq:previous', phase: 'matching' };
  await page.evaluate(data => window.__foliaEmit('online', data), busy);
  const cancel = panel.getByRole('button', { name: '取消请求', exact: true });
  await cancel.click();
  assert.equal(await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'cancelOnline').length), 1);
  await page.evaluate(data => window.__foliaEmit('online', data), { ...busy, busy: false, phase: 'ready', message: '已取消当前歌词请求，保留正在显示的歌词。' });
  await page.waitForFunction(() => document.querySelector('[data-settings-target="online-cancel"]')?.disabled);
  assert.equal(await title.inputValue(), 'Preserved search draft');
  assert.equal(await page.locator('.desktop-stage').innerText(), displayedBeforeCancel);
  checks.push('cancel keeps the displayed lyric and edited search fields, then returns to a disabled cancel control');

  await page.evaluate(() => window.__foliaEmit('notice', { text: '诊断信息已复制。', target: { id: 'diagnostics' } }));
  await page.locator('.desktop-notice').getByRole('button', { name: '查看设置', exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-settings-target') === 'diagnostics');
  assert.equal(await title.inputValue(), 'Preserved search draft');
  checks.push('a diagnostic result links back to its precise setting without clearing the search draft');

  await page.setViewportSize({ width: 680, height: 450 });
  await cancel.scrollIntoViewIfNeeded();
  const bounds = await panel.boundingBox();
  for (const button of await panel.locator('.online-search .action-row button').all()) {
    const rectangle = await button.boundingBox();
    assert(rectangle.x >= bounds.x && rectangle.x + rectangle.width <= bounds.x + bounds.width + 1);
  }
  await page.screenshot({ path: `${output}/support-narrow.png` });
  checks.push('search, rematch and cancel controls remain within the settings panel at minimum native window width');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(`PASS desktop support: ${checks.length} checks`);
} catch (error) {
  errors.push(String(error));
  await page?.screenshot({ path: `${output}/last-state.png` }).catch(() => undefined);
  throw error;
} finally {
  await writeFile(`${output}/desktop-support-results.json`, JSON.stringify({ checks, errors }, null, 2));
  await browser?.close(); await server?.close();
}
