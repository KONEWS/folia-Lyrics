import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installDesktopBridgeMock } from './desktop-bridge-mock.mjs';

// test/verify-online-candidates.mjs — exercise the real disclosure through an isolated host on a desktop dev URL.
let url = process.env.FOLIA_TEST_URL;
const output = resolve(process.env.FOLIA_UI_OUTPUT || 'test-results/online-candidates');
const checks = [], samples = [], errors = [];
const session = { key: 'test', title: '候选测试歌名', artist: '候选测试歌手', cover: '', source: '测试播放器',
  sessionId: 'candidate-session', position: 10, duration: 180, rate: 1, playing: false, hasTimeline: true,
  sources: [{ id: 'candidate-session', label: '测试播放器' }] };
const candidates = Array.from({ length: 12 }, (_, index) => ({ key: `${index % 2 ? 'kugou' : 'qq'}:candidate-${index + 1}`,
  provider: index % 2 ? 'kugou' : 'qq', id: `candidate-${index + 1}`, title: `候选版本 ${index + 1}`,
  artist: '测试歌手', album: '测试专辑', duration: 180, quality: '逐字', available: index !== 3, score: 100 - index, autoEligible: index < 3 }));
const online = { key: session.key, busy: false, message: '测试候选列表', errors: [], selectedKey: candidates[8].key, candidates };
await mkdir(output, { recursive: true });
let browser, server;

// Check that expanding and collapsing keeps the controlling button inside the settings scroll area.
async function verifyToggleGeometry(page, toggle, context) {
  await toggle.scrollIntoViewIfNeeded();
  const sample = await toggle.evaluate(element => {
    const bounds = element.getBoundingClientRect(), scroll = element.closest('.desktop-settings-scroll').getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return { bounds: bounds.toJSON(), scroll: scroll.toJSON(), reachable: hit === element || element.contains(hit),
      width: innerWidth, pageScrollX: scrollX, pageScrollY: scrollY, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert(sample.bounds.top >= sample.scroll.top - 1 && sample.bounds.bottom <= sample.scroll.bottom + 1, `${context}: disclosure stays in the panel`);
  assert(sample.reachable && !sample.overflow, `${context}: disclosure is reachable without horizontal overflow`);
  assert.equal(sample.pageScrollX + sample.pageScrollY, 0, `${context}: page background remains stationary`);
  samples.push({ context, ...sample });
}

try {
  if (!url) {
    server = await createServer({ configFile: resolve('vite.desktop.config.ts'), server: { host: '127.0.0.1', port: 0, hmr: false,
      watch: { ignored: ['**/obj/**', '**/bin/**', '**/release/**'] } } });
    await server.listen(); url = `http://127.0.0.1:${server.httpServer.address().port}/desktop.html`;
  }
  const origin = new URL(url).origin;
  browser = await chromium.launch({ executablePath: process.env.FOLIA_CHROMIUM_PATH, headless: true, args: ['--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await installDesktopBridgeMock(page);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('.waiting-screen h1').waitFor();
  const emit = (type, data) => page.evaluate(({ type, data }) => window.__foliaEmit(type, data), { type, data });
  await page.evaluate(() => window.__foliaSetMockPreferences({ autoImmersive: false }));
  await emit('session', session); await emit('online', online);
  await emit('openSettings', { target: { id: 'online-results' } });
  const results = page.locator('.online-results'), visibleCandidates = results.locator('.online-result:visible');
  const toggle = results.locator('.online-candidates-toggle');
  const waitCount = count => page.waitForFunction(count => [...document.querySelectorAll('.online-result')].filter(element => element.getClientRects().length > 0).length === count, count);
  // Host messages enqueue React updates; wait for the rendered disabled state before taking a snapshot.
  const waitSelectableCount = count => page.waitForFunction(count => document.querySelectorAll('.online-results .online-result:not(:disabled)').length === count, count);
  await waitCount(5);
  assert.equal(await results.locator('.online-result').count(), 12, 'all host candidates remain in the UI');
  assert.deepEqual(await visibleCandidates.locator('strong').allTextContents(), candidates.slice(0, 5).map(candidate => candidate.title));
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  assert.match(await results.locator('.online-candidates-selection').innerText(), /候选版本 9/);
  assert.equal(await results.getByRole('button', { pressed: true }).count(), 0, 'collapsed choice is announced separately and stays outside keyboard navigation');
  assert.equal(await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'selectOnline').length), 0, 'rendering candidates does not select a version');
  await verifyToggleGeometry(page, toggle, 'wide-collapsed');
  await page.screenshot({ path: `${output}/collapsed.png` });
  checks.push('exactly five initial choices; all twelve retained; hidden selection remains visible without automatic selection');

  await emit('online', { ...online, candidates: candidates.map((candidate, index) => ({ ...candidate, available: index >= 5 })) });
  await emit('openSettings', { target: { id: 'online-results' } });
  await page.waitForFunction(() => document.activeElement?.classList.contains('online-candidates-toggle'));
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await emit('online', online);
  checks.push('settings navigation skips disabled initial choices and hidden extra choices, reaching the disclosure');

  await toggle.focus(); await page.keyboard.press('Space'); await waitCount(12);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(await results.locator('.online-candidates-selection').count(), 0);
  assert.match(await results.getByRole('button', { pressed: true }).innerText(), /候选版本 9/);
  await results.getByRole('button', { name: `使用歌词：${candidates[10].title} / 测试歌手 / ${candidates[10].id}`, exact: true }).click();
  await page.waitForFunction(() => window.__foliaCommands.some(command => command.type === 'selectOnline'));
  assert.deepEqual(await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'selectOnline')),
    [{ type: 'selectOnline', value: { id: candidates[10].key, songKey: session.key } }]);
  await emit('online', { ...online, selectedKey: candidates[10].key });
  assert.match(await results.getByRole('button', { pressed: true }).innerText(), /候选版本 11/);
  await toggle.focus(); await page.keyboard.press('Enter'); await waitCount(5);
  assert.match(await results.locator('.online-candidates-selection').innerText(), /候选版本 11/);
  await visibleCandidates.nth(4).focus(); await page.keyboard.press('Tab');
  assert.equal(await toggle.evaluate(element => element === document.activeElement), true, 'hidden choices do not receive Tab focus');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await visibleCandidates.nth(4).evaluate(element => element === document.activeElement), true);
  checks.push('Space and Enter toggle all choices; hidden items leave Tab order; expanded selection sends one current-song host command');

  await toggle.click(); await waitCount(12);
  await emit('online', { ...online, busy: true });
  await waitSelectableCount(0);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(await visibleCandidates.count(), 12);
  assert.equal(await results.locator('.online-result:not(:disabled)').count(), 0);
  const extended = [...candidates, { ...candidates[0], key: 'qq:late-result', id: 'late-result', title: '较晚到达的版本' }];
  await emit('online', { ...online, candidates: extended }); await waitCount(13);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true', 'later provider results preserve expansion');
  const replacement = candidates.map(candidate => ({ ...candidate, key: `${candidate.key}-new`, id: `${candidate.id}-new` }));
  await emit('online', { ...online, selectedKey: '', candidates: replacement }); await waitCount(5);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'a replacement search collapses');
  await toggle.click(); await waitCount(12);
  await emit('online', { ...online, candidates: [], selectedKey: '' }); await waitCount(0);
  await emit('online', online); await waitCount(5);
  await toggle.click(); await waitCount(12);
  await emit('session', { ...session, key: 'new-song', title: '另一首歌' });
  await emit('online', { ...online, key: 'new-song' }); await waitCount(5);
  checks.push('selection loading and late arrivals preserve expansion; fresh searches, cleared results and song changes reset it');

  await page.evaluate(() => window.__foliaSetMockPreferences({ onlineEnabled: false }));
  await waitSelectableCount(0);
  assert.equal(await results.locator('.online-result:not(:disabled)').count(), 0);
  await toggle.click(); await waitCount(12);
  assert.equal(await results.locator('.online-result:not(:disabled)').count(), 0, 'offline results remain inspectable but cannot select');
  await page.evaluate(() => window.__foliaSetMockPreferences({ onlineEnabled: true, onlineProviders: ['qq'] }));
  await waitSelectableCount(6);
  assert.equal(await results.locator('.online-result:not(:disabled)').count(), 6, 'disabled providers and unavailable candidates stay disabled');
  await emit('online', { ...online, key: 'new-song', candidates: candidates.slice(0, 5), selectedKey: candidates[0].key }); await waitCount(5);
  assert.equal(await toggle.count(), 0, 'five or fewer candidates need no disclosure');
  assert.equal(await results.getByRole('button', { pressed: true }).count(), 1);
  await emit('online', { ...online, key: 'new-song', candidates: candidates.slice(0, 4), selectedKey: '' }); await waitCount(4);
  await emit('online', { ...online, key: 'new-song' }); await waitCount(5);
  checks.push('offline, disabled-source and unavailable-candidate rules are preserved; short lists reset the disclosure');

  await page.evaluate(() => window.__foliaSetMockPreferences({ onlineProviders: ['qq', 'kugou'] }));
  for (const [width, height] of [[1280, 800], [450, 300], [320, 400]]) {
    await page.setViewportSize({ width, height });
    await verifyToggleGeometry(page, toggle, `${width}-collapsed`);
    await toggle.click(); await waitCount(12);
    await verifyToggleGeometry(page, toggle, `${width}-expanded`);
    await page.screenshot({ path: `${output}/expanded-${width}.png` });
    await toggle.click(); await waitCount(5);
  }
  await emit('appearance', { acrylic: false, solid: true, highContrast: true });
  await verifyToggleGeometry(page, toggle, 'high-contrast-collapsed');
  await page.screenshot({ path: `${output}/high-contrast.png` });
  checks.push('disclosure remains reachable at wide, narrow and short sizes, including high contrast');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(`PASS online candidate folding: ${checks.length} checks, ${samples.length} layout samples`);
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ checks, samples, errors }, null, 2));
  await browser?.close();
  await server?.close();
}
