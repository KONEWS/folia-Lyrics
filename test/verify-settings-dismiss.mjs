import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { openDesktopMenu, selectDesktopOption } from './desktop-select.mjs';
import { visualDialog, backgroundDialog, openVisualSettings, openBackgroundSettings, readVisual,
  waitVisual, visualFrame, emitVisual, readVisualCache } from './desktop-visual-fixture.mjs';
import { openDesktopSegmentation, expectDesktopSegmentationReturn } from './desktop-segmentation-actions.mjs';

// test/verify-settings-dismiss.mjs — real pointer dismissal, portal layering and original draft boundaries.
export async function verifySettingsDismiss(page, song, output) {
  const checks = [], samples = [], blank = { x: 80, y: 400 };
  const commands = () => page.evaluate(() => window.__foliaCommands.filter(command => ['mediaControl', 'systemVolume'].includes(command.type)));
  const quiet = async action => {
    const before = await commands(); await action(); await visualFrame(page);
    assert.deepEqual(await commands(), before, 'settings dismissal must not send media or volume commands');
  };
  const outside = () => quiet(() => page.mouse.click(blank.x, blank.y));
  const focus = async selector => {
    await page.waitForFunction(selector => document.activeElement?.matches(selector), selector);
    assert(await page.locator(selector).evaluate(element => element === document.activeElement), `focus returns to ${selector}`);
  };
  await selectDesktopOption(page, '歌词样式', { value: 'classic' });
  await page.waitForFunction(() => window.__foliaReadVisualizerProps?.()?.lines.length > 0);
  const settings = page.locator('.control-panel[aria-label="歌词设置"]');
  const settingsTrigger = page.locator('[data-settings-trigger]');
  await settingsTrigger.click(); await settings.waitFor();
  await settings.locator('.section-label').first().click(); assert(await settings.isVisible());
  await openDesktopMenu(page, '选择播放器');
  await outside(); await page.getByRole('listbox', { name: '选择播放器', exact: true }).waitFor({ state: 'detached' });
  assert(await settings.isVisible(), 'first blank click dismisses only the main-settings selector');
  await openDesktopMenu(page, '选择播放器');
  await page.getByRole('option', { name: '自动跟随正在播放的应用', exact: true }).click();
  assert(await settings.isVisible(), 'portaled selection leaves its parent settings open');
  await outside(); await settings.waitFor({ state: 'detached' }); await focus('[data-settings-trigger]');
  checks.push('main settings retain internal and portaled option clicks; the first blank click closes only a selector, the next closes settings and restores its opener without media commands');

  await settingsTrigger.click(); await settings.waitFor();
  await settings.getByRole('checkbox', { name: '闲置时自动进入沉浸模式', exact: true }).check();
  await settings.getByRole('spinbutton', { name: '无操作等待时间', exact: true }).fill('17');
  assert.notEqual(await page.evaluate(() => window.__foliaMockPreferences().immersiveDelay), 17, 'number edit stays dirty before outside side press');
  await quiet(() => page.locator('.desktop-stage').evaluate(target => {
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'auxclick']) {
      const Event = type.startsWith('pointer') ? PointerEvent : MouseEvent;
      target.dispatchEvent(new Event(type, { button: 4, buttons: type.endsWith('down') ? 16 : 0,
        pointerType: 'mouse', bubbles: true, cancelable: true }));
    }
  }));
  await settings.waitFor({ state: 'detached' }); await focus('[data-settings-trigger]');
  assert.equal(await page.evaluate(() => window.__foliaMockPreferences().immersiveDelay), 17, 'side close commits the active number input blur');
  await settingsTrigger.click(); await settings.waitFor();
  await settings.getByRole('checkbox', { name: '闲置时自动进入沉浸模式', exact: true }).uncheck();
  await outside(); await settings.waitFor({ state: 'detached' });
  checks.push('outside side-button dismissal retains its immediate close, commits an active delay number input and does not switch tracks');

  for (const section of ['common', 'visualizer', 'subtitle']) {
    const content = await openVisualSettings(page, section);
    await content.locator('h3').first().click(); assert(await visualDialog(page).isVisible());
    await page.screenshot({ path: `${output}/settings-dismiss-${section}.png` });
    await outside(); await visualDialog(page).waitFor({ state: 'detached' });
    await focus('.topbar-mode-picker [role="combobox"]');
    checks.push(`${section}: internal blank space keeps visual settings open; external blank space closes it and restores the persistent style opener`);
  }

  const common = await openVisualSettings(page, 'common');
  await openDesktopMenu(page, '字体');
  await outside(); await page.getByRole('listbox', { name: '字体', exact: true }).waitFor({ state: 'detached' });
  assert(await visualDialog(page).isVisible(), 'font popup is the first outside layer');
  await openDesktopMenu(page, '字体');
  await page.getByRole('option', { name: '等宽', exact: true }).click();
  assert(await visualDialog(page).isVisible()); await waitVisual(page, { 'theme.fontStyle': 'mono' });
  await common.getByRole('textbox', { name: '自定义字体名称', exact: true }).fill('  Arial  ');
  await outside(); await visualDialog(page).waitFor({ state: 'detached' });
  await waitVisual(page, { 'theme.fontFamily': 'Arial' });
  checks.push('font dropdowns keep their parent through outside dismissal and selection; a font text draft still commits its trimmed value on blur before the parent closes');

  const sliderSection = await openVisualSettings(page, 'common');
  const range = sliderSection.locator('input[type="range"][aria-label="字号"]');
  await range.scrollIntoViewIfNeeded(); const bounds = await range.boundingBox(); assert(bounds);
  const beforeRange = (await readVisual(page)).lyricsFontScale;
  await page.mouse.move(bounds.x + bounds.width * .25, bounds.y + bounds.height / 2); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .8, bounds.y + bounds.height / 2, { steps: 8 });
  await visualFrame(page); const draftRange = Number(await range.inputValue());
  assert.notEqual(draftRange, beforeRange); assert.equal((await readVisual(page)).lyricsFontScale, beforeRange, 'held slider stays a draft');
  await page.mouse.move(blank.x, blank.y, { steps: 5 }); await page.mouse.up(); await visualFrame(page);
  assert(await visualDialog(page).isVisible(), 'dragging from a slider to blank space is not an outside click');
  const committedRange = Number(await range.inputValue());
  await waitVisual(page, { lyricsFontScale: committedRange });
  await outside(); await visualDialog(page).waitFor({ state: 'detached' });
  assert.equal((await readVisual(page)).lyricsFontScale, committedRange);
  samples.push({ context: 'slider-release-outside', beforeRange, draftRange, committedRange });
  checks.push('a held slider remains a draft; releasing outside commits without dismissing, and a later blank click closes without losing the committed value');

  for (const mode of ['common', 'latent', 'monet', 'nomand', 'sora', 'url']) {
    const content = await openBackgroundSettings(page);
    await selectDesktopOption(page, '背景类型', { value: mode });
    await content.locator(`[data-background-settings="${mode}"]`).waitFor();
    assert(await backgroundDialog(page).isVisible(), `${mode}: selector selection stays in background settings`);
    await content.locator('h3').first().click(); assert(await backgroundDialog(page).isVisible());
    await outside(); await backgroundDialog(page).waitFor({ state: 'detached' });
    await focus('.background-settings-button');
    assert.equal(await page.locator('.background-settings-button').getAttribute('aria-expanded'), 'false');
    checks.push(`${mode}: original background controls and portaled selection stay open; external blank click closes the standalone panel and restores its opener`);
  }

  const animations = await openVisualSettings(page, 'visualizer');
  await animations.locator('[data-visual-mode="tempera"]').click(); await waitVisual(page, { mode: 'tempera' });
  const add = animations.locator('[data-visualizer-settings="tempera"]').getByRole('button', { name: '添加图片', exact: true });
  const assetOpener = await add.elementHandle(); assert(assetOpener);
  await add.click(); const images = page.getByRole('dialog', { name: '画布图片', exact: true }); await images.waitFor();
  await images.getByRole('heading', { name: '画布图片', exact: true }).click();
  assert(await images.isVisible()); assert(await visualDialog(page).isVisible());
  await images.getByRole('button', { name: '导入备份', exact: true }).click(); await images.getByRole('menu').waitFor();
  await outside(); await images.getByRole('menu').waitFor({ state: 'detached' });
  assert(await images.isVisible(), 'first image-backdrop click dismisses only the import menu');
  assert(await visualDialog(page).isVisible());
  await images.getByRole('button', { name: '导入备份', exact: true }).click(); await images.getByRole('menu').waitFor();
  await page.keyboard.press('Escape'); await images.getByRole('menu').waitFor({ state: 'detached' });
  assert(await images.isVisible()); assert(await visualDialog(page).isVisible());
  checks.push('original image-portal internal clicks stay open; backdrop and Escape first dismiss its import menu while keeping both child and parent windows');
  const png = new PNG({ width: 32, height: 32 }); png.data.fill(180);
  for (let index = 3; index < png.data.length; index += 4) png.data[index] = 255;
  const assetName = 'outside-close-draft.png';
  await images.locator('input[type=file][accept^="image/"]').setInputFiles({ name: assetName, mimeType: 'image/png', buffer: PNG.sync.write(png) });
  await images.getByText(assetName, { exact: true }).waitFor();
  await images.getByRole('button', { name: '保存', exact: true }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('[aria-label="画布图片"] button')].some(button => button.textContent.trim() === '保存' && !button.disabled));
  assert.equal((await readVisual(page)).visualizerTunings.tempera.layerImages.length, 0, 'original image changes remain drafts until close');
  await page.screenshot({ path: `${output}/settings-dismiss-image-portal.png` });
  await outside(); await images.waitFor({ state: 'detached' }); assert(await visualDialog(page).isVisible());
  await page.waitForFunction(element => element === document.activeElement, assetOpener);
  assert(await assetOpener.evaluate(element => element === document.activeElement), 'asset close restores the same trigger even when its draft changes the button label');
  await page.waitForFunction(() => window.__foliaReadVisualizerProps?.()?.visualizerTunings.tempera.layerImages.length === 1);
  assert.equal((await readVisual(page)).visualizerTunings.tempera.layerImages[0].name, assetName);
  assert.equal((await readVisualCache(page, 'tempera_layer_image_')).length, 1);
  checks.push('an image backdrop closes only the original child window, runs its existing draft commit and restores its parent trigger; real IndexedDB artwork remains committed');
  await animations.getByRole('img', { name: assetName, exact: true }).click(); await images.waitFor();
  await page.keyboard.press('Escape'); await images.waitFor({ state: 'detached' }); assert(await visualDialog(page).isVisible());
  await page.keyboard.press('Escape'); await visualDialog(page).waitFor({ state: 'detached' });
  await focus('.topbar-mode-picker [role="combobox"]');
  checks.push('successive Escape presses retain the existing child-then-parent close order and focus restoration');

  const key = 'settings-dismiss-segmentation';
  const segmentSong = { ...song, key, title: '空白关闭分词草稿', playing: false, position: 2 };
  const packet = { key, title: segmentSong.title, artist: song.artist, cover: '', source: 'FIA close validation', format: 'fia',
    content: JSON.stringify({ format: 'folia-lyricdata', version: 1, exportedAt: '2026-10-05T00:00:00.000Z', song: {}, lyrics: { isWordByWord: true, lines: [{ startTime: 1, endTime: 5,
      fullText: '春风吹过原野', words: [{ text: '春风', startTime: 1, endTime: 2 }, { text: '吹过', startTime: 2, endTime: 3 }, { text: '原野', startTime: 3, endTime: 5 }] }] } }) };
  await selectDesktopOption(page, '歌词样式', { value: 'classic' });
  await emitVisual(page, 'session', segmentSong); await emitVisual(page, 'lyrics', packet);
  await page.waitForFunction(() => window.__foliaReadVisualizerProps?.()?.lines[0]?.fullText === '春风吹过原野');
  const segmentation = page.getByRole('dialog', { name: '本曲歌词分词', exact: true });
  const openSegmentation = () => openDesktopSegmentation(page);
  await openSegmentation(); const originalText = await segmentation.getByRole('textbox', { name: '分词内容', exact: true }).inputValue();
  const originalLines = (await readVisual(page)).lines;
  await segmentation.getByRole('textbox', { name: '分词内容', exact: true }).fill('春/风吹/过原野');
  await page.screenshot({ path: `${output}/settings-dismiss-segmentation.png` });
  await outside(); await expectDesktopSegmentationReturn(page);
  assert.deepEqual((await readVisual(page)).lines, originalLines);
  assert.equal((await readVisualCache(page, `lyricSeg_desktop:${key}`)).length, 0, 'blank close discards unsaved segmentation without a write');
  await openSegmentation(); assert.equal(await segmentation.getByRole('textbox', { name: '分词内容', exact: true }).inputValue(), originalText);
  await page.keyboard.press('Escape'); await expectDesktopSegmentationReturn(page);
  await page.keyboard.press('Escape'); await settings.waitFor({ state: 'detached' }); await focus('[data-settings-trigger]');
  checks.push('segmentation outside close preserves Cancel semantics: unsaved text is discarded, timed lyrics and IndexedDB remain unchanged, and both outside and Escape restore the song grouping opener');
  samples.push({ context: 'segmentation-cancel', originalLines, originalText, mediaCommands: await commands() });
  return { checks, samples };
}
