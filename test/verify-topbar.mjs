import assert from 'node:assert/strict';
import { readDesktopOptions, selectDesktopOption } from './desktop-select.mjs';
import { clickTopbarAction, topbarAction } from './desktop-topbar-actions.mjs';

// test/verify-topbar.mjs — exercise the desktop topbar through real pointer and keyboard input.
export async function verifyTopbar(page, song, output) {
  const checks = [];
  const emit = (type, data) => page.evaluate(({ type, data }) => window.__foliaEmit(type, data), { type, data });
  const open = () => page.getByRole('button', { name: '打开歌词设置', exact: true }).click();
  const close = () => page.locator('.desktop-topbar [data-settings-trigger]').click();
  const countCommands = () => page.evaluate(() => window.__foliaCommands.filter(m => ['fullscreen', 'exitFullscreen'].includes(m.type)).length);
  const waitVisibility = (selector, visible) => page.waitForFunction(({ selector, visible }) =>
    getComputedStyle(document.querySelector(selector)).visibility === (visible ? 'visible' : 'hidden'), { selector, visible });
  await emit('windowState', { maximized: false, fullscreen: false, clickThrough: false });
  await emit('restore', {});
  await page.locator('.immersive').waitFor({ state: 'detached' });
  const cover = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#506ab8"/></svg>')}`;
  await emit('session', { ...song, cover });
  await emit('lyrics', { key: song.key, title: song.title, artist: song.artist, content: '[00:01.00]音乐在播放\n[00:20.00]歌词跟随时间\n[00:33.00]保留原版动效\n[00:42.00]下一行歌词', source: '顶栏验证', cover: '', embedded: false, format: 'lrc' });
  await page.locator('.waiting-screen').waitFor({ state: 'detached' });
  await open();
  await page.getByRole('checkbox', { name: '闲置时自动进入沉浸模式', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: '沉浸时移到底部呼出播放控件', exact: true }).check();
  await close();
  const settingsPanel = page.locator('.control-panel');
  const settingsTrigger = page.locator('.desktop-topbar [data-settings-trigger]');
  await open();
  assert.equal(await settingsPanel.getAttribute('aria-label'), '歌词设置');
  assert.equal(await settingsPanel.locator('.panel-heading').count(), 0, 'the settings title row is removed');
  assert.equal(await settingsTrigger.getAttribute('aria-expanded'), 'true');
  await settingsTrigger.click(); await settingsPanel.waitFor({ state: 'detached' });
  assert.equal(await settingsTrigger.getAttribute('aria-expanded'), 'false');
  await open(); await settingsPanel.locator('[data-settings-section="sync"] .section-label').click();
  assert(await settingsPanel.isVisible(), 'clicking within settings keeps the panel open');
  const playerSelect = settingsPanel.getByRole('combobox', { name: '选择播放器', exact: true });
  await playerSelect.click();
  await page.getByRole('listbox', { name: '选择播放器', exact: true }).getByRole('option').first().click();
  assert(await settingsPanel.isVisible(), 'choosing an option from the portaled menu keeps settings open');
  await page.mouse.click(20, 420); await settingsPanel.waitFor({ state: 'detached' });
  checks.push('ordinary settings have no title row and close by outside click or the same topbar trigger while portaled choices remain usable');
  assert.equal(await page.locator('.desktop-brand').count(), 0, 'the playback bar no longer reserves space for the software name');
  const [header, caption, image] = await Promise.all([
    page.locator('.desktop-topbar').boundingBox(), page.locator('.track-caption').boundingBox(),
    page.getByRole('img', { name: '专辑封面', exact: true }).boundingBox(),
  ]);
  assert(header && caption && image && caption.x - header.x <= 30 && image.x - caption.x <= 1,
    'the cover and song are the first content at the left edge of the playback bar');
  const mode = page.getByRole('combobox', { name: '歌词样式', exact: true });
  const options = await readDesktopOptions(page, '歌词样式');
  assert.equal(options.length, 13);
  assert(!options.some(option => option.value === 'still'));
  assert.equal(options.filter(option => option.label === '绘光').length, 1);
  assert.equal(await page.locator('.control-panel').count(), 0, 'styles are usable without opening settings');
  await selectDesktopOption(page, '歌词样式', { label: '绘光' });
  await page.locator('.desktop-stage canvas').waitFor({ timeout: 60000 });
  assert.equal(await page.evaluate(() => localStorage.getItem('folia.desktop.mode.v1')), 'lumiere');
  await selectDesktopOption(page, '歌词样式', { label: '流光' });
  await page.locator('.desktop-stage canvas').waitFor({ state: 'detached' });
  assert.equal(await mode.getAttribute('data-value'), 'classic');
  checks.push('leftmost cover and song without a brand', '13 dynamic styles including Lumiere and excluding still', 'topbar style selection mounts original renderer and persists');

  const translation = page.getByRole('button', { name: '显示译文', exact: true });
  const topmost = page.getByRole('button', { name: '窗口置顶', exact: true });
  await translation.click();
  const translated = await translation.getAttribute('aria-pressed') === 'true';
  await topmost.click();
  await page.waitForFunction(() => window.__foliaCommands.at(-1)?.type === 'topmost');
  const pinned = await topmost.getAttribute('aria-pressed') === 'true';
  assert.equal(await page.evaluate(() => window.__foliaCommands.at(-1).value), pinned);
  await open();
  const translationSetting = page.getByRole('checkbox', { name: '显示译文', exact: true });
  const topmostSetting = page.getByRole('checkbox', { name: '窗口置顶', exact: true });
  assert.equal(await translationSetting.isChecked(), translated);
  assert.equal(await topmostSetting.isChecked(), pinned);
  await translationSetting.setChecked(!translated);
  await topmostSetting.setChecked(!pinned);
  assert.equal(await translation.getAttribute('aria-pressed'), String(!translated));
  await page.waitForFunction(pinned => document.querySelector('.desktop-topbar [aria-label="窗口置顶"]')?.getAttribute('aria-pressed') === String(pinned), !pinned);
  await translationSetting.check();
  await topmostSetting.uncheck();
  await close();
  checks.push('translation shortcut and settings sync in both directions', 'topmost shortcut and native preferences sync in both directions');
  await page.screenshot({ path: `${output}/topbar-shortcuts.png` });

  const borderStyle = locator => locator.evaluate(el => getComputedStyle(el).borderTopStyle);
  await emit('appearance', { acrylic: false, solid: true, highContrast: true });
  await page.locator('.desktop-lyrics.high-contrast').waitFor();
  assert.equal(await borderStyle(translation), 'double'); assert.equal(await borderStyle(topmost), 'solid');
  await translation.click(); await topmost.click();
  assert.equal(await borderStyle(translation), 'solid'); assert.equal(await borderStyle(topmost), 'double');
  await emit('appearance', { acrylic: false, solid: false, highContrast: false });
  await page.locator('.high-contrast').waitFor({ state: 'detached' });
  await page.emulateMedia({ forcedColors: 'active' });
  assert.equal(await borderStyle(translation), 'solid'); assert.equal(await borderStyle(topmost), 'double');
  await translation.click(); await topmost.click();
  assert.equal(await borderStyle(translation), 'double'); assert.equal(await borderStyle(topmost), 'solid');
  await page.emulateMedia({ forcedColors: 'none' });
  checks.push('high-contrast shortcut selection remains visually distinguishable', 'forced-colors shortcut selection remains visually distinguishable');

  await page.getByRole('button', { name: '沉浸显示', exact: true }).click();
  await page.mouse.move(500, 300);
  await waitVisibility('.desktop-topbar', false);
  await waitVisibility('.window-chrome', false);
  await page.mouse.move(500, 18);
  await page.locator('.immersive.top-controls-revealed').waitFor();
  await waitVisibility('.desktop-topbar', true);
  await waitVisibility('.window-chrome', true);
  assert(await page.getByRole('button', { name: '最小化窗口', exact: true }).isVisible());
  assert(await page.getByRole('button', { name: '最大化窗口', exact: true }).isVisible());
  assert(await page.getByRole('button', { name: '关闭应用', exact: true }).isVisible());
  // Opening the glass menu must keep the top zone open while keyboard focus moves into its choices.
  await mode.hover(); await mode.click();
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  assert.equal(await page.locator('.immersive.top-controls-revealed').count(), 1);
  await selectDesktopOption(page, '歌词样式', { label: '流光' });
  await page.screenshot({ path: `${output}/immersive-top-controls.png` });
  await page.mouse.move(500, 300);
  await page.locator('.top-controls-revealed').waitFor({ state: 'detached' });
  await waitVisibility('.desktop-topbar', false);
  await waitVisibility('.window-chrome', false);
  await page.mouse.move(500, 780);
  await page.locator('.immersive.controls-revealed').waitFor();
  await waitVisibility('.desktop-statusbar', true);
  assert.equal(await page.locator('.top-controls-revealed').count(), 0);
  await page.mouse.move(500, 300);
  await page.locator('.controls-revealed').waitFor({ state: 'detached' });
  await waitVisibility('.desktop-statusbar', false);
  checks.push('windowed immersive top hover reveals titlebar and shortcuts', 'top hover stays usable over its controls and hides when leaving', 'bottom hover still reveals transport independently');

  const beforeWindowEscape = await countCommands();
  await page.keyboard.press('Escape');
  await page.locator('.immersive').waitFor({ state: 'detached' });
  assert.equal(await countCommands(), beforeWindowEscape, 'windowed Escape must not toggle fullscreen');
  await open(); await page.keyboard.press('Escape');
  await page.locator('.control-panel').waitFor({ state: 'detached' });
  assert.equal(await countCommands(), beforeWindowEscape);
  // Listen after app initialization so this observes the app's preventDefault decision.
  await page.evaluate(() => window.addEventListener('keydown', event => {
    if (event.key === 'F11') window.__foliaF11Prevented = event.defaultPrevented;
  }));
  await page.keyboard.press('F11');
  assert.equal(await page.evaluate(() => window.__foliaF11Prevented), true);
  assert.equal(await countCommands(), beforeWindowEscape, 'F11 must no longer send a host toggle');
  assert.equal(await page.evaluate(() => document.fullscreenElement), null);
  await page.getByRole('button', { name: '切换全屏', exact: true }).click();
  await page.locator('.window-buttons').waitFor({ state: 'detached' });
  assert.equal(await countCommands(), beforeWindowEscape + 1, 'the fullscreen button remains usable');
  await page.getByRole('button', { name: '沉浸显示', exact: true }).click();
  await page.mouse.move(500, 300); await page.mouse.move(500, 18);
  assert.equal(await page.locator('.top-controls-revealed').count(), 0, 'fullscreen immersion must not reveal window controls');
  await waitVisibility('.desktop-topbar', false);
  assert.equal(await page.locator('.window-buttons').count(), 0);
  await page.mouse.move(500, 780); await page.locator('.controls-revealed').waitFor();
  await page.dispatchEvent('body', 'keydown', { key: 'Escape', repeat: true });
  assert.equal(await countCommands(), beforeWindowEscape + 1, 'repeated Escape must not change native fullscreen');
  assert.equal(await page.locator('.immersive').count(), 1, 'a repeated Escape must not prematurely exit immersion');
  await page.keyboard.press('Escape');
  await page.locator('.immersive').waitFor({ state: 'detached' });
  await page.locator('.window-buttons').waitFor();
  assert.equal(await countCommands(), beforeWindowEscape + 2);
  assert.equal(await page.evaluate(() => window.__foliaCommands.filter(m => ['fullscreen', 'exitFullscreen'].includes(m.type)).at(-1).type), 'exitFullscreen');
  await page.keyboard.press('Escape');
  assert.equal(await countCommands(), beforeWindowEscape + 2, 'Escape after exit remains windowed');
  checks.push('windowed Escape exits immersion and closes settings without fullscreen', 'F11 blocked without fullscreen toggle', 'fullscreen button still works', 'fullscreen immersion keeps caption buttons hidden but bottom transport available', 'repeated Escape ignored and normal Escape exits fullscreen once');

  await open();
  const bottomHover = page.getByRole('checkbox', { name: '沉浸时移到底部呼出播放控件', exact: true });
  const automaticImmersion = page.getByRole('checkbox', { name: '闲置时自动进入沉浸模式', exact: true });
  const delay = page.getByRole('spinbutton', { name: '无操作等待时间', exact: true });
  const originalDelay = await delay.inputValue();
  const originalAutomatic = await automaticImmersion.isChecked();
  // The delay editor is enabled only while automatic immersion is on; manual immersion uses the saved delay too.
  await bottomHover.uncheck(); await automaticImmersion.check();
  await delay.fill('2'); await delay.press('Enter'); await automaticImmersion.uncheck(); await close();
  await page.getByRole('button', { name: '沉浸显示', exact: true }).click();
  await page.mouse.move(500, 780);
  assert.equal(await page.locator('.controls-revealed').count(), 0, 'disabled bottom hover must keep transport hidden');
  await page.mouse.move(500, 18); await page.locator('.immersive.top-controls-revealed').waitFor();
  await waitVisibility('.desktop-topbar', true); await waitVisibility('.window-chrome', true);
  checks.push('top hover still works when the bottom hover preference is off');
  // A focused shortcut must not pin the top chrome open after its configured idle timeout.
  await translation.focus();
  assert(await translation.evaluate(el => document.activeElement === el));
  await page.locator('.immersive.cursor-idle').waitFor();
  await page.locator('.top-controls-revealed').waitFor({ state: 'detached' });
  await waitVisibility('.desktop-topbar', false); await waitVisibility('.window-chrome', false);
  assert(await page.locator('.desktop-lyrics').evaluate(el => !el.querySelector('.desktop-topbar')?.contains(document.activeElement)
    && !el.querySelector('.window-chrome')?.contains(document.activeElement)), 'idle must release hidden caption and topbar keyboard focus');
  checks.push('two-second idle closes revealed top controls, releases focus and hides the cursor');
  await page.mouse.move(501, 18); await page.locator('.immersive.top-controls-revealed').waitFor();
  await emit('windowState', { maximized: false, fullscreen: false, clickThrough: true });
  await page.locator('.top-controls-revealed').waitFor({ state: 'detached' });
  await page.mouse.move(500, 300); await page.mouse.move(502, 18);
  assert.equal(await page.locator('.top-controls-revealed').count(), 0, 'click-through must disable top hover input');
  await waitVisibility('.desktop-topbar', false); await waitVisibility('.window-chrome', false);
  await emit('windowState', { maximized: false, fullscreen: false, clickThrough: false }); await emit('restore', {});
  await page.locator('.immersive').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '沉浸显示', exact: true }).click();
  await page.mouse.move(500, 300); await page.mouse.move(500, 18);
  await page.locator('.immersive.top-controls-revealed').waitFor();
  await waitVisibility('.desktop-topbar', true); await waitVisibility('.window-chrome', true);
  checks.push('click-through disables top hover and restoring interaction re-enables it');
  await page.keyboard.press('Escape'); await page.locator('.immersive').waitFor({ state: 'detached' });
  await open(); await bottomHover.check(); await automaticImmersion.check();
  await delay.fill(originalDelay); await delay.press('Enter'); await automaticImmersion.setChecked(originalAutomatic); await close();

  // Include the smallest CSS viewport produced by the native minimum size at 150% display scaling.
  for (const { width, height } of [{ width: 600, height: 450 }, { width: 450, height: 300 }]) {
    await page.setViewportSize({ width, height });
    await page.mouse.move(width / 2, height / 2);
    const dimensions = await page.evaluate(() => ({ width: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    assert(dimensions.html <= dimensions.width && dimensions.body <= dimensions.width, `${width}x${height} controls must not create horizontal overflow`);
    for (const locator of [mode, page.getByRole('button', { name: '打开歌词设置', exact: true }), page.getByRole('button', { name: '更多操作', exact: true })]) {
      const box = await locator.boundingBox();
      assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height);
      assert(await locator.evaluate(el => {
        const box = el.getBoundingClientRect();
        const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return target === el || el.contains(target);
      }), `${width}x${height} shortcut center must be reachable rather than covered by another element`);
    }
    for (const name of ['显示译文', '窗口置顶', '切换全屏']) {
      const action = await topbarAction(page, name), box = await action.boundingBox();
      assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height,
        `${width}x${height} compact command ${name} must remain in the viewport`);
      assert(await action.evaluate(element => { const bounds = element.getBoundingClientRect(), hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
        return hit === element || element.contains(hit); }), `${name}: More command has a reachable target`);
      await page.keyboard.press('Escape'); await page.locator('.desktop-more-menu').waitFor({ state: 'detached' });
    }
    await selectDesktopOption(page, '歌词样式', { label: '流光' });
    await clickTopbarAction(page, '显示译文'); await clickTopbarAction(page, '显示译文');
    await clickTopbarAction(page, '窗口置顶'); await clickTopbarAction(page, '窗口置顶');
    await open(); assert(await page.locator('.control-panel').isVisible()); await close();
    await page.screenshot({ path: `${output}/${width === 600 ? 'topbar-small' : `topbar-small-${width}x${height}`}.png` });
    checks.push(`${width}x${height} controls stay within viewport without overflow or overlap`, `${width}x${height} style, translation, pinning and settings controls are usable`);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  console.log('PASS topbar / windowed hover / Escape fullscreen checks');
  return checks;
}
