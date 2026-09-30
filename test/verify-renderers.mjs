import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
import { verifyTransport } from './verify-transport.mjs';
import { verifyAppearance } from './verify-appearance.mjs';

// test/verify-renderers.mjs
const root = resolve('dist-desktop');
const singleMode = process.env.FOLIA_MODE_INDEX;
const output = resolve(singleMode === undefined ? 'test-results/desktop' : 'test-results/desktop-playback');
await mkdir(output, { recursive: true });
const mimes = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.otf':'font/otf', '.woff2':'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!path.startsWith(root + sep)) throw new Error('Invalid path');
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': mimes[extname(path)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.FOLIA_CHROMIUM_PATH, headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox'] });
const errors = [], results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    const listeners = new Set();
    const prefs = { topmost: false, audioReactive: true, source: '', onlineEnabled: true, onlineProviders: ['kugou', 'qq', 'netease', 'lrclib'] };
    window.__foliaCommands = [];
    window.__foliaEmit = (type, data) => listeners.forEach(fn => fn({ data: { type, data } }));
    window.chrome ||= {};
    window.chrome.webview = {
      postMessage: m => {
        window.__foliaCommands.push(m);
        if (['topmost', 'audioReactive', 'source', 'onlineEnabled'].includes(m.type)) {
          prefs[m.type] = m.value;
          queueMicrotask(() => window.__foliaEmit('preferences', { ...prefs }));
        }
        if (m.type === 'onlineProvider') {
          prefs.onlineProviders = m.value.enabled ? [...new Set([...prefs.onlineProviders, m.value.id])] : prefs.onlineProviders.filter(id => id !== m.value.id);
          queueMicrotask(() => window.__foliaEmit('preferences', { ...prefs }));
        }
        if (m.type === 'searchOnline') {
          queueMicrotask(() => window.__foliaEmit('online', { key: 'test', busy: false, message: '选择与你播放版本相符的歌词', errors: [], selectedKey: '', candidates: [
            { key: 'qq:1', provider: 'qq', id: '1', title: 'Reborn', artist: 'Girls Archives.', album: 'Reborn', duration: 169, quality: '逐字 / 逐行', available: true, score: 92, autoEligible: true },
            { key: 'lrclib:2', provider: 'lrclib', id: '2', title: 'Reborn', artist: 'Girls Archives.', album: '', duration: 169, quality: '无同步时间轴', available: false, score: 90, autoEligible: false },
          ] }));
        }
        if (m.type === 'selectOnline') {
          queueMicrotask(() => window.__foliaEmit('lyrics', { key: 'test', title: 'Reborn', artist: 'Girls Archives.', content: '[00:01.00]测试歌词\n[00:36.00]同步显示\n[01:20.00]下一行', source: 'QQ 音乐 · 测试桥', cover: '', embedded: false, format: 'lrc' }));
        }
      },
      addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn),
    };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/desktop.html`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '音乐在播放，歌词在这里。' }).waitFor();
  assert(await page.getByRole('button', { name: '继续播放音乐', exact: true }).isDisabled());
  await page.screenshot({ path: `${output}/welcome.png` });
  const appearanceChecks = await verifyAppearance(page, output);
  const raw = process.env.FOLIA_TEST_LRC ? await readFile(process.env.FOLIA_TEST_LRC, 'utf8')
    : '[00:01.000]音乐在播放\n[00:20.000]歌词跟随时间\n[00:33.000]保留原版动效\n[00:42.000]下一行歌词';
  const song = { key: 'test', title: 'Reborn', artist: 'Girls Archives.', cover: '', source: 'Test local player',
    playing: false, position: 36, duration: 169.127, rate: 1, hasTimeline: true,
    sources: [{ id: 'Test local player', label: 'Test local player' }], sessionId: 'player-session-a',
    controls: { play: true, pause: true, toggle: true, previous: true, next: true } };
  const onlinePacket = process.env.FOLIA_TEST_PACKET ? JSON.parse(await readFile(process.env.FOLIA_TEST_PACKET, 'utf8')) : null;
  await page.evaluate(({ song, raw, onlinePacket }) => {
    window.__foliaEmit('session', song);
    window.__foliaEmit('lyrics', onlinePacket ? { ...onlinePacket, key: song.key } : { key: song.key, title: song.title, artist: song.artist, content: raw, source: '内嵌歌词 · Reborn.flac', cover: '', embedded: true });
  }, { song, raw, onlinePacket });
  await page.locator('.waiting-screen').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '打开歌词设置' }).click();
  const modes = page.locator('button.effect');
  assert(await modes.count() >= 12, `expected Folia's 12 original modes, found ${await modes.count()}`);
  for (let i = 0; i < 12; i++) {
    if (singleMode !== undefined && i !== Number(singleMode)) continue;
    const label = (await modes.nth(i).innerText()).replace(/\n/g, ' ');
    await modes.nth(i).click();
    await page.waitForTimeout(1200);
    assert.equal(await modes.nth(i).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByText('这个动效暂时无法显示', { exact: false }).count(), 0);
    assert.equal(errors.length, 0, errors.join('\n'));
    if (i === 2 && !process.env.FOLIA_TEST_LRC && !onlinePacket) {
      assert.match(await page.locator('.clock-readout').innerText(), /^0:36/);
    }
    await page.screenshot({ path: `${output}/mode-${String(i + 1).padStart(2, '0')}.png`, timeout: 90000 });
    results.push({ mode: label, mounted: true, consoleErrors: 0 });
    console.log('PASS', label);
  }
  // Exercise real frame updates with a mocked external player, then freeze the lyric on pause.
  await modes.nth(0).click();
  await page.getByRole('button', { name: '关闭设置' }).click();
  await page.evaluate(song => {
    const start = performance.now();
    window.__foliaEmit('session', { ...song, playing: true });
    window.__foliaClockTimer = setInterval(() => window.__foliaEmit('clock', {
      ...song, playing: true, position: 36 + (performance.now() - start) / 1000,
    }), 250);
  }, song);
  await page.waitForFunction(() => !document.querySelector('.clock-readout')?.textContent?.startsWith('0:36'));
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${output}/sonnet-playing.png` });
  await page.evaluate(song => { clearInterval(window.__foliaClockTimer); window.__foliaEmit('session', song); }, song);
  await page.getByRole('button', { name: '打开歌词设置' }).click();
  // Use the lightweight renderer for clock assertions: software WebGL can stall animation frames.
  await modes.nth(2).click();
  await page.getByRole('checkbox', { name: '自动匹配在线歌词', exact: true }).uncheck();
  assert(await page.getByRole('checkbox', { name: '启用QQ 音乐歌词源' }).isDisabled());
  await page.getByRole('checkbox', { name: '自动匹配在线歌词', exact: true }).check();
  await page.getByRole('checkbox', { name: '启用QQ 音乐歌词源' }).uncheck();
  await page.getByRole('checkbox', { name: '启用QQ 音乐歌词源' }).check();
  await page.getByLabel('在线搜索歌名').fill('Reborn');
  await page.getByLabel('在线搜索歌手').fill('Girls Archives.');
  await page.getByRole('button', { name: '搜索在线歌词', exact: true }).click();
  await page.locator('.online-result').first().waitFor();
  assert.equal(await page.locator('.online-result').count(), 2);
  assert(await page.locator('.online-result').nth(1).isDisabled());
  await page.getByRole('button', { name: '使用歌词：Reborn / Girls Archives. / 1', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.status-left')?.textContent?.includes('QQ 音乐 · 测试桥'));
  await page.getByRole('checkbox', { name: '自动匹配在线歌词', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/online-settings.png` });
  await page.getByRole('button', { name: '歌词提前 0.2 秒' }).click();
  assert.equal(await page.getByText('提前 0.2 秒', { exact: true }).count(), 1);
  await page.getByRole('button', { name: '重置歌词偏移' }).click();
  await page.getByRole('checkbox', { name: '窗口置顶' }).check();
  await page.getByRole('checkbox', { name: '跟随系统声音变化' }).uncheck();
  await page.getByRole('button', { name: '关闭设置' }).click();
  const emitClock = async position => page.evaluate(({ song, position }) => window.__foliaEmit('clock', { ...song, position }), { song, position });
  await emitClock(70);
  await page.waitForFunction(() => document.querySelector('.clock-readout')?.textContent?.startsWith('1:10'), null, { timeout: 10000 });
  assert.match(await page.locator('.clock-readout').innerText(), /^1:10/);
  await page.waitForTimeout(400); assert.match(await page.locator('.clock-readout').innerText(), /^1:10/);
  await emitClock(15);
  await page.waitForFunction(() => document.querySelector('.clock-readout')?.textContent?.startsWith('0:15'), null, { timeout: 10000 });
  assert.match(await page.locator('.clock-readout').innerText(), /^0:15/);
  await page.getByRole('button', { name: '沉浸显示' }).click();
  assert.equal(await page.locator('.desktop-lyrics.immersive').count(), 1);
  await page.getByRole('button', { name: '显示控制栏' }).click();
  assert.equal(await page.locator('.desktop-lyrics.immersive').count(), 0);
  assert.equal(await page.locator('audio,video').count(), 0);
  const commands = await page.evaluate(() => window.__foliaCommands);
  assert(commands.some(m => m.type === 'topmost' && m.value === true));
  assert(commands.some(m => m.type === 'audioReactive' && m.value === false));
  assert(commands.some(m => m.type === 'searchOnline' && m.value.title === 'Reborn' && m.value.artist === 'Girls Archives.'));
  assert(commands.some(m => m.type === 'selectOnline' && m.value.id === 'qq:1' && m.value.songKey === 'test'));
  const transportChecks = await verifyTransport(page, song, output);
  await page.evaluate(song => window.__foliaEmit('session', { ...song, key: 'next', title: '另一首歌' }), song);
  await page.locator('.waiting-screen').waitFor();
  await page.evaluate(() => {
    window.__foliaEmit('lyrics', { key: 'test', title: '过期歌曲', artist: '过期歌手', content: '[00:01.00]过期歌词', source: 'stale-source', cover: '', embedded: false });
    window.__foliaEmit('online', { key: 'test', busy: false, message: 'stale-search-result', candidates: [], errors: [], selectedKey: '' });
  });
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.waiting-screen').count(), 1);
  assert(!(await page.locator('.status-left').innerText()).includes('stale'));
  assert.equal(errors.length, 0, errors.join('\n'));
  await writeFile(`${output}/results.json`, JSON.stringify({ modes: results, appearanceChecks, transportChecks, checks: ['host handshake','mode mounts','paused mode switch initializes visible lyric without advancing time','offset','preference messages','pause','backward seek','immersion','no media element','track change clears lyrics','online source controls','manual search and selection','untimed result disabled','stale song and search results ignored'], errors }, null, 2));
  console.log('PASS desktop integration checks');
} finally {
  await browser.close(); await new Promise(r => server.close(r));
}
