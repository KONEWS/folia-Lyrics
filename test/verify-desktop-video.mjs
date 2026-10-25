import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { installDesktopBridgeMock } from './desktop-bridge-mock.mjs';
import { openBackgroundSettings, closeBackgroundSettings, openVisualSettings, closeVisualSettings, emitVisual } from './desktop-visual-fixture.mjs';
import { selectDesktopOption } from './desktop-select.mjs';

// Use the running desktop dev server and a generated silent clip; native streaming is tested by video-layer-webview.
const url = process.env.FOLIA_TEST_URL;
if (!url) throw new Error('Set FOLIA_TEST_URL to the existing desktop dev server.');
const output = resolve(process.env.FOLIA_UI_OUTPUT || 'test-results/desktop-video');
await mkdir(output, { recursive: true });
const clip = await readFile(process.argv[2] || resolve(output, 'sample.webm'));
const remote = 'https://video.test/sample.webm', native = 'https://folia-video.local/__video/0123456789abcdef0123456789abcdef';
const browser = await chromium.launch({ executablePath: process.env.FOLIA_CHROMIUM_PATH, headless: true,
    args: ['--no-proxy-server', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox'] });
const checks = [], errors = [], mediaRequests = [];
let activePage, stage = 'open';
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    activePage = page;
    page.on('pageerror', error => errors.push(String(error)));
    page.on('requestfailed', request => { if (request.url() === remote || request.url() === native) mediaRequests.push({ url: request.url(), failed: request.failure() }); });
    page.on('response', response => { if (response.url() === remote || response.url() === native) mediaRequests.push({ url: response.url(), status: response.status() }); });
    await page.route('**/*', route => {
        const source = route.request().url();
        if (source === remote || source === native) {
            const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);
            const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), clip.length - 1) : clip.length - 1;
            return route.fulfill({ status: range ? 206 : 200, contentType: 'video/webm', body: clip.subarray(start, end + 1),
                headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${clip.length}` } : {}) } });
        }
        return new URL(source).origin === new URL(url).origin ? route.continue() : route.abort();
    });
    await installDesktopBridgeMock(page);
    await page.addInitScript(native => {
        localStorage.setItem('folia.desktop.mode.v1', 'classic');
        localStorage.setItem('static_mode', 'false');
        sessionStorage.setItem('folia.test.mockPreferences', JSON.stringify({ autoImmersive: false, audioReactive: false }));
        const original = window.chrome.webview.postMessage;
        window.chrome.webview.postMessage = message => {
            original(message);
            if (message.type === 'videoLayerRestore' || message.type === 'videoLayerClear') queueMicrotask(() => window.__foliaEmit('videoLayerFile', { status: 'none', name: null, source: null }));
            if (message.type === 'videoLayerSelect') queueMicrotask(() => window.__foliaEmit('videoLayerFile', { status: 'ready', name: 'native-sample.webm', source: native, picked: true }));
        };
    }, native);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    stage = 'waiting';
    await page.locator('.waiting-screen').waitFor();
    let sequence = 0;
    const song = { key: 'video-test', title: 'Video test', artist: 'Fixture', cover: '', source: 'fixture', sessionId: 'video-session',
        position: .4, duration: 120, rate: 1, playing: false, hasTimeline: true, sources: [] };
    const session = changes => emitVisual(page, 'session', { ...song, ...changes, sequence: ++sequence });
    await session({});
    stage = 'lyrics';
    await emitVisual(page, 'lyrics', { key: song.key, title: song.title, artist: song.artist, cover: '', source: 'fixture', format: 'lrc', content: '[00:00.00]Video fixture\n[01:00.00]Next lyric', embedded: false });
    await page.locator('.waiting-screen').waitFor({ state: 'detached' });
    assert.equal(await page.locator('video').count(), 0);
    let panel = await openBackgroundSettings(page);
    stage = 'video-url';
    await panel.getByRole('switch', { name: '在歌词后方显示视频', exact: true }).click();
    const input = panel.getByRole('textbox', { name: '视频 URL', exact: true });
    await input.fill(remote); await input.press('Enter');
    const video = page.locator('.desktop-stage video');
    await video.waitFor(); await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
    assert(await video.evaluate(video => video.muted && video.paused && video.duration > 0));
    assert.equal(await page.locator('audio').count(), 0, 'desktop video must not initialize the app audio player');
    checks.push('URL video mounts in the original backdrop, decodes muted and follows paused desktop playback');
    stage = 'opacity';
    await panel.getByRole('slider', { name: '不透明度', exact: true }).fill('0.75');
    await page.keyboard.press('Escape'); await page.getByRole('dialog', { name: '背景设置', exact: true }).waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => localStorage.getItem('video_layer_opacity')), '0.75');
    assert.equal(await video.evaluate(video => video.style.opacity), '0.75');
    checks.push('opacity saves on input and survives immediate Escape dismissal');
    stage = 'playback';
    panel = await openBackgroundSettings(page);
    await selectDesktopOption(page, '填充方式', { value: 'contain' });
    assert.equal(await video.evaluate(video => video.style.objectFit), 'contain');
    await closeBackgroundSettings(page);
    await session({ playing: true });
    await page.waitForFunction(() => document.querySelector('video')?.paused === false);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => document.querySelector('video')?.paused === true);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => document.querySelector('video')?.paused === false);
    await session({ position: 7.25, playing: false });
    await page.waitForFunction(() => { const v = document.querySelector('video'); return v?.paused && Math.abs(v.currentTime - 1.25) < .1; });
    checks.push('play, pause, window hiding/restoring and desktop seeks control the real video without the app audio player');
    stage = 'transparent';
    await emitVisual(page, 'appearance', { acrylic: false, transparent: true, solid: false, highContrast: false });
    await video.waitFor({ state: 'detached' });
    await emitVisual(page, 'appearance', { acrylic: true, transparent: false, solid: false, highContrast: false });
    await video.waitFor();
    stage = 'static';
    const common = await openVisualSettings(page, 'common');
    await common.getByRole('switch', { name: '减少动态效果', exact: true }).click();
    await video.waitFor({ state: 'detached' });
    await common.getByRole('switch', { name: '减少动态效果', exact: true }).click();
    await video.waitFor();
    await closeVisualSettings(page);
    checks.push('transparent windows and static mode remove the video, restoring them recreates the paused video');
    stage = 'native-file';
    panel = await openBackgroundSettings(page);
    await panel.getByRole('button', { name: '选择视频', exact: true }).click();
    await page.waitForFunction(native => document.querySelector('video')?.getAttribute('src') === native, native);
    assert(await video.evaluate(video => video.muted), 'local video remains muted');
    assert.equal(await page.evaluate(() => localStorage.getItem('video_layer_url')), remote);
    await panel.getByRole('button', { name: '清除本地视频', exact: true }).click();
    await page.waitForFunction(remote => document.querySelector('video')?.getAttribute('src') === remote, remote);
    checks.push('native selection takes precedence over URL and clearing it restores the saved URL');
    await panel.getByRole('switch', { name: '在歌词后方显示视频', exact: true }).click();
    await video.waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    await writeFile(resolve(output, 'frontend.json'), JSON.stringify({ checks, errors }, null, 2));
    console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
    if (activePage) {
        await activePage.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
        await writeFile(resolve(output, 'failure.json'), JSON.stringify({ stage, checks, errors, mediaRequests, error: String(error), body: await activePage.locator('body').innerText().catch(() => ''),
            classes: await activePage.locator('.desktop-lyrics').getAttribute('class'), staticMode: await activePage.evaluate(() => localStorage.getItem('static_mode')),
            video: await activePage.locator('video').evaluateAll(videos => videos.map(v => ({ src: v.getAttribute('src'), currentSrc: v.currentSrc, error: v.error?.code, ready: v.readyState, network: v.networkState, paused: v.paused, time: v.currentTime, duration: v.duration }))) }, null, 2));
    }
    throw new Error(`Video verification failed at ${stage}: ${error}`);
} finally { await browser.close(); }
