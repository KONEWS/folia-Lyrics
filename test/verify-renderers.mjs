import { chromium } from 'playwright';
import { installDesktopBridgeMock } from './desktop-bridge-mock.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
import { verifyTransport } from './verify-transport.mjs';
import { verifyAppearance } from './verify-appearance.mjs';
import { verifyLumiere } from './verify-lumiere.mjs';
import { verifyAudioProgress } from './verify-audio-progress.mjs';
import { verifyTransparency } from './verify-transparency.mjs';
import { verifyCoverImmersion } from './verify-cover-immersion.mjs';
import { verifyTopbar } from './verify-topbar.mjs';
import { verifyGlassUi } from './verify-glass-ui.mjs';
import { installPlaybackInputProbe, verifyPlaybackInput } from './verify-playback-input.mjs';
import { verifyLyricsChromeLayout } from './verify-lyrics-chrome-layout.mjs';
import { desktopSelect, readDesktopOptions, selectDesktopOption } from './desktop-select.mjs';
import { installDesktopParserProbe, verifyDesktopParserFormats } from './verify-desktop-parser-formats.mjs';
import { verifySettingsRefresh } from './verify-settings-refresh.mjs';

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
let page;
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  if (!process.env.FOLIA_CHECKS_ONLY || process.env.FOLIA_CHECKS_ONLY === 'input') await installPlaybackInputProbe(page);
  if (!process.env.FOLIA_CHECKS_ONLY || ['parser', 'settings-refresh'].includes(process.env.FOLIA_CHECKS_ONLY)) await installDesktopParserProbe(page);
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await installDesktopBridgeMock(page);
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
  if (process.env.FOLIA_CHECKS_ONLY === 'settings-refresh') {
    const checks = await verifySettingsRefresh(page, song, output);
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log(`PASS focused settings and refresh: ${checks.length} checks`);
  } else if (process.env.FOLIA_CHECKS_ONLY === 'parser') {
    const checks = await verifyDesktopParserFormats(page, song, output);
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log(`PASS focused parser formats: ${checks.length} checks`);
  } else if (process.env.FOLIA_CHECKS_ONLY === 'input') {
    const checks = await verifyPlaybackInput(page, song, output);
    assert.equal(errors.length, 0, errors.join('\n'));
    await writeFile(`${output}/playback-input-results.json`, JSON.stringify({ checks, errors }, null, 2));
    console.log('PASS focused playback input integration checks');
  } else if (process.env.FOLIA_CHECKS_ONLY === 'lyrics-layout') {
    const checks = await verifyLyricsChromeLayout(page, song, output);
    assert.equal(errors.length, 0, errors.join('\n'));
    await writeFile(`${output}/chrome-layout-results.json`, JSON.stringify({ checks, errors }, null, 2));
    console.log('PASS focused lyric chrome layout integration checks');
  } else if (process.env.FOLIA_CHECKS_ONLY === 'glass') {
    const checks = await verifyGlassUi(page, song, output);
    assert.equal(errors.length, 0, errors.join('\n'));
    await writeFile(`${output}/glass-results.json`, JSON.stringify({ checks, errors }, null, 2));
    console.log('PASS focused unified glass / nested menus integration checks');
  } else if (process.env.FOLIA_CHECKS_ONLY === 'topbar') {
    const checks = await verifyTopbar(page, song, output);
    assert.equal(errors.length, 0, errors.join('\n'));
    await writeFile(`${output}/topbar-results.json`, JSON.stringify({ checks, errors }, null, 2));
    console.log('PASS focused topbar / hover / fullscreen integration checks');
  } else if (process.env.FOLIA_CHECKS_ONLY === 'cover-immersion') {
    const checks = await verifyCoverImmersion(page, song, output);
    assert.equal(errors.length, 0, errors.join('\n'));
    await writeFile(`${output}/cover-immersion-results.json`, JSON.stringify({ checks, errors }, null, 2));
    console.log('PASS focused cover / immersion integration checks');
  } else {
  await page.getByRole('button', { name: '打开歌词设置' }).click();
  const selector = desktopSelect(page, '歌词样式');
  const modes = await readDesktopOptions(page, '歌词样式');
  const modeCount = modes.length;
  assert(modeCount > 0, 'registry must expose dynamic modes');
  assert.equal(modeCount, 13, 'the desktop exposes all 13 dynamic modes');
  assert.equal(modes.filter(mode => mode.value === 'still').length, 0);
  assert.equal(modes.filter(mode => mode.label === '绘光').length, 1);
  const clockMode = () => selectDesktopOption(page, '歌词样式', { label: 'Luminous' });
  for (let i = 0; i < modeCount; i++) {
    if (singleMode !== undefined && i !== Number(singleMode)) continue;
    const { label, value } = modes[i];
    await selectDesktopOption(page, '歌词样式', { value });
    await page.waitForTimeout(1200);
    assert.equal(await selector.getAttribute('data-value'), value);
    assert.equal(await page.evaluate(() => localStorage.getItem('folia.desktop.mode.v1')), value);
    assert.equal(await page.getByText('这个动效暂时无法显示', { exact: false }).count(), 0);
    assert.equal(errors.length, 0, errors.join('\n'));
    if (!process.env.FOLIA_TEST_LRC && !onlinePacket) {
      assert.match(await page.locator('.clock-readout').innerText(), /^0:36/);
    }
    await page.screenshot({ path: `${output}/mode-${String(i + 1).padStart(2, '0')}.png`, timeout: 90000 });
    results.push({ mode: label, mounted: true, consoleErrors: 0 });
    console.log('PASS', label);
  }
  const lumiereChecks = await verifyLumiere(page, song, output);
  // Exercise real frame updates with a mocked external player, then freeze the lyric on pause.
  await clockMode();
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
  await page.screenshot({ path: `${output}/desktop-playing.png` });
  await page.evaluate(song => { clearInterval(window.__foliaClockTimer); window.__foliaEmit('session', song); }, song);
  await page.getByRole('button', { name: '打开歌词设置' }).click();
  // Use the lightweight renderer for clock assertions: software WebGL can stall animation frames.
  await clockMode();
  await page.locator('.lyric-source-settings > summary').click();
  assert.equal(await page.locator('.lyric-source-settings').getAttribute('open'), '', 'expand provider settings before exercising their switches');
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
  const audioProgressChecks = await verifyAudioProgress(page, song, output);
  await writeFile(`${output}/audio-progress-results.json`, JSON.stringify(audioProgressChecks, null, 2));
  const transparencyChecks=await verifyTransparency(page, output);
  await writeFile(`${output}/transparency-results.json`, JSON.stringify(transparencyChecks,null,2));
  const coverImmersionChecks = await verifyCoverImmersion(page, song, output);
  await writeFile(`${output}/cover-immersion-results.json`, JSON.stringify(coverImmersionChecks, null, 2));
  const topbarChecks = await verifyTopbar(page, song, output);
  await writeFile(`${output}/topbar-results.json`, JSON.stringify({ checks: topbarChecks, errors }, null, 2));
  const glassChecks = await verifyGlassUi(page, song, output);
  await writeFile(`${output}/glass-results.json`, JSON.stringify({ checks: glassChecks, errors }, null, 2));
  await page.evaluate(song => window.__foliaEmit('session', { ...song, key: 'next', title: '另一首歌' }), song);
  await page.locator('.waiting-screen').waitFor();
  await page.evaluate(() => {
    window.__foliaEmit('lyrics', { key: 'test', title: '过期歌曲', artist: '过期歌手', content: '[00:01.00]过期歌词', source: 'stale-source', cover: '', embedded: false });
    window.__foliaEmit('online', { key: 'test', busy: false, message: 'stale-search-result', candidates: [], errors: [], selectedKey: '' });
  });
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.waiting-screen').count(), 1);
  assert(!(await page.locator('.status-left').innerText()).includes('stale'));
  const playbackInputChecks = await verifyPlaybackInput(page, song, output);
  await writeFile(`${output}/playback-input-results.json`, JSON.stringify({ checks: playbackInputChecks, errors }, null, 2));
  // Theme checks use the real animation clock before the layout suite installs its virtual deadline clock.
  const settingsRefreshChecks = await verifySettingsRefresh(page, song, output);
  const chromeLayoutChecks = await verifyLyricsChromeLayout(page, song, output);
  await writeFile(`${output}/chrome-layout-results.json`, JSON.stringify({ checks: chromeLayoutChecks, errors }, null, 2));
  const parserFormatChecks = await verifyDesktopParserFormats(page, song, output);
  assert.equal(errors.length, 0, errors.join('\n'));
  await writeFile(`${output}/results.json`, JSON.stringify({ modes: results, appearanceChecks, transportChecks, lumiereChecks, topbarChecks, glassChecks, playbackInputChecks, chromeLayoutChecks, settingsRefreshChecks, parserFormatChecks, checks: ['host handshake','mode mounts','paused mode switch initializes visible lyric without advancing time','offset','preference messages','pause','backward seek','immersion','no media element','track change clears lyrics','online source controls','manual search and selection','untimed result disabled','stale song and search results ignored'], errors }, null, 2));
  console.log('PASS desktop integration checks');
  }
} catch (error) {
  // Preserve visible state on failure so hidden chrome and asynchronous lyric parsing can be distinguished.
  if (page && !page.isClosed()) try {
    const diagnostic = await page.evaluate(() => {
      const sample = selector => {
        const element = document.querySelector(selector);
        return element ? { text: element.textContent, visibleText: element.innerText,
          visibility: getComputedStyle(element).visibility, display: getComputedStyle(element).display } : null;
      };
      return { rootClass: document.querySelector('.desktop-lyrics')?.className,
        caption: sample('.track-caption'), clock: sample('.clock-readout'), waiting: sample('.waiting-screen'),
        stage: sample('.desktop-stage'), canvasCount: document.querySelectorAll('.desktop-stage canvas').length,
        activeElement: document.activeElement?.outerHTML.slice(0, 1000),
        recentCommands: window.__foliaCommands?.slice(-15) };
    });
    await writeFile(`${output}/failure-state.json`, JSON.stringify(diagnostic, null, 2));
    await page.screenshot({ path: `${output}/failure.png`, timeout: 10000 });
    console.error('FAIL desktop state', JSON.stringify(diagnostic));
  } catch (diagnosticError) { console.error('Failure diagnostics unavailable:', String(diagnosticError)); }
  throw error;
} finally {
  await browser.close(); await new Promise(r => server.close(r));
}
