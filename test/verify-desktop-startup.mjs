import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';
import { installDesktopBridgeMock } from './desktop-bridge-mock.mjs';

// test/verify-desktop-startup.mjs — hold the real bundled font while verifying immediate host/control readiness.
const root = resolve(process.env.FOLIA_BENCH_DIST || 'dist-desktop');
const output = resolve('test-results/desktop-startup');
const mimes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.otf': 'font/otf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
  try {
    const path = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!path.startsWith(root + sep)) throw Error('Invalid path');
    const body = await readFile(path);
    response.writeHead(200, { 'Content-Type': mimes[extname(path)] || 'application/octet-stream' }); response.end(body);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ executablePath: process.env.FOLIA_CHROMIUM_PATH, headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const results = [];
try {
  for (const failFont of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await installDesktopBridgeMock(page);
    await page.addInitScript(() => localStorage.setItem('folia.desktop.mode.v1', 'classic'));
    let release, requested;
    const gate = new Promise(done => { release = done; });
    const fontRequested = new Promise(done => { requested = done; });
    await page.route('**/fonts/NotoSansCJKsc-Regular.otf', async route => {
      requested(); await gate;
      if (failFont) await route.abort('failed'); else await route.continue();
    });
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}/desktop.html`, { waitUntil: 'domcontentloaded' });
      await fontRequested;
      await page.waitForFunction(() => window.__foliaReadyAt !== null, null, { timeout: 2000 });
      assert(await page.locator('.desktop-statusbar').isVisible(), 'controls render before the font finishes');
      await page.getByRole('button', { name: '打开歌词设置', exact: true }).click();
      await page.locator('.control-panel').waitFor();
      await page.locator('.desktop-topbar [data-settings-trigger]').click();
      await page.evaluate(() => {
        const song = { key: 'startup', title: '启动验证', artist: '测试', source: 'mock', sources: [], cover: '', playing: false,
          position: 2, duration: 60, rate: 1, hasTimeline: true, sessionId: 'startup-session', controls: { play: true, pause: true, next: true, previous: true, toggle: true } };
        window.__foliaEmit('session', song);
        window.__foliaEmit('lyrics', { key: song.key, title: song.title, artist: song.artist, content: '[00:01.00]字体就绪后显示歌词\n[00:30.00]继续播放', translation: '[00:01.00]Font ready lyric\n[00:30.00]Next line', format: 'lrc', source: 'startup', cover: '', embedded: false });
      });
      await page.getByRole('button', { name: '继续播放音乐', exact: true }).click();
      const request = await page.evaluate(() => window.__foliaCommands.filter(message => message.type === 'mediaControl').at(-1));
      assert.equal(request.value.songKey, 'startup', 'playback is available while font and lyrics prepare');
      await page.locator('.waiting-screen').waitFor({ state: 'detached' });
      assert.equal(await page.locator('.desktop-stage').innerText(), '', 'measured lyric layouts still wait for the font');
      release();
      await page.waitForFunction(() => document.querySelector('[data-font-debug-target="visualizer-translation"]')?.textContent.includes('Font ready lyric'));
      assert.equal(errors.length, 0, errors.join('\n'));
      results.push({ font: failFont ? 'failed with fallback' : 'delayed then loaded', controlsBeforeFont: true, lyricsReady: true });
    } catch (error) {
      console.error(await page.evaluate(() => ({ stage: document.querySelector('.desktop-stage')?.textContent, fontStatus: document.fonts.status })), errors);
      throw error;
    } finally { release(); await page.close(); }
  }
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log('PASS delayed and failed font: immediate host connection, working controls, correctly gated lyric layout');
} finally { await browser.close(); await new Promise(done => server.close(done)); }
