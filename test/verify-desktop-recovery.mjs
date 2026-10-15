import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installDesktopBridgeMock } from './desktop-bridge-mock.mjs';

// test/verify-desktop-recovery.mjs — inject renderer faults through the live registry, then exercise the real error boundary and controls.
const output = resolve(process.env.FOLIA_UI_OUTPUT || 'test-results/desktop-recovery');
await mkdir(output, { recursive: true });
const marker = 'Desktop recovery fixture', checks = [], errors = [];
let server, browser, page;
try {
  let url = process.env.FOLIA_TEST_URL;
  if (!url) {
    server = await createServer({ configFile: resolve('vite.desktop.config.ts'), server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
    await server.listen(); url = `http://127.0.0.1:${server.httpServer.address().port}/desktop.html`;
  }
  const origin = new URL(url).origin;
  browser = await chromium.launch({ executablePath: process.env.FOLIA_CHROMIUM_PATH, headless: true,
    args: ['--no-proxy-server', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox'] });
  for (const mode of ['classic', 'partita']) {
    page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    page.on('pageerror', error => { if (!String(error).includes(marker)) errors.push(String(error)); });
    page.on('console', message => { if (message.type() === 'error' && !message.text().includes(marker)) errors.push(message.text()); });
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await installDesktopBridgeMock(page);
    await page.addInitScript(mode => {
      localStorage.setItem('folia.desktop.mode.v1', mode);
      sessionStorage.setItem('folia.test.mockPreferences', JSON.stringify({ autoImmersive: false, audioReactive: false }));
    }, mode);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('.waiting-screen h1').waitFor();
    const song = { key: `recovery-${mode}`, title: '恢复验证', artist: '测试播放器', cover: '', source: 'recovery-fixture',
      sessionId: `recovery-session-${mode}`, position: 36, duration: 60, rate: 1, playing: false, hasTimeline: true,
      sources: [{ id: 'recovery-fixture', label: '测试播放器' }] };
    await page.evaluate(song => {
      window.__foliaEmit('session', { ...song, sequence: 1 });
      window.__foliaEmit('lyrics', { key: song.key, title: song.title, artist: song.artist, source: '恢复测试', embedded: true, cover: '', format: 'lrc',
        content: '[00:01.000]PREVIOUS LINE\n[00:33.000]CURRENT RECOVERY LINE\n[00:42.000]NEXT LINE' });
    }, song);
    await page.locator('.desktop-stage .waiting-screen').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.querySelector('.desktop-stage')?.textContent.includes('RECOVERY'));
    // Keep the real renderer installed until the stage is ready; only the next render deliberately throws.
    await page.evaluate(async ({ mode, marker, song }) => {
      const { getVisualizerRegistryEntry } = await import('/src/components/visualizer/registry.tsx');
      const entry = getVisualizerRegistryEntry(mode), original = entry.render;
      window.__foliaRestoreRenderer = () => { entry.render = original; };
      entry.render = () => { throw new Error(`${marker}: ${mode}`); };
      window.__foliaEmit('session', { ...song, title: `${song.title} · fault`, sequence: 2 });
    }, { mode, marker, song });
    const fallback = page.locator('.desktop-stage [role="alert"]');
    await fallback.waitFor();
    assert.equal(await fallback.locator('h1').innerText(), '这个动效暂时无法显示');
    const diagnostics = () => page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'rendererError'));
    let logged = await diagnostics();
    assert.equal(logged.length, 1, 'one caught renderer failure sends one diagnostic');
    assert.equal(logged[0].value.mode, mode);
    assert(logged[0].value.message.includes(marker));
    assert(logged[0].value.stack && logged[0].value.componentStack, 'diagnostic includes error and React component stacks');
    await page.screenshot({ path: `${output}/${mode}-failed.png` });
    checks.push(`${mode}: caught failure shows recovery controls and logs its mode and stacks once`);
    if (mode === 'classic') {
      await fallback.getByRole('button', { name: '重试歌词显示', exact: true }).click();
      await fallback.waitFor();
      await page.waitForFunction(() => window.__foliaCommands.filter(command => command.type === 'rendererError').length === 2);
      await page.waitForTimeout(150);
      assert.equal((await diagnostics()).length, 2, 'a persistent fault stays recoverable without an automatic retry loop');
      checks.push('classic: an unsuccessful retry stays in the boundary and does not recurse');
    }
    await page.evaluate(() => window.__foliaRestoreRenderer());
    await fallback.getByRole('button', { name: mode === 'classic' ? '重试歌词显示' : '切回流光', exact: true }).click();
    await fallback.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.querySelector('.desktop-stage')?.textContent.includes('RECOVERY'));
    assert.equal(await page.getByRole('combobox', { name: '歌词样式', exact: true }).getAttribute('data-value'), 'classic');
    await page.screenshot({ path: `${output}/${mode}-recovered.png` });
    logged = await diagnostics();
    assert.equal(logged.length, mode === 'classic' ? 2 : 1);
    checks.push(mode === 'classic' ? 'classic: retry remounts the same selected mode and restores lyrics' : 'partita: recovery switches to the real classic renderer and restores lyrics');
    await page.close();
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(`PASS desktop renderer recovery: ${checks.length} checks`);
} catch (error) {
  errors.push(String(error));
  if (page && !page.isClosed()) await page.screenshot({ path: `${output}/last-state.png` }).catch(() => undefined);
  throw error;
} finally {
  await writeFile(`${output}/desktop-recovery-results.json`, JSON.stringify({ checks, errors }, null, 2));
  await browser?.close(); await server?.close();
}
