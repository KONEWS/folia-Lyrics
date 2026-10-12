import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installDesktopBridgeMock } from './desktop-bridge-mock.mjs';

// test/verify-desktop-settings-navigation.mjs — real panel navigation with an isolated fake host and no native player.
const output = resolve(process.env.FOLIA_UI_OUTPUT || 'test-results/desktop-settings-navigation');
await mkdir(output, { recursive: true });
let server, browser;
const checks = [], samples = [], errors = [];
try {
  let url = process.env.FOLIA_TEST_URL;
  if (!url) {
    server = await createServer({ configFile: resolve('vite.desktop.config.ts'), server: { host: '127.0.0.1', port: 0, hmr: false } });
    await server.listen(); url = `http://127.0.0.1:${server.httpServer.address().port}/desktop.html`;
  }
  const origin = new URL(url).origin;
  browser = await chromium.launch({ executablePath: process.env.FOLIA_CHROMIUM_PATH, headless: true, args: ['--no-proxy-server'] });
  const preparePage = async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(String(error)));
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await installDesktopBridgeMock(page); return page;
  };
  const page = await preparePage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('.waiting-screen h1').waitFor();
  const emit = (type, data) => page.evaluate(({ type, data }) => window.__foliaEmit(type, data), { type, data });
  const session = { key: 'navigation-song', title: '测试歌名', artist: '测试歌手', cover: '', source: '测试播放器',
    sessionId: 'navigation-session', position: 10, duration: 180, rate: 1, playing: false, hasTimeline: true,
    sources: [{ id: 'navigation-session', label: '测试播放器' }] };
  await emit('session', session);
  await page.evaluate(() => window.__foliaSetMockPreferences({ musicApps: [
    { slot: 2, name: '播放器甲', path: 'C:\\fake\\one.exe', icon: '' }, { slot: 8, name: '播放器乙', path: 'C:\\fake\\two.exe', icon: '' },
  ] }));
  await emit('library', { count: 3, folders: ['C:\\fake\\music'] });
  await emit('online', { key: session.key, busy: false, message: '可选择歌词', errors: [], selectedKey: '', candidates: [
    { key: 'qq:one', provider: 'qq', id: 'one', title: '版本一', artist: '歌手', album: '', duration: 180, quality: '逐行', available: true, score: 90, autoEligible: true },
  ] });
  const panel = page.locator('.desktop-main-settings'), notice = page.locator('.desktop-message-notice');
  const navigate = async target => {
    await emit('notice', { text: '需要检查此设置', target });
    await notice.getByRole('button', { name: '查看设置', exact: true }).click();
    await panel.waitFor();
  };
  // Read the actual focused control and all owning scroll areas after each native notice action.
  const focusedWithin = async (selector, context) => {
    await page.waitForFunction(selector => {
      const expected = document.querySelector(selector), active = document.activeElement;
      return expected && active && (expected === active || expected.contains(active));
    }, selector);
    const sample = await page.evaluate(() => {
      const active = document.activeElement, scroll = document.querySelector('.desktop-main-settings .desktop-settings-scroll');
      const bounds = active.getBoundingClientRect(), viewport = scroll.getBoundingClientRect();
      return { bounds: bounds.toJSON(), viewport: viewport.toJSON(), pageY: scrollY, scrollTop: scroll.scrollTop,
        focus: active.getAttribute('aria-label') || active.textContent || active.tagName };
    });
    assert(sample.bounds.top >= sample.viewport.top - 1 && sample.bounds.bottom <= sample.viewport.bottom + 1, `${context}: target is visible inside the settings scroll area`);
    assert.equal(sample.pageY, 0, `${context}: background page does not scroll`);
    samples.push({ context, ...sample });
  };
  const targets = [
    [{ id: 'player-source' }, '[data-settings-target="player-source"]'],
    [{ id: 'music-apps' }, '[data-settings-target="music-apps"]'],
    [{ id: 'music-app-add' }, '[data-settings-target="music-app-add"]'],
    [{ id: 'music-app-binding', slot: 8 }, '[data-music-app-binding="8"]'],
    [{ id: 'music-app-binding', slot: 99 }, '[data-settings-target="music-app-add"]'],
    [{ id: 'manual-clock' }, '[data-settings-target="manual-clock"]'],
    [{ id: 'online-search' }, '[data-settings-target="online-search"]'],
    [{ id: 'online-sources' }, '[data-settings-target="online-sources"]'],
    [{ id: 'online-results' }, '[data-settings-target="online-results"]'],
    [{ id: 'local-import' }, '[data-settings-target="local-import"]'],
    [{ id: 'local-folders' }, '[data-settings-target="local-folders"]'],
    [{ id: 'audio' }, '[data-settings-target="audio"]'],
  ];
  for (const [width, height] of [[1280, 800], [450, 300]]) {
    await page.setViewportSize({ width, height });
    for (const [target, selector] of targets) {
      await navigate(target); await focusedWithin(selector, `${width}:${target.id}:${target.slot ?? ''}`);
    }
    assert.equal(await panel.locator('details').filter({ has: page.locator('[data-settings-target="manual-clock"]') }).getAttribute('open'), '');
    assert.equal(await panel.locator('.lyric-source-settings').getAttribute('open'), '');
    assert.equal(await panel.locator('[data-settings-expand="local-folders"]').getAttribute('open'), '');
    await page.screenshot({ path: `${output}/audio-target-${width}.png` });
  }
  checks.push('twelve destinations, removed-binding fallback, disclosures, focus and scroll bounds pass at two viewport sizes');
  await navigate({ id: 'online-search' });
  await panel.getByRole('textbox', { name: '在线搜索歌名' }).fill('保留尚未提交的歌名');
  await panel.evaluate(element => { element.dataset.navigationIdentity = 'same-panel'; element.querySelector('.desktop-settings-scroll').scrollTop = 0; });
  await navigate({ id: 'online-search' }); await focusedWithin('[data-settings-target="online-search"]', 'repeat-online-search');
  assert.equal(await panel.getAttribute('data-navigation-identity'), 'same-panel');
  assert.equal(await panel.getByRole('textbox', { name: '在线搜索歌名' }).inputValue(), '保留尚未提交的歌名');
  await navigate({ id: 'audio' }); await navigate({ id: 'online-search' });
  assert.equal(await panel.getByRole('textbox', { name: '在线搜索歌名' }).inputValue(), '保留尚未提交的歌名');
  checks.push('repeated and cross-target navigation keep the mounted panel and unsent search draft');
  await emit('openSettings', { target: { id: 'audio' } }); await focusedWithin('[data-settings-target="audio"]', 'host-navigation');
  await panel.locator('.desktop-settings-scroll').evaluate(element => { element.scrollTop = 0; });
  await emit('openSettings', { target: { id: 'audio' } }); await focusedWithin('[data-settings-target="audio"]', 'repeat-host-navigation');
  await emit('openSettings', { target: { id: 'online-search' } }); await focusedWithin('[data-settings-target="online-search"]', 'host-keeps-draft');
  assert.equal(await panel.getByRole('textbox', { name: '在线搜索歌名' }).inputValue(), '保留尚未提交的歌名');
  checks.push('native openSettings requests restore and navigate repeatedly without unmounting the panel');
  await page.evaluate(() => window.__foliaSetMockPreferences({ onlineEnabled: false }));
  await navigate({ id: 'online-sources' }); await focusedWithin('[data-settings-online-enabled]', 'offline-source-prerequisite');
  assert.equal(await panel.locator('.lyric-source-settings').getAttribute('open'), '');
  await page.evaluate(() => window.__foliaSetMockPreferences({ onlineEnabled: true }));
  await page.keyboard.press('Escape'); await panel.waitFor({ state: 'detached' });
  assert.equal(await page.locator('[data-settings-trigger]').evaluate(element => element === document.activeElement), true);
  await page.locator('[data-settings-trigger]').click(); await panel.waitFor();
  assert.equal(await panel.locator('.desktop-settings-scroll').evaluate(element => element.scrollTop), 0);
  checks.push('dismissal restores the persistent settings button; the ordinary gear still opens at the default location');
  await emit('connectionError', { text: '测试连接已断开' });
  await notice.getByRole('button', { name: '查看设置', exact: true }).click();
  await focusedWithin('[data-settings-target="player-source"]', 'connection-error');
  await emit('connectionError', { text: '' });
  await emit('session', { ...session, hasTimeline: false });
  await notice.getByRole('button', { name: '查看设置', exact: true }).click();
  await focusedWithin('[data-settings-target="manual-clock"]', 'missing-timeline');
  await emit('session', session);
  await emit('notice', { text: '普通无需设置的消息' });
  await notice.getByRole('button', { name: '关闭', exact: true }).click(); await notice.waitFor({ state: 'detached' });
  checks.push('persistent connection and timeline guidance choose distinct settings; generic messages remain dismissible');
  await page.close();

  for (const cancel of [false, true]) {
    const lazyPage = await preparePage();
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await lazyPage.route('**/src/desktopLyrics/DesktopVisualSettings.tsx*', async route => { await held; await route.continue(); });
    await lazyPage.goto(url, { waitUntil: 'domcontentloaded' }); await lazyPage.locator('.waiting-screen h1').waitFor();
    await lazyPage.evaluate(() => window.__foliaEmit('openSettings', { target: { id: 'background-settings' } }));
    assert.equal(await lazyPage.locator('.desktop-background-settings').count(), 0);
    if (cancel) await lazyPage.keyboard.press('Escape');
    release(); await lazyPage.waitForLoadState('networkidle');
    if (cancel) assert.equal(await lazyPage.locator('.control-panel').count(), 0, 'cancelled lazy destination never reopens');
    else {
      await lazyPage.locator('.desktop-background-settings').waitFor();
      assert.equal(await lazyPage.locator('[data-visual-section="background"]').count(), 1);
      await lazyPage.keyboard.press('Escape');
      assert.equal(await lazyPage.locator('[data-background-settings-trigger]').evaluate(element => element === document.activeElement), true);
      await lazyPage.evaluate(() => window.__foliaEmit('openSettings', { target: { id: 'visual-settings' } }));
      await lazyPage.locator('[data-visual-section="visualizer"]').waitFor();
      await lazyPage.getByRole('tab').first().click(); await lazyPage.locator('[data-visual-section="common"]').waitFor();
      await lazyPage.locator('.desktop-visual-settings').evaluate(element => { element.dataset.navigationIdentity = 'same-visual-panel'; });
      await lazyPage.evaluate(() => window.__foliaEmit('openSettings', { target: { id: 'visual-settings' } }));
      await lazyPage.locator('[data-visual-section="visualizer"]').waitFor();
      assert.equal(await lazyPage.locator('.desktop-visual-settings').getAttribute('data-navigation-identity'), 'same-visual-panel');
    }
    await lazyPage.close();
  }
  checks.push('lazy loading retains the target and persistent opener; repeat visual navigation keeps its surface; Escape cancels pending navigation');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(`PASS desktop settings navigation: ${checks.length} checks, ${samples.length} focus/viewport samples`);
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ checks, samples, errors }, null, 2));
  await browser?.close(); await server?.close();
}
