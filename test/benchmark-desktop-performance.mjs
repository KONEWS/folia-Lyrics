import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir, stat, copyFile, link } from 'node:fs/promises';
import { resolve, extname, dirname, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { installDesktopBridgeMock } from './desktop-bridge-mock.mjs';

// test/benchmark-desktop-performance.mjs — loopback HTTP, observable production commits and renderer-main-thread metrics.
const label = process.env.FOLIA_BENCH_LABEL || 'baseline';
const source = resolve(process.env.FOLIA_BENCH_DIST || 'dist-desktop');
const output = resolve('validation/performance');
const runs = Number(process.env.FOLIA_BENCH_RUNS || 5);
assert(Number.isInteger(runs) && runs >= 5, 'at least five paired trials are required');
await mkdir(output, { recursive: true });
const inventory = [];
// Preserve compiled resources only. Large fonts/images use hard links rather than duplicating their data.
async function collect(directory, archive = null) {
  for (const name of await readdir(directory)) {
    const absolute = resolve(directory, name), details = await stat(absolute);
    if (details.isDirectory()) { await collect(absolute, archive); continue; }
    const path = relative(source, absolute).split(sep).join('/'), extension = extname(name);
    const bytes = await readFile(absolute), record = { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    if (['.js', '.css', '.html'].includes(extension)) record.gzipBytes = gzipSync(bytes).length;
    if (archive) {
      const destination = resolve(archive, path); await mkdir(dirname(destination), { recursive: true });
      let previous = null;
      try { previous = await readFile(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (previous) {
        assert.equal(createHash('sha256').update(previous).digest('hex'), record.sha256, `existing baseline differs: ${path}; preserve the original archive`);
        record.archive = 'existing-verified';
      } else if (['.otf', '.woff2', '.png'].includes(extension)) { await link(absolute, destination); record.archive = 'hard-link'; }
      else { await copyFile(absolute, destination); record.archive = 'copy'; }
    }
    inventory.push(record);
  }
}
const archive = label === 'baseline' ? resolve(output, 'baseline-dist') : null;
await collect(source, archive);
const serving = archive || source;
const html = await readFile(resolve(serving, 'desktop.html'), 'utf8');
const entryPath = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/)?.[1];
assert(entryPath, 'compiled desktop module entry must exist');
const disk = { files: inventory.length, totalBytes: inventory.reduce((sum, file) => sum + file.bytes, 0),
  jsBytes: inventory.filter(file => file.path.endsWith('.js')).reduce((sum, file) => sum + file.bytes, 0),
  cssBytes: inventory.filter(file => file.path.endsWith('.css')).reduce((sum, file) => sum + file.bytes, 0),
  modulepreloadCount: (html.match(/rel="modulepreload"/g) || []).length,
  entry: inventory.find(file => '/' + file.path === entryPath), filesList: inventory };
await writeFile(resolve(output, `${label}-resources.json`), JSON.stringify(disk, null, 2));
const mimes = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png',
  '.svg':'image/svg+xml', '.otf':'font/otf', '.woff2':'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    const path = resolve(serving, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (!path.startsWith(serving + sep)) throw Error('invalid resource path');
    const data = await readFile(path);
    response.writeHead(200, { 'Content-Type': mimes[extname(path)] || 'application/octet-stream', 'Content-Length': data.length,
      'Cache-Control': path.endsWith('.html') ? 'no-store' : 'public, max-age=3600, immutable' }); response.end(data);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.FOLIA_CHROMIUM_PATH, headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox'] });
const errors = [], externalRequests = [], results = [];
const song = { key: 'benchmark', title: '性能基准歌曲', artist: '测试播放器', cover: '', source: 'Benchmark player',
  playing: false, position: 36, duration: 300, rate: 1, hasTimeline: true, sessionId: 'benchmark-session',
  sources: [{ id: 'Benchmark player', label: 'Benchmark player' }], controls: { play: true, pause: true, toggle: true, previous: true, next: true } };
const timestamp = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.00`;
const packet = { key: song.key, title: song.title, artist: song.artist, cover: '', source: '性能测试包', embedded: false, format: 'lrc',
  content: Array.from({ length: 120 }, (_, index) => `[${timestamp(index * 2 + 1)}]性能基准第${index + 1}行`).join('\n'),
  translation: Array.from({ length: 120 }, (_, index) => `[${timestamp(index * 2 + 1)}]性能基准译文 ${index}`).join('\n') };
const preferences = { autoImmersive: false, immersiveDelay: 30, audioReactive: false, coverTheme: false };
const metrics = async cdp => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
const delta = (before, after) => ({ taskMs: (after.TaskDuration - before.TaskDuration) * 1000,
  scriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000, layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
  styleMs: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000,
  heapBefore: before.JSHeapUsedSize, heapAfter: after.JSHeapUsedSize });
async function phase(page, cdp, burst = false) {
  const before = await metrics(cdp), commits = await page.evaluate(() => window.__foliaBench.commits);
  const elapsedMs = await page.evaluate(async ({ burst, song, packet, preferences }) => {
    const started = performance.now();
    if (burst) {
      for (let index = 0; index < 100; index++) {
        window.__foliaEmit('session', structuredClone(song));
        window.__foliaEmit('preferences', { ...window.__foliaMockPreferences(), ...preferences });
        window.__foliaEmit('lyrics', structuredClone(packet));
        await new Promise(done => setTimeout(done, 10));
      }
      await new Promise(done => setTimeout(done, 150));
    } else await new Promise(done => setTimeout(done, 5000));
    return performance.now() - started;
  }, { burst, song, packet, preferences });
  const after = await metrics(cdp);
  return { elapsedMs, commits: await page.evaluate(() => window.__foliaBench.commits) - commits, ...delta(before, after) };
}
async function startup(page) {
  await page.goto(`${origin}/desktop.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__foliaReadyAt !== null && window.__foliaBench.welcomeAt !== null);
  const result = await page.evaluate(() => ({ readyMs: window.__foliaReadyAt, welcomeMs: window.__foliaBench.welcomeAt,
    injected: window.__foliaBench.injected, commits: window.__foliaBench.commits,
    resources: performance.getEntriesByType('resource').map(entry => ({ name: new URL(entry.name).pathname, duration: entry.duration,
      transferBytes: entry.transferSize, encodedBytes: entry.encodedBodySize, decodedBytes: entry.decodedBodySize })) }));
  assert(result.injected && result.commits > 0, 'production React commit probe must be active, otherwise zero counts would be misleading');
  return result;
}
async function lyricReady(page) {
  await page.evaluate(({ song, packet, preferences }) => {
    window.__foliaEmit('preferences', preferences); window.__foliaBench.packetAt = performance.now();
    window.__foliaEmit('session', song); window.__foliaEmit('lyrics', packet);
  }, { song, packet, preferences });
  await page.waitForFunction(() => window.__foliaBench.lyricAt !== null);
  return page.evaluate(() => ({ packetToMatchingTranslationMs: window.__foliaBench.lyricAt - window.__foliaBench.packetAt,
    packetToWaitingRemovedMs: window.__foliaBench.stageAt - window.__foliaBench.packetAt }));
}
try {
  for (let index = 0; index < runs; index++) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage(), cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    await installDesktopBridgeMock(page);
    await page.addInitScript(() => {
      localStorage.setItem('folia.desktop.mode.v1', 'classic');
      sessionStorage.setItem('folia.test.mockPreferences', JSON.stringify({ autoImmersive: false, audioReactive: false, coverTheme: false }));
      const probe = window.__foliaBench = { commits: 0, injected: false, welcomeAt: null, packetAt: null, stageAt: null, lyricAt: null };
      // Count observable production root commits, rather than claiming to count every attempted component render.
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(),
        inject(renderer) { this.renderers.set(1, renderer); probe.injected = true; return 1; }, checkDCE() {},
        onCommitFiberRoot() { probe.commits++; }, onCommitFiberUnmount() {}, onScheduleFiberRoot() {} };
      new MutationObserver(() => {
        if (probe.welcomeAt === null && document.querySelector('.waiting-screen h1')) probe.welcomeAt = performance.now();
        if (probe.packetAt !== null && probe.stageAt === null && !document.querySelector('.waiting-screen')) probe.stageAt = performance.now();
        const translation = document.querySelector('[data-font-debug-target="visualizer-translation"]');
        if (probe.packetAt !== null && probe.lyricAt === null && translation?.textContent.includes('性能基准译文 17')) probe.lyricAt = performance.now();
      }).observe(document, { subtree: true, childList: true, characterData: true });
    });
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { const url = new URL(request.url()); if (!['data:', 'blob:'].includes(url.protocol) && url.origin !== origin) externalRequests.push(request.url()); });
    const cold = await startup(page);
    const waiting = await phase(page, cdp);
    const coldLyrics = await lyricReady(page);
    await page.evaluate(() => new Promise(done => setTimeout(done, 350)));
    const paused = await phase(page, cdp), duplicates = await phase(page, cdp, true);
    assert(await page.locator('.desktop-stage').innerText(), 'duplicate messages retain a usable lyric stage');
    const priorCommits = await page.evaluate(() => window.__foliaBench.commits);
    await page.evaluate(song => window.__foliaEmit('session', { ...song, title: '真实字段变化应更新' }), song);
    await page.waitForFunction(() => document.querySelector('.track-caption strong')?.textContent === '真实字段变化应更新');
    assert(await page.evaluate(() => window.__foliaBench.commits) > priorCommits, 'real field changes must still commit');
    const warm = await startup(page), warmLyrics = await lyricReady(page);
    results.push({ trial: index + 1, cold, coldLyrics, waiting, paused, duplicates, warm, warmLyrics });
    console.log(`PASS ${label} trial ${index + 1}/${runs}: cold ready ${cold.readyMs.toFixed(1)}ms; warm ${warm.readyMs.toFixed(1)}ms; duplicate commits ${duplicates.commits}`);
    await context.close();
  }
  assert.equal(errors.length, 0, errors.join('\n')); assert.equal(externalRequests.length, 0, 'the benchmark must not use external network');
  const summary = {};
  const series = { coldReadyMs: row => row.cold.readyMs, warmReadyMs: row => row.warm.readyMs,
    coldWelcomeMs: row => row.cold.welcomeMs, warmWelcomeMs: row => row.warm.welcomeMs,
    coldLyricMs: row => row.coldLyrics.packetToMatchingTranslationMs, warmLyricMs: row => row.warmLyrics.packetToMatchingTranslationMs,
    waitingTaskMs: row => row.waiting.taskMs, waitingScriptMs: row => row.waiting.scriptMs,
    pausedTaskMs: row => row.paused.taskMs, pausedScriptMs: row => row.paused.scriptMs,
    duplicateCommits: row => row.duplicates.commits, duplicateTaskMs: row => row.duplicates.taskMs, duplicateScriptMs: row => row.duplicates.scriptMs };
  for (const [name, value] of Object.entries(series)) {
    const values = results.map(value).sort((a, b) => a - b); summary[name] = { median: values[Math.floor(values.length / 2)], min: values[0], max: values.at(-1), samples: values };
  }
  const report = { label, browserVersion: browser.version(), executable: process.env.FOLIA_CHROMIUM_PATH || 'Playwright bundled Chromium',
    conditions: { runs, viewport: '1280x800 @ 1', renderer: 'classic', paused: true, audioReactive: false,
      audioReactiveScope: 'disabled explicitly before lyrics, paused and duplicate phases; initial waiting uses mock ready defaults with no spectrum packet', autoImmersive: false,
      cold: 'new incognito context with empty HTTP cache; the browser process and OS disk cache may already be warm',
      warm: 'same context reload using immutable assets and no-store HTML', serving: 'uncompressed loopback HTTP; no external network',
      quietWindowMs: 5000, duplicatePackets: '100 freshly cloned equal session + preferences + lyrics triples at 10ms intervals' },
    limits: ['This is a software-WebGL browser benchmark, not real Windows EXE startup or internet throughput.',
      'Packet-to-translation includes parser, lazy module/worker loading, renderer mounting and observer scheduling; it is not isolated parse CPU time.',
      'CDP task/script durations describe the renderer main thread and do not include worker parsing, native host, GPU or whole-process CPU.',
      'Heap samples are not forced-GC retained memory; root commits are observable commits, not every component render attempt.',
      '100 packet triples are a stress probe, not the native host polling frequency; startup instrumentation is identical before/after.'],
    disk: { ...disk, filesList: undefined }, summary, results, errors, externalRequests };
  await writeFile(resolve(output, `${label}-benchmark.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ label, summary }, null, 2));
} finally { await browser.close(); await new Promise(done => server.close(done)); }
