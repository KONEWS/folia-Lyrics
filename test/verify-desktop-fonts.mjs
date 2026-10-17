import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installDesktopBridgeMock } from './desktop-bridge-mock.mjs';

// test/verify-desktop-fonts.mjs — real font requests and classic canvas measurements under delayed fonts and paused typography changes.
const output = resolve(process.env.FOLIA_UI_OUTPUT || 'test-results/desktop-fonts');
await mkdir(output, { recursive: true });
const checks = [], samples = [], errors = [];
let server, browser, page;
const content = JSON.stringify({ format: 'folia-lyricdata', version: 1, song: {}, lyrics: { isWordByWord: true,
  lines: [{ startTime: 1, endTime: 30, fullText: 'FONTREADY', words: [{ text: 'FONTREADY', startTime: 1, endTime: 30 }] },
    { startTime: 40, endTime: 55, fullText: 'NEXT', words: [{ text: 'NEXT', startTime: 40, endTime: 55 }] }] } });
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

// Observe the real browser APIs; the fixture delays IO but never replaces renderer layout or timing calculations.
async function open(url, style) {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(String(error)));
  await installDesktopBridgeMock(page);
  await page.addInitScript(style => {
    localStorage.setItem('folia.desktop.mode.v1', 'classic'); localStorage.setItem('lyrics_font_style', style);
    sessionStorage.setItem('folia.test.mockPreferences', JSON.stringify({ autoImmersive: false, audioReactive: false }));
    // Linux CI lacks the Windows toolbar fonts: isolate chrome fallback traffic without overriding any renderer font.
    const chromeStyle = document.createElement('style'); chromeStyle.textContent = 'body{font-family:sans-serif!important}';
    if (document.head) document.head.append(chromeStyle);
    else {
      const observer = new MutationObserver(() => { if (document.head) { document.head.append(chromeStyle); observer.disconnect(); } });
      observer.observe(document, { childList: true, subtree: true });
    }
    const probe = window.__fontProbe = { requests: [], measures: [], uploadWaiting: false, started: 0 };
    const load = FontFaceSet.prototype.load;
    FontFaceSet.prototype.load = function (font, text) { probe.requests.push({ font, text, at: performance.now() }); return load.call(this, font, text); };
    const measure = CanvasRenderingContext2D.prototype.measureText;
    CanvasRenderingContext2D.prototype.measureText = function (text) {
      const result = measure.call(this, text);
      if (String(text).includes('FONTREADY')) probe.measures.push({ font: this.font, width: result.width,
        ready: document.fonts.check(this.font, text), at: performance.now() });
      return result;
    };
    const faceLoad = FontFace.prototype.load, heldUploads = new WeakSet();
    FontFace.prototype.load = function () {
      if (this.family === 'UploadedFontFixture' && !heldUploads.has(this)) {
        heldUploads.add(this);
        probe.uploadWaiting = true;
        return new Promise(done => { window.__releaseUpload = done; }).then(() => faceLoad.call(this));
      }
      return faceLoad.call(this);
    };
  }, style);
  return page;
}
async function connect(url) {
  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForFunction(() => typeof window.__foliaReadyAt === 'number');
  assert(await page.locator('.desktop-statusbar').isVisible());
  await page.evaluate(async () => {
    const { getVisualizerRegistryEntry } = await import('/src/components/visualizer/registry.tsx');
    const entry = getVisualizerRegistryEntry('classic'), render = entry.render;
    entry.render = props => { window.__fontProbe.paused = props.paused; window.__fontProbe.time = props.currentTime.get(); return render(props); };
  });
}
async function lyrics() {
  await page.evaluate(content => {
    const song = { key: 'font-test', title: 'Font test', artist: 'Fixture', cover: '', source: 'font-fixture', sources: [],
      sessionId: 'font-session', sequence: 1, playing: false, position: 10, duration: 60, rate: 1, hasTimeline: true,
      controls: { play: true, pause: true, toggle: true, previous: true, next: true } };
    window.__fontProbe.started = performance.now();
    window.__foliaEmit('session', song);
    window.__foliaEmit('lyrics', { key: song.key, title: song.title, artist: song.artist, cover: '', source: 'font-fixture',
      content, format: 'fia', embedded: false });
  }, content);
  await page.locator('.desktop-stage .waiting-screen').waitFor({ state: 'detached' });
}
const rendered = () => page.waitForFunction(() => document.querySelector('.desktop-stage')?.textContent.includes('FONTREADY'));
const probe = () => page.evaluate(() => structuredClone(window.__fontProbe));

try {
  let url = process.env.FOLIA_TEST_URL;
  if (!url) {
    server = await createServer({ configFile: resolve('vite.desktop.config.ts'), server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
    await server.listen(); url = `http://127.0.0.1:${server.httpServer.address().port}/desktop.html`;
  }
  browser = await chromium.launch({ executablePath: process.env.FOLIA_CHROMIUM_PATH, headless: true,
    args: ['--no-proxy-server', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox'] });
  for (const style of ['mono', 'serif']) {
    await open(url, style);
    let defaultRequests = 0;
    await page.route('**/fonts/NotoSansCJKsc-Regular.otf', route => { defaultRequests++; return route.abort(); });
    await connect(url);
    assert.equal((await probe()).requests.length, 0, 'no lyrics means no explicit font loading');
    await lyrics(); await rendered();
    const observed = await probe();
    assert.equal(defaultRequests, 0, `${style} must not request the default sans font`);
    assert(observed.measures.length > 0 && observed.measures.every(sample => sample.ready));
    samples.push({ scenario: style, defaultSansRequests: defaultRequests, defaultSansEncodedBytes: await page.evaluate(() => performance.getEntriesByType('resource')
      .filter(entry => entry.name.includes('NotoSansCJKsc-Regular.otf')).reduce((total, entry) => total + entry.encodedBodySize, 0)),
      firstMeasureMs: observed.measures[0].at - observed.started, measuredFonts: [...new Set(observed.measures.map(sample => sample.font))] });
    checks.push(`${style}: idle controls connect without font loads; lyrics measure correctly with zero default Noto Sans requests`);
    await page.close();
  }

  await open(url, 'sans');
  const sans = deferred();
  await page.route('**/fonts/NotoSansCJKsc-Regular.otf', async route => { await sans.promise; await route.continue(); });
  try {
    await connect(url); await lyrics();
    await page.waitForFunction(() => document.fonts.status === 'loading');
    assert.equal((await probe()).measures.length, 0, 'selected font must load before classic measures text');
    assert.equal(await page.locator('.desktop-stage').innerText(), '');
    await page.getByRole('button', { name: '继续播放音乐', exact: true }).click();
    assert(await page.evaluate(() => window.__foliaCommands.some(command => command.type === 'mediaControl' && command.value.songKey === 'font-test')));
    sans.resolve(); await rendered();
    const before = await probe();
    assert(before.measures.length > 0 && before.measures.every(sample => sample.ready));
    checks.push('selected sans: measurement waits for its delayed font while native playback controls remain usable');

    // A new web-font family must be loaded and measured again even though the external player stays paused at 10 seconds.
    const replacement = deferred();
    await page.route('**/fonts/noto-serif-sc-400.woff2?font-gate-fixture', async route => { await replacement.promise; await route.continue(); });
    try {
      await page.evaluate(async () => {
        const { useTypographySettingsStore } = await import('/src/stores/useTypographySettingsStore.ts');
        document.fonts.add(new FontFace('ReplacementFontFixture', 'url("/fonts/noto-serif-sc-400.woff2?font-gate-fixture")'));
        window.__fontProbe.measures = [];
        useTypographySettingsStore.getState().handleSetLyricsFontStyle('mono');
        useTypographySettingsStore.getState().handleSetLyricsCustomFont({ source: 'system', family: 'ReplacementFontFixture', label: 'Replacement fixture' });
      });
      await page.waitForFunction(() => window.__fontProbe.requests.some(request => request.font.includes('ReplacementFontFixture')));
      assert.equal((await probe()).measures.length, 0);
      await page.waitForFunction(() => document.querySelector('.desktop-stage')?.textContent === '', null, { timeout: 3000 });
      replacement.resolve(); await rendered();
      const after = await probe();
      assert(after.measures.length > 0 && after.measures.every(sample => sample.ready && sample.font.includes('ReplacementFontFixture')));
      assert.equal(after.paused, true); assert.equal(after.time, 10);
      assert(Math.abs(after.measures[0].width - before.measures[0].width) > 1, 'the replacement causes a real font-dependent layout measurement');
      samples.push({ scenario: 'paused font change', oldWidth: before.measures[0].width, newWidth: after.measures[0].width,
        oldFont: before.measures[0].font, newFont: after.measures[0].font, time: after.time, paused: after.paused });
      await page.screenshot({ path: `${output}/paused-replacement.png` });
      checks.push('paused switch: no early measurements; the loaded replacement changes real text width without moving playback time');
    } finally { replacement.resolve(); }
  } finally { sans.resolve(); await page.close(); }

  await open(url, 'mono'); await connect(url);
  await page.evaluate(async () => {
    const [{ saveToCache }, { useTypographySettingsStore }] = await Promise.all([import('/src/services/db.ts'), import('/src/stores/useTypographySettingsStore.ts')]);
    const blob = await (await fetch('/fonts/noto-serif-sc-400.woff2')).blob();
    const meta = { source: 'uploaded', fontId: 'uploaded-fixture', family: 'UploadedFontFixture', label: 'Uploaded fixture' };
    await saveToCache('lyrics_uploaded_font', { id: meta.fontId, family: meta.family, label: meta.label, name: 'fixture.woff2', mimeType: 'font/woff2', blob, createdAt: Date.now() });
    useTypographySettingsStore.getState().handleSetLyricsCustomFont(meta);
  });
  await lyrics();
  await page.waitForFunction(() => window.__fontProbe.uploadWaiting);
  assert.equal((await probe()).measures.length, 0);
  assert.equal((await probe()).requests.length, 0, 'uploaded FontFace registration must precede CSS font preparation');
  await page.evaluate(() => window.__releaseUpload()); await rendered();
  const uploaded = await probe();
  assert(uploaded.measures.length > 0 && uploaded.measures.every(sample => sample.ready && sample.font.includes('UploadedFontFixture')));
  samples.push({ scenario: 'uploaded restore', font: uploaded.measures[0].font, measuredOnlyWhenReady: true });
  checks.push('uploaded font: IndexedDB restoration and real FontFace registration complete before any lyric measurement');
  await page.close();

  await open(url, 'mono'); await connect(url);
  await page.evaluate(async () => {
    const { useTypographySettingsStore } = await import('/src/stores/useTypographySettingsStore.ts');
    useTypographySettingsStore.getState().handleSetLyricsCustomFont({ source: 'uploaded', fontId: 'missing-font', family: 'MissingFontFixture', label: 'Missing fixture' });
  });
  await lyrics(); await rendered();
  assert.equal(await page.evaluate(() => localStorage.getItem('lyrics_custom_font')), null);
  assert(await page.locator('.desktop-notice').isVisible(), 'upload restoration failure reaches the desktop notice surface');
  checks.push('missing upload: invalid metadata is cleared, its notice is visible and fallback lyrics render');
  await page.close();

  await open(url, 'sans');
  await page.route('**/fonts/NotoSansCJKsc-Regular.otf', route => route.abort('failed'));
  await connect(url); await lyrics(); await rendered();
  checks.push('failed font: normal fallback still renders lyrics and leaves controls available');
  await page.close();
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(`PASS desktop fonts: ${checks.length} checks`);
} catch (error) {
  errors.push(String(error));
  if (page && !page.isClosed()) await page.screenshot({ path: `${output}/last-state.png` }).catch(() => undefined);
  throw error;
} finally {
  await writeFile(`${output}/desktop-fonts-results.json`, JSON.stringify({ checks, samples, errors }, null, 2));
  await browser?.close(); await server?.close();
}
