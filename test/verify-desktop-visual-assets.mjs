import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { visualDialog, openVisualSettings, closeVisualSettings, readVisual, waitVisual, readVisualCache,
  reloadVisualSong, visualFrame } from './desktop-visual-fixture.mjs';

// test/verify-desktop-visual-assets.mjs — genuine upstream Tempera pool writes, commit boundaries and IndexedDB persistence.
export async function verifyDesktopVisualAssets(page, song, packet, output, samples) {
  const checks = [], assetName = 'desktop-test-pool.png';
  const png = new PNG({ width: 96, height: 96 });
  for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
    const offset = (y * 96 + x) * 4; png.data[offset] = x * 2; png.data[offset + 1] = y * 2;
    png.data[offset + 2] = (x + y) % 2 ? 160 : 240; png.data[offset + 3] = 255;
  }
  const section = await openVisualSettings(page, 'visualizer');
  await section.locator('[data-visual-mode="tempera"]').click(); await waitVisual(page, { mode: 'tempera' });
  const upstream = section.locator('[data-visualizer-settings="tempera"]');
  assert.equal((await readVisual(page)).visualizerTunings.tempera.layerImages.length, 0, 'fresh isolated browser image pool');
  await upstream.getByRole('button', { name: '添加图片', exact: true }).click();
  const images = page.getByRole('dialog', { name: '画布图片', exact: true }); await images.waitFor();
  await page.waitForFunction(() => document.querySelector('[role="dialog"][aria-label="画布图片"]')?.contains(document.activeElement));
  await page.keyboard.press('Escape'); await images.waitFor({ state: 'detached' });
  assert(await visualDialog(page).isVisible(), 'an immediate asset-dialog Escape must not dismiss its parent visual settings');
  const add = upstream.getByRole('button', { name: '添加图片', exact: true });
  await page.waitForFunction(() => document.activeElement?.closest('[data-visualizer-settings="tempera"]')
    && document.activeElement.textContent.trim() === '添加图片');
  assert(await add.evaluate(element => element === document.activeElement), 'child dismissal restores its original parent trigger');
  await add.click(); await images.waitFor();
  const tabCount = await images.evaluate(element => [...element.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')]
    .filter(control => control.getClientRects().length > 0).length);
  assert(tabCount > 2);
  for (const key of ['Tab', 'Shift+Tab']) for (let index = 0; index <= tabCount; index++) {
    await page.keyboard.press(key); assert(await images.evaluate(element => element.contains(document.activeElement)), `${key}: focus stays inside the original image dialog`);
  }
  await images.getByRole('button', { name: '导入备份', exact: true }).click(); await images.getByRole('menu').waitFor();
  await page.keyboard.press('Escape'); await images.getByRole('menu').waitFor({ state: 'detached' });
  assert(await images.isVisible()); assert(await visualDialog(page).isVisible());
  await page.screenshot({ path: `${output}/visual-tempera-pool-keyboard.png` });
  checks.push('opening the original image dialog moves focus inside; immediate Escape closes only the child, Tab stays contained, and import-submenu Escape preserves both dialogs');
  const file = images.locator('input[type=file][accept^="image/"]');
  await file.setInputFiles({ name: assetName, mimeType: 'image/png', buffer: PNG.sync.write(png) });
  await images.getByText(assetName, { exact: true }).waitFor();
  await page.waitForFunction(() => { const dialog = document.querySelector('[role="dialog"][aria-label="画布图片"]');
    return dialog && [...dialog.querySelectorAll('button')].some(button => button.textContent.trim() === '保存' && !button.disabled); });
  const added = await readVisualCache(page, 'tempera_layer_image_');
  assert.equal(added.length, 1); assert.equal(added[0].data.name, assetName); assert.equal(added[0].data.isBlob, true);
  assert(added[0].data.blobSize > 0); assert.equal(added[0].data.mimeType, 'image/png');
  assert.equal((await readVisual(page)).visualizerTunings.tempera.layerImages.length, 0, 'image dialog remains a draft before Save');
  await page.screenshot({ path: `${output}/visual-tempera-pool-draft.png` });
  await images.getByRole('button', { name: '保存', exact: true }).click(); await images.waitFor({ state: 'detached' });
  await page.waitForFunction(() => window.__foliaReadVisualizerProps?.()?.visualizerTunings.tempera.layerImages.length === 1);
  const committed = await readVisual(page), image = committed.visualizerTunings.tempera.layerImages[0];
  assert.equal(`tempera_layer_image_${image.id}`, added[0].key);
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('tempera_tuning'))).layerImages[0].id, image.id);
  assert.equal(image.name, assetName); assert.equal(Object.hasOwn(image, 'blob'), false); assert.equal(Object.hasOwn(image, 'url'), false);
  samples.push({ context: 'tempera-pool-committed', image, indexedDB: added });
  checks.push('the original image picker writes an actual IndexedDB Blob, holds the renderer pool as a draft, and Save commits id/placement through the original Tempera store');

  await closeVisualSettings(page); await reloadVisualSong(page, song, packet); await waitVisual(page, { mode: 'tempera' });
  const restoredSection = await openVisualSettings(page, 'visualizer'), restoredPanel = restoredSection.locator('[data-visualizer-settings="tempera"]');
  const thumbnail = restoredPanel.getByRole('img', { name: assetName, exact: true });
  await thumbnail.waitFor(); await page.waitForFunction(name => [...document.querySelectorAll('img')].some(image => image.alt === name && image.complete && image.naturalWidth > 0), assetName);
  assert.equal((await readVisual(page)).visualizerTunings.tempera.layerImages[0].id, image.id);
  assert.equal((await readVisualCache(page, 'tempera_layer_image_'))[0].data.blobSize, added[0].data.blobSize);
  await thumbnail.click(); await images.waitFor();
  assert(await images.getByText(assetName, { exact: true }).isVisible());
  await images.getByRole('button', { name: '移除图片', exact: true }).click();
  assert.equal((await readVisual(page)).visualizerTunings.tempera.layerImages.length, 1, 'removal is also a draft until Save');
  assert.equal((await readVisualCache(page, 'tempera_layer_image_')).length, 1, 'committed image data survives an unsaved removal');
  await images.getByRole('button', { name: '保存', exact: true }).click(); await images.waitFor({ state: 'detached' });
  await page.waitForFunction(() => window.__foliaReadVisualizerProps?.()?.visualizerTunings.tempera.layerImages.length === 0);
  for (let frame = 0; frame < 60 && (await readVisualCache(page, 'tempera_layer_image_')).length; frame++) await visualFrame(page);
  assert.equal((await readVisualCache(page, 'tempera_layer_image_')).length, 0);
  await page.screenshot({ path: `${output}/visual-tempera-pool-removed.png` });
  samples.push({ context: 'tempera-pool-removed', indexedDB: await readVisualCache(page, 'tempera_layer_image_') });
  checks.push('reloading restores the real pool thumbnail and Blob; removing and saving clears its committed tuning and IndexedDB record');
  await closeVisualSettings(page); return checks;
}
