import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { desktopSelect, selectDesktopOption } from './desktop-select.mjs';
import { visualDialog, backgroundDialog, visualFrame, emitVisual, openVisualSettings, closeVisualSettings,
  openBackgroundSettings, closeBackgroundSettings, readVisual, waitVisual, dragVisualRange, reloadVisualSong } from './desktop-visual-fixture.mjs';

// test/verify-background-topbar.mjs — direct desktop background entry, compact spacing and unchanged original rendering/settings persistence.
export async function verifyBackgroundTopbar(page, song, output) {
  const checks = [], samples = [], viewport = page.viewportSize();
  const saved = await page.evaluate(() => ({ storage: Object.fromEntries(Object.entries(localStorage)), prefs: window.__foliaMockPreferences(),
    testPrefs: sessionStorage.getItem('folia.test.mockPreferences'), appearance: {
      acrylic: document.querySelector('.desktop-lyrics').classList.contains('native-acrylic'),
      transparent: document.querySelector('.desktop-lyrics').classList.contains('transparent-background'),
      solid: document.querySelector('.desktop-lyrics').classList.contains('solid-surfaces'),
      highContrast: document.querySelector('.desktop-lyrics').classList.contains('high-contrast') } }));
  const packet = { key: song.key, title: song.title, artist: song.artist, cover: '', source: '独立背景设置验证', format: 'lrc',
    content: '[00:01.000]保留原版歌词画面\n[00:33.000]背景设置直接打开\n[00:42.000]下一行歌词' };
  const opener = () => page.getByRole('button', { name: '背景设置', exact: true });
  const windowState = (fullscreen = false, maximized = false) => emitVisual(page, 'windowState', { fullscreen, maximized, clickThrough: false });
  const focusedOpener = async () => {
    await page.waitForFunction(() => document.activeElement?.classList.contains('background-settings-button'));
    assert(await opener().evaluate(element => element === document.activeElement));
    assert.equal(await opener().getAttribute('aria-expanded'), 'false');
  };
  // Check hit targets and pinned header after scrolling, rather than asserting specific CSS padding numbers.
  const geometry = async context => {
    await backgroundDialog(page).evaluate(async element => {
      await Promise.allSettled(element.getAnimations({ subtree: true })
        .filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished));
    });
    const content = backgroundDialog(page).locator('[data-visual-section="background"]');
    await content.evaluate(element => { element.scrollTop = 0; }); await visualFrame(page);
    const initial = await backgroundDialog(page).evaluate(element => {
      const heading = element.querySelector('.desktop-visual-heading'), close = heading.querySelector('button');
      const content = element.querySelector('[data-visual-section="background"]');
      const card = content.querySelector('.desktop-visual-card'), rect = close.getBoundingClientRect();
      return { bounds: element.getBoundingClientRect().toJSON(), heading: heading.getBoundingClientRect().toJSON(), close: rect.toJSON(),
        content: content.getBoundingClientRect().toJSON(), card: card.getBoundingClientRect().toJSON(),
        scrollHeight: content.scrollHeight, clientHeight: content.clientHeight, width: innerWidth, height: innerHeight,
        closeHit: close.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)),
        overflow: content.scrollWidth > content.clientWidth, role: content.getAttribute('role'), labelledBy: content.getAttribute('aria-labelledby') };
    });
    assert(initial.bounds.x >= 0 && initial.bounds.y >= 0 && initial.bounds.right <= initial.width && initial.bounds.bottom <= initial.height,
      `${context}: dialog stays inside the window`);
    assert(initial.closeHit && initial.close.width >= 28 && initial.close.height >= 28, `${context}: close button remains reachable`);
    assert(initial.card.left >= initial.content.left && initial.card.right <= initial.content.right,
      `${context}: original controls fit their content width`);
    assert.equal(initial.overflow, false, `${context}: the compact panel must not require horizontal scrolling`);
    assert.equal(initial.role, 'region'); assert(initial.labelledBy);
    await content.evaluate(element => { element.scrollTop = element.scrollHeight; }); await visualFrame(page);
    const scrolled = await backgroundDialog(page).locator('.desktop-visual-heading').boundingBox(); assert(scrolled);
    assert(Math.abs(scrolled.y - initial.heading.y) <= 0.75, `${context}: scrolling content must not move the heading or its close button`);
    assert(await backgroundDialog(page).getByRole('button', { name: '关闭背景设置', exact: true }).isVisible());
    await content.evaluate(element => { element.scrollTop = 0; }); await visualFrame(page);
    samples.push({ context, geometry: initial }); await page.screenshot({ path: `${output}/background-topbar-${context}.png` });
  };
  const configText = async format => {
    const details = backgroundDialog(page).locator('[data-visual-config]');
    if (await details.getAttribute('open') === null) await details.locator('summary').click();
    await details.getByRole('button', { name: format === 'json' ? '复制 JSON' : '复制配置短码', exact: true }).click();
    await page.waitForFunction(format => {
      const value = document.querySelector('[aria-label="视觉配置内容"]')?.value || '';
      return format === 'json' ? value.startsWith('{') : value.startsWith('folia-theme:');
    }, format);
    return details.getByRole('textbox', { name: '视觉配置内容', exact: true }).inputValue();
  };
  const applyConfig = async text => {
    const details = backgroundDialog(page).locator('[data-visual-config]');
    if (await details.getAttribute('open') === null) await details.locator('summary').click();
    await details.getByRole('textbox', { name: '视觉配置内容', exact: true }).fill(text);
    await details.getByRole('button', { name: '应用配置', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.desktop-visual-feedback')?.textContent.includes('视觉配置已应用'));
    await visualFrame(page);
  };
  let stage = 'fixture';
  try {
    await page.evaluate(() => {
      localStorage.setItem('folia.desktop.mode.v1', 'classic'); localStorage.removeItem('folia.desktop.backgroundEnabled.v1');
      sessionStorage.setItem('folia.test.mockPreferences', JSON.stringify({ autoImmersive: false, audioReactive: false, transparentBackground: false }));
    });
    await reloadVisualSong(page, { ...song, playing: false, position: 36 }, packet);
    await emitVisual(page, 'appearance', { acrylic: true, transparent: false, solid: false, highContrast: false }); await windowState();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => { const props = window.__foliaReadVisualizerProps(); window.__foliaBackgroundClock = props.currentTime; window.__foliaBackgroundLines = props.lines; });
    stage = 'independent-entry';
    assert.equal(await opener().count(), 1); assert(await opener().isVisible()); assert.equal(await opener().getAttribute('aria-expanded'), 'false');
    assert.equal(await opener().locator('.lucide-wallpaper').count(), 1);
    await opener().locator('svg').click(); await backgroundDialog(page).waitFor();
    assert.equal(await opener().getAttribute('aria-expanded'), 'true'); assert.equal(await visualDialog(page).count(), 0);
    assert.equal(await backgroundDialog(page).getByRole('tablist').count(), 0); await geometry('window');
    await closeBackgroundSettings(page); await focusedOpener();
    await openVisualSettings(page, 'common');
    assert.deepEqual(await visualDialog(page).getByRole('tab').allTextContents(), ['通用', '歌词动画', '字幕']);
    assert.equal(await visualDialog(page).getByRole('tab', { name: '背景', exact: true }).count(), 0); await closeVisualSettings(page);
    checks.push('one permanent topbar Wallpaper button opens a standalone labelled background region; more visual settings retain only the common, lyric-animation and subtitle tabs');

    stage = 'compact-and-fullscreen';
    for (const [context, width, height, fullscreen, maximized] of [
      ['maximized', 1280, 800, false, true], ['fullscreen', 1280, 800, true, false],
      ['450x300-window', 450, 300, false, false], ['450x300-fullscreen', 450, 300, true, false]]) {
      await page.setViewportSize({ width, height }); await windowState(fullscreen, maximized);
      assert(await opener().isVisible(), `${context}: the background action stays directly on the topbar`);
      assert.equal(await page.locator('.topbar-more-menu .background-settings-button').count(), 0);
      await openBackgroundSettings(page); await geometry(context); await closeBackgroundSettings(page); await focusedOpener();
    }
    checks.push('maximized, native fullscreen and 450x300 window/fullscreen keep the direct background action, fitting original controls and a fixed reachable close header while content scrolls');

    stage = 'immersion-entry';
    await page.setViewportSize({ width: 450, height: 300 }); await windowState();
    await page.getByRole('button', { name: '沉浸显示', exact: true }).click(); await page.mouse.move(225, 150); await page.mouse.move(225, 18);
    await page.locator('.immersive.top-controls-revealed').waitFor(); await openBackgroundSettings(page);
    assert.equal(await page.locator('.immersive').count(), 0); await geometry('450x300-immersion-restored'); await closeBackgroundSettings(page); await focusedOpener();
    await windowState(true); await page.getByRole('button', { name: '沉浸显示', exact: true }).click();
    await page.getByRole('button', { name: '显示控制栏', exact: true }).click(); await page.locator('.immersive').waitFor({ state: 'detached' });
    await openBackgroundSettings(page); await closeBackgroundSettings(page); await focusedOpener();
    checks.push('windowed immersion reveals the topbar background button at the upper edge; native fullscreen immersion restores controls through the existing eye button before opening backgrounds');

    stage = 'original-background-cards';
    await page.setViewportSize({ width: 1280, height: 800 }); await windowState();
    const section = await openBackgroundSettings(page), enabled = section.getByRole('switch', { name: '启用原版歌词背景', exact: true });
    assert.equal(await enabled.getAttribute('aria-checked'), 'false'); await enabled.click(); await waitVisual(page, { 'background.transparent': false });
    for (const mode of ['common', 'latent', 'monet', 'nomand', 'sora', 'url']) {
      await selectDesktopOption(page, '背景类型', { value: mode }); await waitVisual(page, { 'background.mode': mode });
      const card = section.locator(`[data-background-settings="${mode}"]`); await card.waitFor();
      assert(await card.locator('input,button').count() > 0); assert.equal(await page.locator('audio,video').count(), 0);
      samples.push({ context: 'background-card', mode, controls: await card.locator('input,button').count() });
    }
    checks.push('the independent background page mounts all six original registry cards, applies each genuine mode to the renderer and keeps the lyric-only application free of media elements');

    stage = 'draft-and-transparency';
    await selectDesktopOption(page, '背景类型', { value: 'common' }); await waitVisual(page, { 'background.mode': 'common' });
    const range = section.locator('[data-background-settings="common"] input[type=range]').first(), previous = await readVisual(page);
    const opacity = await dragVisualRange(page, range, previous.background.common.opacity > 0.5 ? 0.25 : 0.8, async draft => {
      assert.notEqual(draft, previous.background.common.opacity); assert.equal((await readVisual(page)).background.common.opacity, previous.background.common.opacity);
    });
    await waitVisual(page, { 'background.common.opacity': opacity });
    assert(await page.evaluate(() => { const props = window.__foliaReadVisualizerProps(); return props.currentTime === window.__foliaBackgroundClock && props.lines === window.__foliaBackgroundLines; }));
    await emitVisual(page, 'appearance', { acrylic: false, transparent: true, solid: false, highContrast: false }); await waitVisual(page, { 'background.transparent': true });
    assert.equal(await enabled.getAttribute('aria-checked'), 'true'); assert(await section.getByText('当前开启了透明背景，原版背景暂时不绘制', { exact: false }).isVisible());
    await emitVisual(page, 'appearance', { acrylic: true, transparent: false, solid: false, highContrast: false }); await waitVisual(page, { 'background.transparent': false });
    checks.push('the genuine background opacity slider commits only on release while preserving lyric and clock references; transparent playback suppresses drawing without resetting the enabled background');

    stage = 'configuration-roundtrip';
    const json = await configText('json'), code = await configText('code'), exported = JSON.parse(json);
    assert.equal(exported.desktopBackgroundEnabled, true); assert.equal(exported.visualizerBackgroundMode, 'common'); assert.equal(exported.backgroundOpacity, opacity);
    for (const [format, text] of [['JSON', json], ['original-shortcode', code]]) {
      await applyConfig(JSON.stringify({ ...exported, desktopBackgroundEnabled: false, backgroundOpacity: 0.1 }));
      await waitVisual(page, { 'background.transparent': true, 'background.common.opacity': 0.1 });
      await applyConfig(text); await waitVisual(page, { 'background.transparent': false, 'background.common.opacity': opacity, 'background.mode': 'common' });
      samples.push({ context: `${format}-roundtrip`, ...await readVisual(page) });
    }
    await writeFile(`${output}/background-topbar-export.json`, json); await writeFile(`${output}/background-topbar-export.txt`, code);
    checks.push('the background page retains JSON and original compressed-shortcode import/export and restores the actual enabled mode and opacity after changes');

    stage = 'reload';
    await closeBackgroundSettings(page); await reloadVisualSong(page, { ...song, playing: false, position: 36 }, packet);
    await emitVisual(page, 'appearance', { acrylic: true, transparent: false, solid: false, highContrast: false });
    await waitVisual(page, { 'background.transparent': false, 'background.common.opacity': opacity, 'background.mode': 'common' });
    await openBackgroundSettings(page); assert.equal(await backgroundDialog(page).getByRole('switch', { name: '启用原版歌词背景', exact: true }).getAttribute('aria-checked'), 'true');
    checks.push('a real browser reload restores the background selection and released parameters through the existing production storage');

    stage = 'keyboard-and-focus';
    const controls = await backgroundDialog(page).evaluate(element => [...element.querySelectorAll('button:not(:disabled),input:not(:disabled):not([type=hidden]),textarea:not(:disabled),summary,[tabindex="0"]')]
      .filter(control => control.getClientRects().length > 0).length);
    for (const key of ['Tab', 'Shift+Tab']) for (let index = 0; index <= controls; index++) {
      await page.keyboard.press(key); assert(await backgroundDialog(page).evaluate(element => element.contains(document.activeElement)), `${key}: focus stays within the independent background dialog`);
    }
    await windowState(true); await desktopSelect(page, '背景类型').focus(); await page.keyboard.press('ArrowDown');
    const dropdown = page.getByRole('listbox', { name: '背景类型', exact: true }); await dropdown.waitFor();
    await page.keyboard.press('Escape'); await dropdown.waitFor({ state: 'detached' }); assert(await backgroundDialog(page).isVisible());
    await page.keyboard.press('Escape'); await backgroundDialog(page).waitFor({ state: 'detached' }); await focusedOpener();
    assert.equal(await page.locator('.native-fullscreen').count(), 1);
    checks.push('Tab and Shift+Tab remain inside the background dialog; Escape closes its dropdown before the dialog, returns focus to the permanent background button and preserves native fullscreen');
    await writeFile(`${output}/background-topbar-results.json`, JSON.stringify({ checks, samples }, null, 2));
    console.log(`PASS independent topbar background: ${checks.length} checks`); return checks;
  } catch (error) {
    await writeFile(`${output}/background-topbar-primary-failure.json`, JSON.stringify({ stage, error: String(error), checks, samples, snapshot: await readVisual(page) }, null, 2));
    await page.screenshot({ path: `${output}/background-topbar-primary-failure.png` }); throw error;
  } finally {
    await closeVisualSettings(page); await windowState(); await emitVisual(page, 'restore', {});
    await page.evaluate(saved => {
      localStorage.clear(); for (const [key, value] of Object.entries(saved.storage)) localStorage.setItem(key, value);
      if (saved.testPrefs === null) sessionStorage.removeItem('folia.test.mockPreferences'); else sessionStorage.setItem('folia.test.mockPreferences', saved.testPrefs);
    }, saved);
    await page.setViewportSize(viewport); await reloadVisualSong(page, song, packet);
    await page.evaluate(prefs => window.__foliaSetMockPreferences(prefs), saved.prefs); await emitVisual(page, 'appearance', saved.appearance);
  }
}
