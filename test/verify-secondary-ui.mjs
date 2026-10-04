import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { openDesktopMenu, desktopSelect } from './desktop-select.mjs';
import { visualDialog, openVisualSettings, closeVisualSettings, emitVisual, waitVisual, visualFrame } from './desktop-visual-fixture.mjs';
import { secondaryStrongBackground } from './secondary-contrast-fixture.mjs';
import { secondaryScrollbars } from './secondary-scrollbar-fixture.mjs';

// test/verify-secondary-ui.mjs — shared menu/notice skin, body portals and genuine keyboard input.
const tokens = ['--glass-text', '--glass-line', '--desktop-glass-base', '--desktop-glass-panel', '--desktop-glass-hover',
  '--desktop-glass-selected', '--desktop-control-radius', '--desktop-control-font-size', '--desktop-control-line-height',
  '--desktop-control-padding', '--desktop-control-selected-border', '--desktop-surface-radius', '--desktop-glass-backdrop'];
const skin = locator => locator.evaluate((element, tokens) => {
  const style = getComputedStyle(element);
  return { font: style.fontSize, line: style.lineHeight, radius: style.borderRadius, padding: style.padding,
    background: style.backgroundColor, image: style.backgroundImage, border: style.borderTopColor,
    borderStyle: style.borderTopStyle, borderWidth: style.borderTopWidth, shadow: style.boxShadow,
    blur: style.backdropFilter, color: style.color, weight: style.fontWeight, before: getComputedStyle(element, '::before').display,
    tokens: Object.fromEntries(tokens.map(token => [token, style.getPropertyValue(token).trim()])) };
}, tokens);
// Await real finite CSS entry animations and transitions before comparing selected fills or screenshot pixels.
const settle = async (page, locator) => {
  await visualFrame(page); const element = await locator.elementHandle();
  try { await page.waitForFunction(element => element.getAnimations({ subtree: true }).every(animation =>
    !(animation instanceof CSSTransition || animation instanceof CSSAnimation && Number.isFinite(animation.effect?.getComputedTiming().endTime))
      || (!animation.pending && animation.playState !== 'running')), element, { timeout: 5000 }); }
  finally { await element.dispose(); }
};
const controlContract = (value, context) => {
  assert.equal(value.font, '12px', context); assert.equal(value.line, '18px', context);
  assert.equal(value.radius, '8px', context); assert.equal(value.padding, '8px 12px', context);
  assert.equal(value.image, 'none', context); assert.equal(value.shadow, 'none', context); assert.equal(value.before, 'none', context);
};
// Compare the same skin across genuine menus and body portals, including keyboard and system appearances.
export async function verifySecondaryUi(page, song, output) {
  const checks = [], samples = [], viewport = page.viewportSize();
  let phase = 'primary-menu'; const runtimeErrors = [];
  const observeError = error => runtimeErrors.push({ phase, stack: error.stack || String(error) });
  page.on('pageerror', observeError);
  await page.evaluate(() => {
    window.__foliaSecondaryUiEvents = [];
    const record = event => {
      if (event.type === 'pointerleave' && !event.target?.matches?.('.desktop-lyrics')) return;
      window.__foliaSecondaryUiEvents.push({ type: event.type, time: performance.now(), width: innerWidth, height: innerHeight,
        x: event.clientX, y: event.clientY, target: event.target?.outerHTML?.slice(0, 200), active: document.activeElement?.outerHTML.slice(0, 200) });
    };
    for (const event of ['focusin', 'blur', 'pointerleave']) document.addEventListener(event, record, true);
    window.addEventListener('resize', record);
    window.__foliaSecondaryUiEventCleanup = () => {
      for (const event of ['focusin', 'blur', 'pointerleave']) document.removeEventListener(event, record, true);
      window.removeEventListener('resize', record);
    };
  });
  const mode = await desktopSelect(page, '歌词样式').getAttribute('data-value');
  const record = async (locator, context) => { await settle(page, locator); const value = await skin(locator); samples.push({ context, ...value }); return value; };
  const selectedHover = async (menu, selected, context) => {
    await page.mouse.move(15, 110); const idle = await record(selected, `${context}-idle`); controlContract(idle, context);
    await selected.hover(); const hovered = await record(selected, `${context}-hover`);
    for (const key of ['background', 'border', 'weight', 'shadow']) assert.equal(hovered[key], idle[key], `${context}: selected ${key} persists on hover`);
    assert(Number(idle.weight) >= 600); assert.notEqual(idle.background, (await skin(menu.locator('button:not([aria-selected=true],[aria-checked=true]):not(:disabled)').first())).background);
  };
  try {
    await emitVisual(page, 'appearance', { acrylic: false, solid: false, highContrast: false });
    const primary = await openDesktopMenu(page, '歌词样式'), primarySkin = await record(page.locator('.desktop-glass-menu.desktop-top-menu'), 'primary-menu');
    assert.equal(primarySkin.radius, '15px'); assert.match(primarySkin.blur, /blur\(34px\)/);
    assert.match(primarySkin.blur, /saturate\(1\.25\)/); assert.match(primarySkin.blur, /brightness\(0\.65\)/);
    await selectedHover(primary, primary.getByRole('option', { selected: true }), 'primary-selection');
    phase = 'primary-readability'; await page.mouse.move(15, 110); await settle(page, primary);
    await secondaryStrongBackground(page, [
      [primary.locator('[role=option]:not([aria-selected=true]) .custom-select-option-label').first(), 'primary'],
      [primary.locator('[role=option][aria-selected=true] .custom-select-option-label'), 'selected'],
    ], 'style-menu', output, samples);
    await secondaryScrollbars(page, primary, 'style-scrollbar', samples, { hidden: true, scroll: true });
    checks.push('actual style text and selected glyph pixels reach 4.5 contrast over white and black desktop backgrounds; hidden style scrollbars retain genuine wheel scrolling');
    await page.keyboard.press('Escape'); await primary.waitFor({ state: 'detached' });
    phase = 'notice'; await emitVisual(page, 'notice', { text: '通知样式验证' }); const notice = page.locator('.desktop-notice'); await notice.waitFor();
    const noticeSkin = await record(notice, 'notice'), action = notice.getByRole('button', { name: '查看设置', exact: true });
    for (const key of ['radius', 'background', 'border', 'blur', 'color', 'shadow']) assert.equal(noticeSkin[key], primarySkin[key], `notice shares primary menu ${key}`);
    controlContract(await record(action, 'notice-action'), 'notice action');
    await page.screenshot({ path: `${output}/secondary-notice.png` });
    await action.focus(); await action.press('Enter'); await notice.waitFor({ state: 'detached' });
    const settings = page.locator('.control-panel'); await settings.waitFor();
    phase = 'settings-readability'; assert.equal((await record(settings, 'settings-panel')).radius, '15px');
    await secondaryStrongBackground(page, [[settings.locator('.panel-heading > span'), 'primary'],
      [settings.locator('.settings-recovery-hint').first(), 'secondary']], 'settings', output, samples);
    await secondaryScrollbars(page, settings, 'settings-scrollbar', samples, { scroll: true });
    checks.push('ordinary settings primary and explanatory text retain 4.5 composited contrast on strong backgrounds; its 7px scrollbar hides only arrow buttons and responds to wheel input');
    await page.getByRole('button', { name: '关闭设置', exact: true }).click();
    checks.push('primary menus and notices share the glass surface and 12px/8px flat controls; keyboard activation opens settings and clears the notice');

    phase = 'font-menu'; await openVisualSettings(page, 'common'); const font = desktopSelect(page, '字体');
    controlContract(await record(font, 'font-trigger'), 'font trigger');
    phase = 'visual-readability'; const visual = visualDialog(page);
    assert.equal((await record(visual, 'visual-panel')).radius, '15px');
    await secondaryStrongBackground(page, [[visual.locator('.desktop-visual-heading h2'), 'primary'],
      [visual.locator('.desktop-visual-heading p'), 'secondary']], 'visual-settings', output, samples);
    await secondaryScrollbars(page, visual.locator('.desktop-visual-content'), 'visual-scrollbar', samples, { scroll: true });
    checks.push('visual settings titles and small descriptions keep 4.5 real pixel contrast, and the content scrollbar retains its visible track, thumb and wheel input');
    phase = 'font-menu';
    await font.focus(); await font.press('ArrowDown'); const fontMenu = page.getByRole('listbox', { name: '字体', exact: true }); await fontMenu.waitFor();
    await page.waitForFunction(() => document.querySelector('[role=listbox][aria-label="字体"]')?.contains(document.activeElement));
    const fontSkin = await record(fontMenu, 'font-menu'); assert.deepEqual(fontSkin.tokens, primarySkin.tokens);
    await secondaryScrollbars(page, fontMenu, 'font-scrollbar', samples);
    for (const key of ['radius', 'background', 'border', 'blur', 'color', 'shadow']) assert.equal(fontSkin[key], primarySkin[key]);
    await selectedHover(fontMenu, fontMenu.getByRole('option', { selected: true }), 'font-selection');
    await page.screenshot({ path: `${output}/secondary-font-menu.png` });
    await page.keyboard.press('Escape'); await fontMenu.waitFor({ state: 'detached' }); assert(await font.evaluate(element => element === document.activeElement));
    checks.push('the common font dropdown inherits primary menu tokens, persistent selected hover and keyboard focus restoration');

    const section = await openVisualSettings(page, 'visualizer');
    phase = 'tempera-mount'; await section.locator('[data-visual-mode="tempera"]').click(); await waitVisual(page, { mode: 'tempera' });
    phase = 'asset-open'; await section.locator('[data-visualizer-settings="tempera"]').getByRole('button', { name: '添加图片', exact: true }).click();
    const images = page.getByRole('dialog', { name: '画布图片', exact: true }); await images.waitFor();
    assert(await images.evaluate(element => !element.closest('.desktop-lyrics')), 'the original asset dialog really portals to body');
    phase = 'asset-readability'; assert.equal((await record(images, 'asset-dialog')).radius, '15px');
    await secondaryStrongBackground(page, [[images.locator('h2'), 'primary'],
      [images.locator('p').first(), 'secondary'], [images.locator('p.opacity-50').first(), 'empty-pool-hint'],
      [images.locator('p.opacity-50').last(), 'drop-hint'], [images.locator('span.opacity-60'), 'pool-count']], 'asset-dialog', output, samples);
    await secondaryScrollbars(page, images, 'asset-scrollbar', samples);
    checks.push('body-portalled asset titles and descriptions retain 4.5 actual composited contrast over strong backgrounds and inherit the 15px surface and visible arrowless scrollbar');
    const importButton = images.getByRole('button', { name: '导入备份', exact: true });
    controlContract(await record(importButton, 'asset-import-trigger'), 'asset import trigger');
    phase = 'asset-menu'; await importButton.focus(); await importButton.press('Enter'); const imported = images.getByRole('menu'); await imported.waitFor();
    await page.waitForFunction(() => document.querySelector('.desktop-visual-asset-dialog [role=menu]')?.classList.contains('desktop-glass-menu'));
    const assetSkin = await record(imported, 'asset-import-menu'); assert.deepEqual(assetSkin.tokens, primarySkin.tokens);
    for (const key of ['radius', 'background', 'border', 'blur', 'color', 'shadow']) assert.equal(assetSkin[key], primarySkin[key], `body menu shares ${key}`);
    controlContract(await record(imported.getByRole('menuitem').first(), 'asset-import-option'), 'asset import option');
    await page.keyboard.press('Tab'); assert(await imported.evaluate(element => element.contains(document.activeElement)), 'body menu items are reachable with Tab');
    await page.screenshot({ path: `${output}/secondary-body-menu.png` });
    checks.push('the original body-portalled Tempera dialog and its import menu share desktop tokens, menu typography and keyboard access');

    phase = 'solid'; await emitVisual(page, 'appearance', { acrylic: false, solid: true, highContrast: false });
    await page.waitForFunction(() => document.body.classList.contains('desktop-visual-solid'));
    for (const [locator, context] of [[images, 'solid-asset'], [imported, 'solid-body-menu']]) {
      const value = await record(locator, context); assert.equal(value.blur, 'none');
      const expected = await locator.evaluate(element => { const probe = document.createElement('i'); probe.style.background = 'var(--desktop-glass-base)'; element.append(probe); const color = getComputedStyle(probe).backgroundColor; probe.remove(); return color; });
      assert.equal(value.background, expected);
    }
    phase = 'high-contrast'; await emitVisual(page, 'appearance', { acrylic: false, solid: true, highContrast: true });
    await page.waitForFunction(() => document.body.classList.contains('desktop-visual-high-contrast'));
    for (const [locator, context] of [[images, 'contrast-asset'], [imported, 'contrast-body-menu']]) {
      const value = await record(locator, context); assert.equal(value.blur, 'none'); assert.equal(value.shadow, 'none'); assert.equal(value.borderStyle, 'solid'); assert.notEqual(value.background, value.color);
    }
    const contrastItem = await record(imported.getByRole('menuitem').first(), 'contrast-body-option'); assert.equal(contrastItem.borderStyle, 'solid'); assert.notEqual(contrastItem.background, contrastItem.color);
    checks.push('appearance changes propagate across body portals immediately; solid surfaces are opaque and high contrast removes blur while preserving visible controls');
    await emitVisual(page, 'appearance', { acrylic: false, solid: false, highContrast: false });
    phase = 'forced-colors'; await page.emulateMedia({ forcedColors: 'active' });
    const forced = await record(imported, 'forced-colors-body-menu'); assert.equal(forced.blur, 'none'); assert.equal(forced.shadow, 'none'); assert.notEqual(forced.background, forced.color);
    const forcedItem = await record(imported.getByRole('menuitem').first(), 'forced-colors-body-option'); assert.equal(forcedItem.borderStyle, 'solid'); assert.notEqual(forcedItem.background, forcedItem.color);
    await page.emulateMedia({ forcedColors: 'none' });
    checks.push('forced colors keeps the body-portalled import menu and its actionable items visible without glass blur');
    phase = 'asset-menu-close'; await page.keyboard.press('Escape'); await imported.waitFor({ state: 'detached' }); assert(await images.isVisible()); assert(await visualDialog(page).isVisible());
    phase = 'asset-close'; await page.keyboard.press('Escape'); await images.waitFor({ state: 'detached' });
    phase = 'parent-close'; await closeVisualSettings(page); await page.locator('body.desktop-visual-dialogs').waitFor({ state: 'detached' });

    phase = 'compact-resize'; await page.setViewportSize({ width: 600, height: 650 });
    // Keep the pointer in the resized window before keyboard input; leaving the surface deliberately releases menu focus.
    await page.mouse.move(15, 110); await visualFrame(page); const more = page.getByRole('button', { name: '更多操作', exact: true });
    phase = 'more-menu';
    await more.focus(); await more.press('ArrowDown'); const moreMenu = page.getByRole('menu', { name: '更多操作', exact: true }); await moreMenu.waitFor();
    await page.waitForFunction(() => document.querySelector('[role=menu][aria-label="更多操作"]')?.contains(document.activeElement));
    const moreSkin = await record(moreMenu, 'more-menu'); assert.deepEqual(moreSkin.tokens, primarySkin.tokens);
    controlContract(await record(moreMenu.getByRole('menuitemcheckbox').first(), 'more-action'), 'more action');
    if (!await moreMenu.locator('[aria-checked=true]').count()) { await moreMenu.getByRole('menuitemcheckbox').first().click(); await more.press('ArrowDown'); await moreMenu.waitFor(); }
    await selectedHover(moreMenu, moreMenu.locator('[aria-checked=true]').first(), 'more-selection');
    await page.screenshot({ path: `${output}/secondary-more-menu.png` });
    await page.keyboard.press('End'); assert(await moreMenu.getByRole('menuitem').last().evaluate(element => element === document.activeElement));
    await page.keyboard.press('Escape'); await moreMenu.waitFor({ state: 'detached' }); assert(await more.evaluate(element => element === document.activeElement));
    checks.push('the compact More menu uses the same controls and selected hover while ArrowDown, End and Escape keep actions keyboard accessible');
    return { checks, samples, runtimeErrors };
  } catch (error) {
    const events = await page.evaluate(() => window.__foliaSecondaryUiEvents);
    await writeFile(`${output}/secondary-ui-failure.json`, JSON.stringify({ phase, checks, samples, runtimeErrors, events, error: String(error) }, null, 2));
    await page.screenshot({ path: `${output}/secondary-ui-failure.png` }); throw error;
  } finally {
    await page.emulateMedia({ forcedColors: 'none' });
    await emitVisual(page, 'appearance', { acrylic: false, solid: false, highContrast: false });
    const assetClose = page.locator('.desktop-visual-asset-dialog > [role=dialog] > button');
    if (await assetClose.count()) { await assetClose.first().click(); await page.locator('.desktop-visual-asset-dialog').waitFor({ state: 'detached' }); }
    await closeVisualSettings(page); phase = 'viewport-restore'; await page.setViewportSize(viewport);
    if (await desktopSelect(page, '歌词样式').getAttribute('data-value') !== mode) {
      phase = 'return-mode'; const menu = await openDesktopMenu(page, '歌词样式'); await menu.locator(`[data-value="${mode}"]`).click(); await waitVisual(page, { mode });
    }
    page.off('pageerror', observeError);
    await page.evaluate(() => window.__foliaSecondaryUiEventCleanup?.());
  }
}

// Measure the genuine decoded cover palette while the shared cover fixture keeps the current song and clock intact.
export async function verifySecondaryCoverContrast(page, output) {
  const samples = [];
  try {
    await openVisualSettings(page, 'common'); const visual = visualDialog(page); await settle(page, visual);
    assert(await page.locator('.desktop-lyrics').evaluate(element => element.classList.contains('cover-theme')));
    await secondaryStrongBackground(page, [[visual.locator('.desktop-visual-heading h2'), 'primary'],
      [visual.locator('.desktop-visual-heading p'), 'secondary'], [visual.getByRole('tab', { selected: true }), 'selected']], 'cover-visual-settings', output, samples);
    return { checks: ['the actual decoded SMTC cover palette retains 4.5 real pixel contrast on every sampled primary, explanatory and selected text line over white and black desktop backgrounds'], samples };
  } catch (error) {
    await writeFile(`${output}/secondary-cover-failure.json`, JSON.stringify({ samples, error: String(error) }, null, 2)); throw error;
  } finally { await closeVisualSettings(page); }
}
