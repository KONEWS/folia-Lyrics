import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { installDesktopBridgeMock } from '../test/desktop-bridge-mock.mjs';
import { openDesktopMenu } from '../test/desktop-select.mjs';

// Capture shipped desktop style posters once; the application only loads the resulting PNGs.
const output = resolve('src/desktopLyrics/visualFeatures/stylePictures');
await mkdir(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
    try {
        const path = resolve('dist-desktop', '.' + new URL(req.url, 'http://localhost').pathname);
        res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
        res.end(await readFile(path));
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.env.FOLIA_CHROMIUM_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
try {
    const page = await browser.newPage({ viewport: { width: 1180, height: 760 }, deviceScaleFactor: 1 });
    await installDesktopBridgeMock(page);
    await page.addInitScript(() => localStorage.setItem('folia.desktop.mode.v1', 'classic'));
    await page.goto(`http://127.0.0.1:${server.address().port}/desktop.html`);
    await page.locator('.waiting-screen h1').waitFor();
    await page.evaluate(() => {
        window.__foliaEmit('session', { key: 'posters', title: 'posters', artist: 'Folia', source: 'Preview', playing: false, position: 36, duration: 100, rate: 1, hasTimeline: true, sources: [], sessionId: 'posters', controls: { toggle: true } });
        window.__foliaEmit('lyrics', { key: 'posters', title: 'posters', artist: 'Folia', format: 'lrc', content: '[00:01.000]歌词样式\n[00:33.000]让音乐成为画面\n[00:42.000]下一句歌词', source: 'Preview' });
    });
    await page.locator('.waiting-screen').waitFor({ state: 'detached' });
    await openDesktopMenu(page, '歌词样式');
    await page.locator('.desktop-top-menu [data-custom-select-footer]').click();
    const studio = page.locator('[data-ponder="vis-playground"]');
    await studio.waitFor();
    await studio.getByRole('button', { name: '内置', exact: true }).click();
    const choices = await studio.getByRole('radio').evaluateAll(nodes => nodes.map(node => node.dataset.value).filter(value => value !== '__random__'));
    // The poster uses a real sample frame, with no controls or hotspots over it.
    for (const mode of choices) {
        await studio.locator(`[role="radio"][data-value="${mode}"]`).click();
        await page.waitForTimeout(mode === 'machi' ? 8000 : 2000);
        const box = studio.locator('section div[style*="aspect-ratio"]').first();
        await box.evaluate(element => element.querySelectorAll('button,[role="group"]').forEach(node => { node.style.visibility = 'hidden'; }));
        await box.screenshot({ path: resolve(output, `${mode}.png`), timeout: 60000 });
        console.log(`Captured ${mode}`);
    }
} finally { await browser.close(); server.close(); }
