import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installDesktopBridgeMock } from './desktop-bridge-mock.mjs';
import { installDesktopParserProbe } from './verify-desktop-parser-formats.mjs';

// test/verify-desktop-switching.mjs — retain the real stage through asynchronous lyric replacement and reject stale Worker results.
const output = resolve(process.env.FOLIA_UI_OUTPUT || 'test-results/desktop-switching');
const checks = [], samples = [], errors = [], warnings = [];
let url = process.env.FOLIA_TEST_URL, server, browser;
await mkdir(output, { recursive: true });

// Only delay delivery to the production Worker's onmessage callback; parsing, requests and results remain real.
async function installSwitchProbe(page, mode) {
  await installDesktopParserProbe(page);
  await page.addInitScript(mode => {
    window.__foliaReadSwitchScene = () => window.__foliaReadResolvedVisualizerProps?.(mode);
    const ParserWorker = window.Worker;
    const gate = window.__foliaSwitchGate = { marker: '', ids: new Set(), pending: [],
      release() { this.marker = ''; this.ids.clear(); for (const deliver of this.pending.splice(0)) deliver(); } };
    window.Worker = class extends ParserWorker {
      get onmessage() { return this.switchListener ?? null; }
      set onmessage(listener) {
        this.switchListener = listener;
        super.onmessage = typeof listener === 'function' ? event => {
          const deliver = () => listener.call(this, event);
          if (gate.ids.has(event.data?.requestId)) gate.pending.push(deliver); else deliver();
        } : listener;
      }
      postMessage(...args) {
        const request = args[0];
        if (request?.type === 'parse' && gate.marker && request.content.includes(gate.marker)) gate.ids.add(request.requestId);
        super.postMessage(...args);
      }
    };
    window.__foliaBeginSwitchTrace = label => {
      const stage = document.querySelector('.desktop-stage'), shell = stage?.firstElementChild;
      const canvases = [...stage.querySelectorAll('canvas')], lines = window.__foliaReadSwitchScene?.()?.lines;
      const trace = window.__foliaSwitchTrace = { label, stage, shell, canvases, lines, started: performance.now(),
        frames: 0, waitingFrames: 0, emptyFrames: 0, waitingInsertions: 0, shellDetachments: 0, canvasDetachments: 0 };
      const observer = new MutationObserver(records => {
        for (const record of records) {
          for (const node of record.addedNodes) if (node instanceof Element && (node.matches('.waiting-screen') || node.querySelector('.waiting-screen'))) trace.waitingInsertions++;
          for (const node of record.removedNodes) {
            if (node === shell || node.contains(shell)) trace.shellDetachments++;
            for (const canvas of canvases) if (node === canvas || node.contains(canvas)) trace.canvasDetachments++;
          }
        }
      });
      observer.observe(stage, { childList: true, subtree: true });
      let frame;
      const sample = () => {
        trace.frames++;
        if (stage.querySelector('.waiting-screen')) trace.waitingFrames++;
        if (!stage.firstElementChild) trace.emptyFrames++;
        frame = requestAnimationFrame(sample);
      };
      frame = requestAnimationFrame(sample);
      trace.finish = () => {
        observer.disconnect(); cancelAnimationFrame(frame);
        return { label, elapsedMs: performance.now() - trace.started, frames: trace.frames, waitingFrames: trace.waitingFrames,
          emptyFrames: trace.emptyFrames, waitingInsertions: trace.waitingInsertions, shellDetachments: trace.shellDetachments,
          canvasDetachments: trace.canvasDetachments, initialCanvases: canvases.length,
          retainedCanvases: canvases.filter(canvas => canvas.isConnected && stage.contains(canvas)).length,
          sameShell: stage.firstElementChild === shell, sameLines: window.__foliaReadSwitchScene?.()?.lines === lines };
      };
    };
  }, mode);
}

try {
  if (!url) {
    server = await createServer({ configFile: resolve('vite.desktop.config.ts'), server: { host: '127.0.0.1', port: 0, hmr: false,
      watch: { ignored: ['**/obj/**', '**/bin/**', '**/release/**'] } } });
    await server.listen(); url = `http://127.0.0.1:${server.httpServer.address().port}/desktop.html`;
  }
  const origin = new URL(url).origin;
  browser = await chromium.launch({ executablePath: process.env.FOLIA_CHROMIUM_PATH, headless: true,
    args: ['--no-proxy-server', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox'] });
  for (const mode of ['classic', 'lumiere']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    // Install before React/Motion/Pixi capture timers; only the final font handover pauses this clock.
    await page.clock.install();
    page.on('pageerror', error => errors.push(`${mode}: ${error}`));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(`${mode}: ${message.text()}`);
      if (message.type() === 'warning') warnings.push(`${mode}: ${message.text()}`);
    });
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.addInitScript(mode => {
      localStorage.clear(); localStorage.setItem('folia.desktop.mode.v1', mode);
      sessionStorage.setItem('folia.test.mockPreferences', JSON.stringify({ autoImmersive: false, audioReactive: false, coverTheme: false }));
    }, mode);
    await installDesktopBridgeMock(page); await installSwitchProbe(page, mode);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__foliaReadyAt !== null);
    let sequence = 0;
    const song = { key: `switch-${mode}`, title: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789', artist: 'PLAYER',
      cover: '', source: 'Player A', sessionId: `session-${mode}`, position: 3, duration: 60, playing: false, rate: 1,
      hasTimeline: true, sources: [{ id: 'Player A', label: 'Player A' }, { id: 'Player B', label: 'Player B' }] };
    const packet = (first, changes = {}) => ({ key: song.key, title: song.title, artist: song.artist, cover: '', source: 'Initial source', embedded: false,
      format: 'yrc', content: `[1000,8000](1000,4000,0)${first} (5000,4000,0)CURRENT\n[10000,10000](10000,10000,0)NEXT LINE`,
      translation: '[00:01.000]CURRENT TRANSLATION\n[00:10.000]NEXT TRANSLATION', ...changes });
    const emit = (type, data) => page.evaluate(({ type, data }) => window.__foliaEmit(type, data), { type, data });
    const session = changes => emit('session', { ...song, ...changes, sequence: ++sequence });
    const requests = () => page.evaluate(() => window.__foliaParserProbe.requests.length);
    const waitText = text => page.waitForFunction(text => window.__foliaReadSwitchScene?.()?.lines[0]?.fullText === text, text);
    const begin = label => page.evaluate(label => window.__foliaBeginSwitchTrace(label), `${mode}: ${label}`);
    const finish = async (expectedStable = true) => {
      const sample = await page.evaluate(() => window.__foliaSwitchTrace.finish()); samples.push(sample);
      if (expectedStable) {
        assert.equal(sample.waitingFrames, 0, `${sample.label}: no waiting page frames`);
        assert.equal(sample.emptyFrames, 0, `${sample.label}: no empty stage frames`);
        assert.equal(sample.waitingInsertions, 0, `${sample.label}: no transient waiting page insertion`);
        assert.equal(sample.shellDetachments, 0, `${sample.label}: original renderer shell never detaches`);
        assert.equal(sample.canvasDetachments, 0, `${sample.label}: original canvases never detach`);
        assert.equal(sample.sameShell, true, `${sample.label}: original renderer shell is retained`);
        assert.equal(sample.retainedCanvases, sample.initialCanvases, `${sample.label}: canvas identities remain stable`);
      }
      return sample;
    };
    await session({}); await emit('lyrics', packet('ALPHA'));
    await waitText('ALPHA CURRENT');
    await page.waitForFunction(() => document.querySelector('.desktop-stage')?.firstElementChild && !document.querySelector('.waiting-screen'));
    if (mode === 'lumiere') await page.locator('.desktop-stage canvas').first().waitFor({ timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);

    await begin('same-song replacement and queued duplicate');
    const replacement = packet('BRAVO'), beforeReplacement = await requests();
    await page.evaluate(() => { window.__foliaSwitchGate.marker = 'BRAVO'; });
    await emit('lyrics', replacement);
    await page.waitForFunction(() => window.__foliaSwitchGate.pending.length === 1);
    await page.waitForTimeout(110);
    assert.equal(await page.evaluate(() => window.__foliaReadSwitchScene?.()?.lines === window.__foliaSwitchTrace.lines), true,
      `${mode}: last valid lyrics stay on screen while the real Worker reply is held`);
    for (let duplicate = 0; duplicate < 3; duplicate++) await emit('lyrics', replacement);
    assert.equal(await requests() - beforeReplacement, 1, `${mode}: queued duplicates share one actual Worker parse`);
    await page.evaluate(() => window.__foliaSwitchGate.release()); await waitText('BRAVO CURRENT');
    await page.waitForTimeout(100);
    const replacementSample = await finish(); replacementSample.workerParses = await requests() - beforeReplacement;
    assert.equal(replacementSample.sameLines, false, `${mode}: valid replacement reaches the real renderer`);
    checks.push(`${mode}: asynchronous replacement preserves the visible renderer, and queued duplicates parse once`);

    await begin('cached-font metadata update');
    const beforeMetadata = await requests();
    await session({ title: '', artist: '' });
    await emit('lyrics', { ...replacement, title: 'RENAMED TITLE', artist: 'RENAMED ARTIST', source: 'Renamed source' });
    await page.waitForFunction(() => window.__foliaReadSwitchScene?.()?.songTitle === 'RENAMED TITLE');
    await page.waitForTimeout(110);
    const metadataSample = await finish(); metadataSample.workerParses = await requests() - beforeMetadata;
    assert.equal(metadataSample.sameLines, true, `${mode}: descriptive metadata preserves parsed line identity`);
    assert.equal(metadataSample.workerParses, 0, `${mode}: descriptive metadata performs no Worker parse`);
    checks.push(`${mode}: metadata and already loaded fonts update without recreating lyrics, shell or canvas`);

    await begin('malformed replacement');
    await emit('lyrics', packet('INVALID', { content: '[ti:INVALID]', translation: '' }));
    await page.waitForFunction(() => document.querySelector('.desktop-notice')?.textContent.includes('未找到时间轴歌词'));
    await page.waitForTimeout(110);
    assert.equal(await page.evaluate(() => window.__foliaReadSwitchScene?.()?.lines[0]?.fullText), 'BRAVO CURRENT');
    const invalidSample = await finish();
    assert.equal(invalidSample.sameLines, true, `${mode}: malformed replacement retains the last valid line objects`);
    checks.push(`${mode}: malformed replacement reports its error and keeps the last valid scene`);

    await begin('late old parse after switching player and song');
    const beforeLate = await requests(), late = packet('LATE ORIGINAL');
    await page.evaluate(() => { window.__foliaSwitchGate.marker = 'LATE ORIGINAL'; });
    await emit('lyrics', late); await page.waitForFunction(() => window.__foliaSwitchGate.pending.length === 1);
    const nextSong = { ...song, key: `next-${mode}`, title: 'NEW SONG', source: 'Player B', sessionId: `new-session-${mode}`, position: 3 };
    await emit('session', { ...nextSong, sequence: ++sequence });
    await emit('lyrics', { ...replacement, key: nextSong.key, title: nextSong.title, format: 'lrc',
      content: '[00:01.000]NEW SONG CURRENT\n[00:10.000]NEXT LINE', translation: '' });
    await waitText('NEW SONG CURRENT');
    if (mode === 'lumiere') await page.locator('.desktop-stage canvas').first().waitFor({ timeout: 30000 });
    await page.evaluate(() => window.__foliaSwitchGate.release());
    await page.waitForTimeout(130);
    assert.equal(await page.evaluate(() => window.__foliaReadSwitchScene?.()?.lines[0]?.fullText), 'NEW SONG CURRENT');
    assert.equal(await requests() - beforeLate, 1, `${mode}: stale old Worker parse was genuinely in flight`);
    await emit('lyrics', late); await page.waitForTimeout(50);
    assert.equal(await requests() - beforeLate, 1, `${mode}: packets for an old key do not start additional parsing`);
    const lateSample = await finish(); lateSample.workerParses = await requests() - beforeLate;
    checks.push(`${mode}: fast new-player handover keeps the renderer while late old Worker results cannot overwrite new lyrics`);

    await begin('slow new-player handover releases the old scene');
    const oldTime = await page.evaluate(() => window.__foliaReadSwitchScene().currentTime.get());
    const slow = { ...nextSong, key: `slow-${mode}`, title: 'SLOW SONG', sessionId: `slow-session-${mode}`, position: 43 };
    await page.evaluate(() => { window.__foliaSwitchGate.marker = 'SLOW'; });
    await emit('session', { ...slow, sequence: ++sequence });
    await emit('lyrics', packet('SLOW', { key: slow.key, title: slow.title }));
    await page.waitForFunction(() => window.__foliaSwitchGate.pending.length === 1);
    await emit('clock', { ...slow, playing: true, sequence: ++sequence });
    assert.equal(await page.evaluate(() => window.__foliaReadSwitchScene()?.currentTime.get()), oldTime,
      `${mode}: outgoing scene never advances to the incoming player's time`);
    assert.equal(await page.evaluate(() => window.__foliaReadSwitchScene()?.paused), true);
    await page.locator('.desktop-stage .waiting-screen').waitFor({ timeout: 3000 });
    const slowSample = await finish(false);
    assert.equal(slowSample.shellDetachments, 1, `${mode}: slow matching releases the old renderer once`);
    assert.equal(slowSample.retainedCanvases, 0);
    await page.evaluate(() => window.__foliaSwitchGate.release()); await waitText('SLOW CURRENT');
    if (mode === 'lumiere') await page.locator('.desktop-stage canvas').first().waitFor({ timeout: 30000 });
    checks.push(`${mode}: slow matching freezes the outgoing song, releases its renderer after the grace period, and resumes on the current lyrics`);

    await emit('clock', { ...slow, playing: false, sequence: ++sequence });
    const frozenFontTime = await page.evaluate(() => window.__foliaReadSwitchScene().currentTime.get());
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    const handoverMs = await page.evaluate(async () => (await import('/src/desktopLyrics/DesktopStage.tsx')).DESKTOP_HANDOVER_MS);
    await begin('delayed-font handover');
    let releaseFont;
    const delayedFont = new Promise(done => { releaseFont = done; });
    await page.route('**/fonts/noto-serif-sc-400.woff2?switch-held-font', async route => { await delayedFont; await route.continue(); });
    try {
      const fontRequest = page.waitForRequest(request => request.url().endsWith('/fonts/noto-serif-sc-400.woff2?switch-held-font'));
      await page.evaluate(async () => {
        const { useTypographySettingsStore } = await import('/src/stores/useTypographySettingsStore.ts');
        document.fonts.add(new FontFace('SwitchHeldFont', 'url("/fonts/noto-serif-sc-400.woff2?switch-held-font")'));
        useTypographySettingsStore.getState().handleSetLyricsCustomFont({ source: 'system', family: 'SwitchHeldFont', label: 'Switch fixture' });
      });
      const fontSong = { ...slow, key: `font-${mode}`, title: 'FONT SONG', position: 7, sessionId: `font-${mode}` };
      await emit('session', { ...fontSong, sequence: ++sequence });
      await emit('lyrics', packet('FONT', { key: fontSong.key, title: fontSong.title, format: 'lrc',
        content: '[00:01.000]FONT CURRENT\n[00:10.000]NEXT LINE' }));
      await fontRequest;
      assert.equal(await page.evaluate(() => document.fonts.status), 'loading');
      // GPU work and automation round trips cannot consume the grace period. The real host timer
      // must retain its frozen scene right up to the deadline, then release its renderer once.
      await page.clock.runFor(handoverMs - 1);
      const scene = await page.evaluate(() => { const props = window.__foliaReadSwitchScene(), trace = window.__foliaSwitchTrace;
        return props ? { time: props.currentTime.get(), paused: props.paused, text: props.lines[0]?.fullText,
          sameLines: props.lines === trace.lines, sameShell: trace.stage.firstElementChild === trace.shell } : null; });
      assert(scene, `${mode}: the outgoing scene stays mounted throughout the handover grace period`);
      assert.equal(scene.time, frozenFontTime); assert.equal(scene.paused, true); assert.equal(scene.text, 'SLOW CURRENT');
      assert.equal(scene.sameLines, true); assert.equal(scene.sameShell, true);
      try {
        await page.clock.runFor(1);
        await page.locator('.desktop-stage > *').waitFor({ state: 'detached', timeout: 3000 });
      } catch (error) {
        const diagnostic = await page.evaluate(() => {
          const props = window.__foliaReadSwitchScene();
          return { stage: document.querySelector('.desktop-stage')?.innerHTML, fonts: [...document.fonts].map(font => ({ family: font.family, status: font.status })),
            scene: props && { time: props.currentTime.get(), paused: props.paused, text: props.lines[0]?.fullText, theme: props.theme },
            status: document.fonts.status, caption: document.querySelector('.track-caption')?.textContent };
        });
        await writeFile(`${output}/${mode}-font-handover-failure.json`, JSON.stringify(diagnostic, null, 2));
        throw error;
      }
      const fontSample = await finish(false);
      assert.equal(fontSample.shellDetachments, 1, `${mode}: font handover releases the outgoing renderer once at the deadline`);
      assert.equal(fontSample.retainedCanvases, 0);
      releaseFont(); await page.clock.resume(); await waitText('FONT CURRENT');
      await page.waitForFunction(() => window.__foliaReadSwitchScene()?.currentTime.get() === 7);
      checks.push(`${mode}: delayed fonts never expose the incoming clock to the outgoing scene, and the new paused scene commits at its real time`);
    } finally { releaseFont(); await page.clock.resume(); }
    await page.screenshot({ path: `${output}/${mode}-after-switching.png` });
    await page.close();
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(`PASS desktop switching: ${checks.length} checks, ${samples.length} observed stage traces`);
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ checks, samples, errors, warnings,
    limits: 'Real browser UI and parser Worker with isolated host messages. Worker delivery is held for 110 ms in replacement checks. Classic lyrics use DOM; only Lumiere requires a live lyric canvas. Trace counts detect observed DOM/RAF gaps, not GPU frame presentation or whole-process CPU.' }, null, 2));
  await browser?.close(); await server?.close();
}
