import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installDesktopBridgeMock } from './desktop-bridge-mock.mjs';

// test/verify-desktop-pause.mjs — real classic/Lumiere rendering under an isolated, ordered native clock fixture.
const output = resolve(process.env.FOLIA_UI_OUTPUT || 'test-results/desktop-pause');
await mkdir(output, { recursive: true });
const checks = [], samples = [], errors = [];
let server, browser;
const screenshotStyle = '.desktop-topbar-shell,.control-panel,.desktop-statusbar,.window-chrome,.desktop-notice{opacity:0!important;transition:none!important}';
const lyrics = JSON.stringify({ format: 'folia-lyricdata', version: 1, song: {}, lyrics: {
  isWordByWord: true, lines: [
    { startTime: 1, endTime: 30, fullText: 'PREVIOUS LINE', words: [{ text: 'PREVIOUS ', startTime: 1, endTime: 12 }, { text: 'LINE', startTime: 12, endTime: 30 }] },
    { startTime: 33, endTime: 42, fullText: 'BEFORE FINAL FRAME', words: [
      { text: 'BEFORE ', startTime: 33, endTime: 36.34 }, { text: 'FINAL ', startTime: 36.34, endTime: 38 }, { text: 'FRAME', startTime: 38, endTime: 42 },
    ] },
    { startTime: 42, endTime: 55, fullText: 'NEXT LINE', words: [{ text: 'NEXT ', startTime: 42, endTime: 47 }, { text: 'LINE', startTime: 47, endTime: 55 }] },
  ],
} });

try {
  let url = process.env.FOLIA_TEST_URL;
  if (!url) {
    server = await createServer({ configFile: resolve('vite.desktop.config.ts'), server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
    await server.listen(); url = `http://127.0.0.1:${server.httpServer.address().port}/desktop.html`;
  }
  const origin = new URL(url).origin;
  browser = await chromium.launch({ executablePath: process.env.FOLIA_CHROMIUM_PATH, headless: true,
    args: ['--no-proxy-server', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox'] });
  for (const mode of ['classic', 'lumiere']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    page.on('pageerror', error => errors.push(`${mode}: ${error}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`${mode}: ${message.text()}`); });
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await installDesktopBridgeMock(page);
    await page.addInitScript(mode => {
      localStorage.setItem('folia.desktop.mode.v1', mode);
      sessionStorage.setItem('folia.test.mockPreferences', JSON.stringify({ autoImmersive: false, audioReactive: false }));
    }, mode);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('.waiting-screen h1').waitFor();
    await page.evaluate(() => document.fonts.ready);
    // Observe the actual MotionValue publish without replacing the clock, RAF, parser, or either renderer.
    await page.evaluate(async () => {
      const { DesktopClockValue } = await import('/src/desktopLyrics/DesktopClockValue.ts');
      const original = DesktopClockValue.prototype.set;
      window.__foliaPauseClock = { value: null, changed: 0, publishedAt: 0, frameAt: 0 };
      DesktopClockValue.prototype.set = function (value, ...args) {
        if (value !== window.__foliaPauseClock.value) window.__foliaPauseClock.changed++;
        window.__foliaPauseClock.value = value;
        window.__foliaPauseClock.publishedAt = performance.now();
        window.__foliaPauseClock.frameAt = document.timeline.currentTime;
        return original.call(this, value, ...args);
      };
    });
    let sequence = 0;
    const song = { key: `pause-${mode}`, title: '暂停同步验证', artist: '模拟播放器', cover: '', source: 'isolated-fixture',
      sessionId: `pause-session-${mode}`, position: 36.3, duration: 60, rate: 1, playing: false, hasTimeline: true,
      sources: [{ id: 'isolated-fixture', label: '模拟播放器' }], controls: { play: true, pause: true, toggle: true, previous: true, next: true } };
    const emit = (type, data) => page.evaluate(({ type, data }) => {
      window.__foliaPauseClock.hostAt = performance.now();
      window.__foliaEmit(type, data);
      return window.__foliaPauseClock.value;
    }, { type, data });
    const session = changes => emit('session', { ...song, ...changes, sequence: ++sequence });
    const clock = changes => emit('clock', { ...song, ...changes, sequence: ++sequence });
    await session({});
    await emit('lyrics', { key: song.key, title: song.title, artist: song.artist, content: lyrics, source: '隔离测试', cover: '', embedded: false, format: 'fia' });
    await page.locator('.waiting-screen').waitFor({ state: 'detached' });
    const scene = page.locator(mode === 'lumiere' ? '.desktop-stage canvas' : '.desktop-stage');
    await scene.waitFor({ timeout: 60000 });
    await page.mouse.move(400, 400);
    await page.waitForTimeout(1800);
    const capture = async name => {
      const bytes = await scene.screenshot({ style: screenshotStyle });
      await writeFile(`${output}/${mode}-${name}.png`, bytes); return bytes;
    };
    const word = page.locator('.desktop-stage span.relative.z-10.block').filter({ hasText: /^BEFORE\s*$/ }).locator('..');
    const opacity = () => word.evaluate(element => Number(getComputedStyle(element).opacity));

    // Slow but valid playback keeps the last sampled frame below 36.34 while the final pause anchor is 36.38.
    await session({ playing: true, position: 36.3, rate: 0.0001 });
    await page.waitForTimeout(800);
    const before = await capture('01-before-pause');
    const beforeTime = await page.evaluate(() => window.__foliaPauseClock.value);
    assert(beforeTime >= 36.3 && beforeTime < 36.31);
    if (mode === 'classic') assert.equal(await opacity(), 1, 'classic BEFORE is still active before the final 80 ms increment');
    const synchronousPauseTime = await session({ playing: false, position: 36.38 });
    assert.equal(synchronousPauseTime, 36.38, `${mode}: the final host time publishes before the session event returns`);
    await page.waitForTimeout(1100);
    const paused = await capture('02-final-pause-frame');
    assert(!before.equals(paused), `${mode}: the tiny final position change must reach the rendered scene`);
    if (mode === 'classic') assert(Math.abs(await opacity() - .82) < .000001, 'classic BEFORE becomes passed at the final pause anchor');
    await page.waitForTimeout(450);
    const frozen = await capture('03-paused-stable');
    assert.equal(await page.evaluate(() => window.__foliaPauseClock.value), 36.38);
    if (mode === 'lumiere') assert(paused.equals(frozen), 'paused Lumiere canvas pixels must be identical');
    else assert(Math.abs(await opacity() - .82) < .000001, 'classic word state stays passed while its original decorative breathing continues');
    checks.push(`${mode}: 80 ms final pause increment updates the real scene synchronously and then freezes the lyric clock`);

    assert.equal(await clock({ position: 36.2 }), 36.2, `${mode}: paused backward seek publishes immediately`);
    await page.waitForTimeout(1100);
    const backward = await capture('04-paused-seek-backward');
    assert(!backward.equals(paused), `${mode}: backward seek repaints while paused`);
    if (mode === 'classic') assert.equal(await opacity(), 1, 'classic backward seek returns BEFORE to active');
    assert.equal(await clock({ position: 36.8 }), 36.8, `${mode}: paused forward seek publishes immediately`);
    await page.waitForTimeout(1100);
    const forward = await capture('05-paused-seek-forward');
    assert(!forward.equals(backward), `${mode}: forward seek repaints while paused`);
    await page.waitForTimeout(350);
    const forwardFrozen = await capture('06-paused-seek-stable');
    if (mode === 'lumiere') assert(forward.equals(forwardFrozen), 'Lumiere re-freezes after a paused seek');
    else assert(Math.abs(await opacity() - .82) < .000001, 'classic forward seek settles back to passed');
    checks.push(`${mode}: backward and forward seeks repaint a paused scene and retain the new stable clock`);

    // A delayed earlier playing packet must not restart the clock after the newer paused seek.
    const staleTime = await emit('clock', { ...song, playing: true, position: 5, sequence: sequence - 1 });
    assert.equal(staleTime, 36.8);
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.__foliaPauseClock.value), 36.8);
    const resumed = await session({ playing: true, position: 36.8 });
    assert(resumed >= 36.8 && resumed < 36.81);
    const resumeAnchor = await page.evaluate(() => window.__foliaPauseClock.hostAt);
    await page.waitForTimeout(550);
    await page.waitForFunction(() => window.__foliaPauseClock.value > 37.1);
    const resumeSample = await page.evaluate(() => ({ ...window.__foliaPauseClock }));
    const resumedTime = resumeSample.value;
    // RAF timestamps track actual browser time even when software rendering delays a nominal 550 ms wait.
    const expectedResumeTime = 36.8 + Math.min(2, Math.max(0, resumeSample.frameAt - resumeAnchor) / 1000);
    assert(Math.abs(resumedTime - expectedResumeTime) < .05,
      `${mode}: resume advances only from the accepted anchor (actual ${resumedTime}, expected ${expectedResumeTime})`);
    const running = await capture('07-resumed');
    assert(!running.equals(forward), `${mode}: resumed renderer displays new frames`);
    const finalPosition = await page.evaluate(() => window.__foliaPauseClock.value);
    assert.equal(await session({ playing: false, position: finalPosition }), finalPosition);
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.__foliaPauseClock.value), finalPosition);
    await capture('08-paused-after-resume');
    checks.push(`${mode}: delayed old packets are rejected; resume progresses from the accepted anchor and can pause again`);
    samples.push({ mode, beforeTime, synchronousPauseTime, finalStep: 36.38 - beforeTime, pausedPixelStable: mode === 'lumiere' ? paused.equals(frozen) : null,
      classicNote: mode === 'classic' ? 'Original decorative breathing remains enabled; clock and word status are stable.' : undefined,
      resumedTime, expectedResumeTime, resumeElapsedMs: resumeSample.frameAt - resumeAnchor, finalPosition });
    await page.close();
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(`PASS desktop pause: ${checks.length} checks`);
} finally {
  await writeFile(`${output}/desktop-pause-results.json`, JSON.stringify({ checks, samples, errors }, null, 2));
  await browser?.close(); await server?.close();
}
