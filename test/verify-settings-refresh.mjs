import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { selectDesktopOption } from './desktop-select.mjs';
import { clickTopbarAction } from './desktop-topbar-actions.mjs';

// test/verify-settings-refresh.mjs — reordered settings, folded provider controls and original-renderer theme refresh.
const themeKeys = ['--cover-background', '--cover-foreground', '--cover-accent', '--cover-secondary'];
// Measure circular hue distance so a refresh cannot pass merely by changing a few rounded RGB units.
function hue(color) {
  assert.match(color, /^#[\da-f]{6}$/i, 'cover accent uses an opaque generated hex color');
  const [r, g, b] = [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16) / 255);
  const high = Math.max(r, g, b), low = Math.min(r, g, b), delta = high - low;
  if (!delta) return null;
  const sector = high === r ? ((g - b) / delta) % 6 : high === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (sector * 60 + 360) % 360;
}
export async function verifySettingsRefresh(page, song, output) {
  const checks = [], samples = [];
  const saved = await page.evaluate(() => ({ prefs: window.__foliaMockPreferences(), mode: localStorage.getItem('folia.desktop.mode.v1') }));
  const viewport = page.viewportSize();
  const emit = (type, data) => page.evaluate(({ type, data }) => window.__foliaEmit(type, data), { type, data });
  const open = () => page.getByRole('button', { name: '打开歌词设置', exact: true }).click();
  const close = () => page.getByRole('button', { name: '关闭设置', exact: true }).click();
  const refresh = page.getByRole('button', { name: '刷新主题色', exact: true });
  const available = () => page.waitForFunction(() => { const button = document.querySelector('[aria-label="刷新主题色"]'); return button && !button.disabled; });
  const sources = page.locator('.lyric-source-settings'), summary = sources.locator(':scope > summary');
  const frame = () => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const setPreferences = prefs => page.evaluate(prefs => window.__foliaSetMockPreferences(prefs), prefs);
  const sourceCount = count => page.waitForFunction(count => document.querySelector('.lyric-source-settings > summary')?.textContent.includes(`${count}/4`), count);
  const colorCover = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="32" height="100" fill="#dc493e"/><rect x="32" width="32" height="100" fill="#327de0"/><rect x="64" width="32" height="100" fill="#45c777"/><rect x="96" width="32" height="100" fill="#d6ae35"/><rect x="128" width="32" height="100" fill="#bb59d6"/></svg>')}`;
  const monoCover = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#888888"/></svg>')}`;
  const packet = { key: song.key, title: song.title, artist: song.artist, cover: '', embedded: false, format: 'lrc', source: '设置与刷新验证',
    content: '[00:01.000]原版歌词渲染\n[00:33.000]刷新主题保留歌词与进度\n[01:30.000]下一句歌词' };
  const seedCover = async cover => {
    await emit('session', { ...song, cover, position: 36, playing: false });
    await emit('lyrics', packet);
    await page.locator('.waiting-screen').waitFor({ state: 'detached' });
  };
  // Observe the committed original renderer props through the existing read-only DevTools probe.
  const snapshot = async context => {
    const sample = await page.evaluate(themeKeys => {
      const root = document.querySelector('.desktop-lyrics'), props = window.__foliaParserReadRenderer();
      if (!props) return { missingRenderer: true };
      return { colors: themeKeys.map(key => root.style.getPropertyValue(key).trim()),
        rendererColors: [props.theme.backgroundColor, props.theme.primaryColor, props.theme.accentColor, props.theme.secondaryColor],
        paused: props.paused, time: props.currentTime.get(), sameClock: props.currentTime === window.__foliaRefreshClock,
        sameLines: props.lines === window.__foliaRefreshLines, caption: document.querySelector('.track-caption strong')?.textContent,
        clock: document.querySelector('.clock-readout')?.textContent, waiting: Boolean(document.querySelector('.waiting-screen')),
        mediaRequests: window.__foliaCommands.filter(command => command.type === 'mediaControl').length };
    }, themeKeys);
    assert.equal(sample.missingRenderer, undefined, 'the real original renderer is mounted');
    assert.deepEqual(sample.colors, sample.rendererColors, `${context}: all four UI colors match the same original renderer theme`);
    assert.equal(sample.paused, true); assert.equal(sample.time, 36); assert.match(sample.clock, /^0:36/); assert.equal(sample.waiting, false);
    samples.push({ context, ...sample }); return sample;
  };
  const changeTheme = async context => {
    const before = await snapshot(`${context}-before`);
    await clickTopbarAction(page, '刷新主题色');
    await page.waitForFunction(({ themeKeys, before }) => {
      const root = document.querySelector('.desktop-lyrics'), button = document.querySelector('[aria-label="刷新主题色"]');
      return (!button || !button.disabled) && themeKeys.some((key, index) => root.style.getPropertyValue(key).trim() !== before[index]);
    }, { themeKeys, before: before.colors });
    const after = await snapshot(`${context}-after`);
    assert.notDeepEqual(after.colors, before.colors, `${context}: the displayed palette actually changes`);
    assert(after.sameClock && after.sameLines, `${context}: refresh preserves the original clock and lyric array`);
    assert.equal(after.caption, before.caption); assert.equal(after.mediaRequests, before.mediaRequests, 'refresh sends no playback request');
    const difference = Math.abs(hue(after.colors[2]) - hue(before.colors[2]));
    after.hueDelta = Math.min(difference, 360 - difference);
    assert(after.hueDelta >= 20, `${context}: a colorful cover produces a visibly different accent hue`);
  };
  // Check real hit testing and pairwise bounds, including the single Eye at the far right.
  const geometry = async context => {
    await frame();
    const sample = await page.evaluate(() => {
      const elements = [...document.querySelectorAll('.topbar-actions button,.restore-controls')];
      return { width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth,
        buttons: elements.map(button => { const box = button.getBoundingClientRect(), hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return { label: button.getAttribute('aria-label'), left: box.left, right: box.right, top: box.top, bottom: box.bottom,
            hit: hit === button || button.contains(hit) }; }), eyes: document.querySelectorAll('.restore-controls').length };
    });
    assert.equal(sample.overflow, false, context); assert.equal(sample.eyes, 1);
    const eye = sample.buttons.at(-1); assert(['沉浸显示', '显示控制栏'].includes(eye.label));
    for (const button of sample.buttons) {
      assert(button.hit && button.left >= 0 && button.right <= sample.width, `${context}: ${button.label} has its own reachable area`);
      if (button !== eye) assert(button.right <= eye.left - 1, `${context}: Eye remains at the far right without overlap`);
    }
    for (let index = 1; index < sample.buttons.length; index++) assert(sample.buttons[index].left >= sample.buttons[index - 1].right,
      `${context}: consecutive buttons must not overlap`);
    samples.push({ context, geometry: sample });
  };
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await emit('windowState', { maximized: false, fullscreen: false, clickThrough: false }); await emit('restore', {});
    if (await page.locator('.control-panel').count()) await close();
    await setPreferences({ coverTheme: true, autoImmersive: false, immersiveDelay: 30, onlineEnabled: true, onlineProviders: ['kugou', 'qq', 'netease', 'lrclib'] });
    await selectDesktopOption(page, '歌词样式', { value: 'classic' });
    await open();
    const first = await page.locator('.panel-heading').evaluate(heading => ({ tag: heading.nextElementSibling?.tagName,
      text: heading.nextElementSibling?.querySelector('label')?.textContent.trim() }));
    assert.deepEqual(first, { tag: 'SECTION', text: '播放页面透明背景' });
    assert.equal(await page.locator('.control-panel .section-label').filter({ hasText: '歌词样式' }).count(), 0);
    assert.equal(await page.locator('.control-panel [role="combobox"][aria-label="歌词样式"]').count(), 0);
    assert.equal(await page.getByRole('checkbox', { name: '播放页面透明背景', exact: true }).count(), 1);
    checks.push('transparent background first after heading, duplicate style explanation removed');
    assert.equal(await sources.getAttribute('open'), null); assert.equal(await sources.locator('input').count(), 4);
    assert.match(await summary.innerText(), /歌词来源/); await sourceCount(4);
    for (const input of await sources.locator('input').all()) assert.equal(await input.isVisible(), false);
    for (const control of [page.getByRole('checkbox', { name: '自动匹配在线歌词', exact: true }), page.getByLabel('在线搜索歌名'), page.getByLabel('在线搜索歌手')]) {
      assert(await control.isVisible()); assert.equal(await control.evaluate(element => Boolean(element.closest('.lyric-source-settings'))), false);
    }
    await page.screenshot({ path: `${output}/settings-sources-closed.png` });
    checks.push('provider settings start collapsed with enabled count and main search controls visible');
    await summary.click();
    const qq = page.getByRole('checkbox', { name: '启用QQ 音乐歌词源', exact: true });
    await qq.uncheck(); await sourceCount(3); await qq.check(); await sourceCount(4);
    await page.getByRole('checkbox', { name: '自动匹配在线歌词', exact: true }).uncheck();
    await page.waitForFunction(() => [...document.querySelectorAll('.lyric-source-settings input')].every(input => input.disabled));
    assert(await page.getByRole('button', { name: '搜索在线歌词', exact: true }).isDisabled());
    await page.getByRole('checkbox', { name: '自动匹配在线歌词', exact: true }).check();
    assert.equal(await qq.isDisabled(), false); await sourceCount(4);
    await page.screenshot({ path: `${output}/settings-sources-expanded.png` });
    await summary.click(); assert.equal(await sources.getAttribute('open'), null);
    await page.getByLabel('在线搜索歌名').fill(song.title); await page.getByLabel('在线搜索歌手').fill(song.artist);
    await page.getByRole('button', { name: '搜索在线歌词', exact: true }).click(); await page.locator('.online-result').first().waitFor();
    assert.equal(await page.locator('.online-result').count(), 2);
    assert.equal(await page.locator('.online-result').first().evaluate(element => Boolean(element.closest('.lyric-source-settings'))), false);
    assert(await page.locator('.online-result').first().isVisible()); assert(await page.locator('.online-result').nth(1).isDisabled());
    checks.push('expanded provider switches sync count and automatic disable state; folded panel keeps real search results accessible');
    await close(); await open(); assert.equal(await sources.getAttribute('open'), null); await close();
    checks.push('provider details reset to collapsed when settings are reopened');

    await seedCover(colorCover); await available();
    await page.waitForFunction(() => { const props = window.__foliaParserReadRenderer(); return props?.lines.length && props.currentTime.get() === 36; });
    await page.evaluate(() => { const props = window.__foliaParserReadRenderer(); window.__foliaRefreshClock = props.currentTime; window.__foliaRefreshLines = props.lines; });
    await changeTheme('normal-refresh'); await changeTheme('second-refresh');
    await page.screenshot({ path: `${output}/theme-refreshed.png` });
    checks.push('repeated manual refresh changes cover palette, synchronizes original renderer and keeps paused clock/lyrics intact');
    const stable = await snapshot('pause-before-identical-session');
    await page.evaluate(() => { window.__foliaRefreshTheme = window.__foliaParserReadRenderer().theme; });
    await emit('session', { ...song, cover: colorCover, playing: false, position: 36 }); await frame();
    assert.deepEqual((await snapshot('pause-after-identical-session')).colors, stable.colors);
    assert(await page.evaluate(() => window.__foliaParserReadRenderer().theme === window.__foliaRefreshTheme), 'pause retains the same manually chosen theme object');
    checks.push('ordinary paused session updates retain the manually chosen theme');
    await setPreferences({ coverTheme: false }); await page.waitForFunction(() => document.querySelector('[aria-label="刷新主题色"]')?.disabled);
    assert(await refresh.isDisabled()); await setPreferences({ coverTheme: true });
    await seedCover(''); await page.waitForFunction(() => document.querySelector('[aria-label="刷新主题色"]')?.disabled);
    assert(await refresh.isDisabled());
    await seedCover(monoCover); await page.waitForFunction(() => document.querySelector('.desktop-lyrics')?.style.getPropertyValue('--cover-background') === '#121212');
    assert(await refresh.isDisabled());
    checks.push('refresh is disabled when cover theme is off, cover is absent or cover is neutral');
    await seedCover(colorCover); await available();
    await page.setViewportSize({ width: 450, height: 300 }); await page.mouse.move(225, 150); await geometry('450x300-refresh');
    await changeTheme('narrow-refresh'); await page.screenshot({ path: `${output}/theme-refresh-narrow.png` });
    checks.push('450x300 refresh has a reachable button and single rightmost Eye without overlap');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole('button', { name: '沉浸显示', exact: true }).click(); await page.mouse.move(640, 400); await page.mouse.move(640, 18);
    await page.locator('.immersive.top-controls-revealed').waitFor(); await changeTheme('windowed-immersive-refresh');
    assert.equal(await page.locator('.immersive.top-controls-revealed').count(), 1); await geometry('windowed-immersive-refreshed');
    checks.push('windowed immersive top hover permits theme refresh without leaving immersion');
    await emit('restore', {}); await emit('windowState', { maximized: false, fullscreen: true, clickThrough: false });
    await page.getByRole('button', { name: '沉浸显示', exact: true }).click(); await page.mouse.move(640, 400);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.desktop-topbar')).visibility === 'hidden');
    const eye = page.locator('.restore-controls'), eyeBox = await eye.boundingBox();
    await page.mouse.move(eyeBox.x + eyeBox.width / 2, eyeBox.y + eyeBox.height / 2); await eye.click();
    await page.locator('.immersive').waitFor({ state: 'detached' }); await changeTheme('fullscreen-restored-refresh');
    assert.equal(await page.locator('.native-fullscreen').count(), 1); assert.equal(await page.locator('.window-buttons').count(), 0);
    await geometry('fullscreen-refreshed'); await page.screenshot({ path: `${output}/theme-refresh-fullscreen.png` });
    checks.push('fullscreen immersion restores controls with Eye, refreshes theme and retains native fullscreen');
    await writeFile(`${output}/settings-refresh-results.json`, JSON.stringify({ checks, samples }, null, 2));
    console.log('PASS reordered settings / folded sources / manual original-renderer cover theme checks');
    return checks;
  } catch (error) {
    console.error('FAIL settings-refresh check', error);
    throw error;
  } finally {
    await emit('windowState', { maximized: false, fullscreen: false, clickThrough: false }); await emit('restore', {});
    if (await page.locator('.control-panel').count()) await close();
    await page.setViewportSize(viewport); await setPreferences(saved.prefs);
    await emit('session', song); await emit('lyrics', packet);
    if (saved.mode && await page.getByRole('combobox', { name: '歌词样式', exact: true }).getAttribute('data-value') !== saved.mode)
      await selectDesktopOption(page, '歌词样式', { value: saved.mode });
    await page.evaluate(() => { delete window.__foliaRefreshClock; delete window.__foliaRefreshLines; delete window.__foliaRefreshTheme; });
  }
}
