import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installDesktopBridgeMock } from './desktop-bridge-mock.mjs';

// test/verify-desktop-follow-menu.mjs — verify direct title menu, unified waves and native source commands in the real desktop UI.
const output = resolve(process.env.FOLIA_UI_OUTPUT || 'test-results/desktop-follow-menu');
const waveBase = [4, 9, 15, 7, 12, 5, 11, 8];
const previewWaveHeight = (time, bar) => Math.max(3, Math.min(15.5, waveBase[bar]
  + 1.15 * Math.sin(time * 2 * Math.PI / 2800 - bar * .72)
  + .25 * Math.cos(time * 2 * Math.PI / 4200 + bar * .4)));
const salt = { slot: 0, name: '椒盐音乐', path: '', icon: '', launchKind: 'store', appUserModelId: 'Salt_player!App' };
const offline = { slot: 1, name: '未运行程序', path: 'C:\\Music\\offline.exe', icon: '', launchKind: 'exe' };
const sources = [{ id: 'Salt_player!App', label: 'Salt player', playing: true },
  { id: 'C:\\Music\\foobar2000.exe', label: 'foobar2000', playing: false }];
const baseSession = { key: 'test-song', sessionId: 'test-session', title: '测试歌曲', artist: '测试歌手', album: '', cover: '',
  source: sources[0].id, playing: true, position: 5, duration: 100, rate: 1, hasTimeline: true, sources };
const checks = [], errors = [];
let server, browser;
await mkdir(output, { recursive: true });
try {
  let url = process.env.FOLIA_TEST_URL;
  if (!url) {
    server = await createServer({ configFile: resolve('vite.desktop.config.ts'), server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
    await server.listen(); url = `http://127.0.0.1:${server.httpServer.address().port}/desktop.html`;
  }
  const origin = new URL(url).origin;
  browser = await chromium.launch({ executablePath: process.env.FOLIA_CHROMIUM_PATH, headless: true, args: ['--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await installDesktopBridgeMock(page);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('.window-title-button').waitFor();
  const emit = (type, data) => page.evaluate(({ type, data }) => window.__foliaEmit(type, data), { type, data });
  await page.evaluate(apps => window.__foliaSetMockPreferences({ musicApps: apps }), [salt, offline]);
  await emit('session', { ...baseSession, sequence: 1 });
  const title = page.getByRole('button', { name: 'Folia 桌面歌词，切换跟随音乐软件' });
  await title.click();
  const menu = page.getByRole('menu', { name: '选择跟随的音乐软件' });
  await menu.waitFor();
  assert.equal(await page.getByRole('menu').count(), 1, 'title opens the source list directly');
  const automatic = menu.locator('.window-follow-choice').filter({ hasText: '自动跟随' });
  const active = menu.locator('.window-follow-choice').filter({ hasText: '椒盐音乐' });
  const idle = menu.locator('.window-follow-choice').filter({ hasText: 'foobar2000' });
  const stopped = menu.locator('.window-follow-choice').filter({ hasText: '未运行程序' });
  for (const item of [title, automatic, active, idle, stopped]) {
    assert.equal(await item.locator('.follow-wave i').count(), 8);
    const bars = await item.locator('.follow-wave i').evaluateAll(elements => elements.map(el => {
      const style = getComputedStyle(el);
      return { width: style.width, height: style.height, color: style.color, fill: style.backgroundColor,
        animation: style.animationName, state: style.animationPlayState };
    }));
    assert.deepEqual([...new Set(bars.map(bar => bar.color))], [bars[0].color], 'every bar uses one monochrome color');
    for (const bar of bars) {
      assert.equal(bar.width, '1.25px'); assert.equal(bar.height, '16px');
      assert.equal(bar.fill, bar.color);
      assert.equal(bar.animation, 'follow-wave');
      assert.equal(bar.state, item === active ? 'running' : 'paused');
    }
  }
  const geometry = await active.locator('.follow-wave').evaluate(el => {
    const style = getComputedStyle(el);
    return { width: style.width, height: style.height, gap: style.columnGap };
  });
  assert.deepEqual(geometry, { width: '24px', height: '20px', gap: '1.25px' });
  const initialHeights = await automatic.locator('.follow-wave i').evaluateAll(elements =>
    elements.map(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m22 * 16));
  // Sample the rendered CSS wave at controlled times, then restore normal playback before testing pause.
  const sampleTimes = [...Array.from({ length: 96 }, (_, index) => index * 87.5), 8392, 8408, 4651];
  const waveSamples = await active.locator('.follow-wave i').evaluateAll((elements, times) => {
    const animations = elements.map(el => el.getAnimations()[0]);
    const originalTimes = animations.map(animation => animation.currentTime);
    const samples = times.map(time => {
      animations.forEach(animation => { animation.currentTime = time; });
      return elements.map(el => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
        return { height: matrix.m22 * 16, translateY: matrix.m42 };
      });
    });
    animations.forEach((animation, index) => { animation.currentTime = originalTimes[index]; });
    return samples;
  }, sampleTimes);
  for (let frame = 0; frame < 96; frame++) {
    for (let bar = 0; bar < 8; bar++) {
      assert(Math.abs(waveSamples[frame][bar].height - previewWaveHeight(sampleTimes[frame], bar)) < (frame % 2 ? .11 : .01),
        `rendered gentle spectrum at ${sampleTimes[frame]} ms, bar ${bar + 1}: ${waveSamples[frame][bar].height} vs preview ${previewWaveHeight(sampleTimes[frame], bar)}`);
      assert(Math.abs(waveSamples[frame][bar].height - waveBase[bar]) <= 1.4001,
        'every bar stays within the selected gentle 1.4 px motion range');
    }
  }
  assert(waveSamples[96].every((bar, index) => Math.abs(bar.height - waveSamples[97][index].height) < .06),
    'the full cycle has no visible jump within one display frame');
  assert(waveSamples[98].every((bar, index) => Math.abs(bar.height - previewWaveHeight(4651, index)) <= .13),
    'the known clipped-peak interpolation extreme stays within 0.13 px of the selected preview');
  assert(waveSamples.every(frame => frame.every(bar => bar.translateY === 0)), 'bars stay centered rather than bobbing vertically');
  for (const item of [title, automatic, idle, stopped]) {
    const heights = await item.locator('.follow-wave i').evaluateAll(elements =>
      elements.map(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m22 * 16));
    assert(heights.every((height, index) => Math.abs(height - waveSamples[0][index].height) < .05),
      'all resting icons share the selected gentle spectrum silhouette');
  }
  assert.equal(await stopped.isDisabled(), false);
  const waveFrames = () => active.locator('.follow-wave i').evaluateAll(elements => elements.map(el => getComputedStyle(el).transform));
  const movingBefore = await waveFrames();
  await page.waitForFunction(before => {
    const bars = Array.from(document.querySelectorAll('.window-follow-running .follow-wave-playing i'));
    return bars.length === 8 && bars.every((bar, index) => getComputedStyle(bar).transform !== before[index]);
  }, movingBefore);
  checks.push('title directly opens one source list with the selected monochrome gentle spectrum, and every bar animates only for the playing app');
  for (const [width, height] of [[1280, 800], [680, 450]]) {
    await page.setViewportSize({ width, height });
    const bounds = await menu.boundingBox();
    assert(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height);
    await page.screenshot({ path: `${output}/follow-menu-${width}x${height}.png` });
  }
  checks.push('the menu remains visible within regular and minimum desktop window sizes');
  await active.locator('.follow-wave i').evaluateAll(elements => elements.forEach(el => {
    const animation = el.getAnimations()[0];
    if (animation) animation.currentTime = 250;
  }));
  await emit('session', { ...baseSession, sequence: 2, playing: false, sources: [{ ...sources[0], playing: false }, sources[1]] });
  await page.waitForFunction(() => document.querySelector('.window-follow-running .follow-wave')?.classList.contains('follow-wave-playing') === false);
  assert.deepEqual(await active.locator('.follow-wave i').evaluateAll(elements =>
    elements.map(el => getComputedStyle(el).animationPlayState)), Array(8).fill('paused'));
  const frozenBefore = await waveFrames();
  const frozenTimes = await active.locator('.follow-wave i').evaluateAll(elements =>
    elements.map(el => el.getAnimations()[0].currentTime));
  assert(frozenTimes.every(time => time >= 250), 'pause keeps the in-progress animation time');
  await page.waitForTimeout(180);
  assert.deepEqual(await waveFrames(), frozenBefore, 'paused wave remains on one frame');
  assert.deepEqual(await active.locator('.follow-wave i').evaluateAll(elements =>
    elements.map(el => el.getAnimations()[0].currentTime)), frozenTimes, 'paused animation time remains frozen');
  await page.screenshot({ path: `${output}/follow-menu-paused-680x450.png` });
  await emit('session', { ...baseSession, sequence: 3 });
  await page.waitForFunction(before => {
    const bars = Array.from(document.querySelectorAll('.window-follow-running .follow-wave-playing i'));
    return bars.length === 8 && bars.some((bar, index) => getComputedStyle(bar).transform !== before[index]);
  }, frozenBefore);
  const resumedTimes = await active.locator('.follow-wave i').evaluateAll(elements =>
    elements.map(el => el.getAnimations()[0].currentTime));
  assert(resumedTimes.every((time, index) => time > frozenTimes[index]), 'playback resumes from the frozen phase');
  checks.push('playback pause freezes the actual animation and playback resumes smoothly from that phase without unmounting the menu');
  await idle.click();
  const commands = await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'source'));
  assert.equal(commands.at(-1).value, sources[1].id);
  assert.equal(await menu.count(), 0);
  checks.push('choosing a running app sends the existing source command and closes the menu');
  await title.click();
  await idle.click();
  const repeatedCommands = await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'source'));
  assert.equal(repeatedCommands.length, commands.length + 1,
    'reselecting the current app sends an explicit choice so the host can supersede a pending launch');
  assert.equal(repeatedCommands.at(-1).value, sources[1].id);
  await title.click();
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.includes('自动跟随')), true);
  await page.keyboard.press('ArrowUp');
  assert.equal(await stopped.evaluate(el => el === document.activeElement), true, 'ArrowUp wraps from the first choice to the last enabled choice');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.includes('自动跟随')), true,
    'ArrowDown wraps from the final enabled choice back to the first');
  await page.keyboard.press('ArrowDown');
  assert.equal(await active.evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Escape');
  assert.equal(await menu.count(), 0);
  assert.equal(await title.evaluate(el => el === document.activeElement), true);
  checks.push('keyboard arrows navigate the direct list and Escape returns focus to the title');
  await title.click();
  await stopped.click();
  const executablePath = offline.path;
  assert.equal((await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'source'))).at(-1).value, executablePath);
  await emit('session', { ...baseSession, sequence: 4, key: '', source: '', playing: false });
  await title.click();
  assert.equal(await menu.locator('.window-follow-choice').filter({ hasText: '未运行程序' }).count(), 1);
  assert.equal(await menu.locator('.window-follow-choice').filter({ hasText: '未运行程序' }).getAttribute('aria-checked'), 'true');
  await emit('session', { ...baseSession, sequence: 5, source: 'offline.exe', sources: [
    ...sources, { id: 'offline.exe', label: 'offline', playing: true },
  ] });
  const launched = menu.locator('.window-follow-choice').filter({ hasText: '未运行程序' });
  assert.equal(await launched.count(), 1, 'the preselected executable replaces its offline row when it starts');
  assert.equal(await launched.getAttribute('aria-checked'), 'true');
  assert.deepEqual(await launched.locator('.follow-wave i').evaluateAll(elements =>
    elements.map(el => getComputedStyle(el).animationPlayState)), Array(8).fill('running'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.deepEqual(await launched.locator('.follow-wave i').evaluateAll(elements =>
    elements.map(el => getComputedStyle(el).animationName)), Array(8).fill('none'));
  const reducedHeights = await launched.locator('.follow-wave i').evaluateAll(elements =>
    elements.map(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m22 * 16));
  assert(reducedHeights.every((height, index) => Math.abs(height - initialHeights[index]) < .05),
    'reduced motion keeps the same resting wave silhouette');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  checks.push('offline executable preselection persists as a path and becomes one selected running row on a filename source');
  await title.click();
  await page.locator('.desktop-topbar [data-settings-trigger]').click();
  const settingsSource = page.getByRole('combobox', { name: '选择播放器' });
  await settingsSource.scrollIntoViewIfNeeded();
  assert.equal(await settingsSource.getAttribute('data-value'), executablePath);
  assert.equal((await settingsSource.textContent()).includes('未运行程序'), true);
  assert.equal((await settingsSource.textContent()).includes(executablePath), false);
  checks.push('the settings source picker shows the selected executable by its bound display name');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(`PASS desktop follow menu: ${checks.length} checks`);
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ checks, errors }, null, 2));
  await browser?.close(); await server?.close();
}
