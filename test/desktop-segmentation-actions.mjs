import assert from 'node:assert/strict';

// test/desktop-segmentation-actions.mjs — reach song grouping through synchronization settings and verify its return route.
export const desktopSettingsPanel = page => page.locator('.control-panel[aria-label="歌词设置"]');
export const desktopSegmentationDialog = page => page.getByRole('dialog', { name: '本曲歌词分词', exact: true });

export async function desktopSegmentationEntry(page) {
  const settings = desktopSettingsPanel(page);
  if (!await settings.count()) await page.locator('.desktop-topbar [data-settings-trigger]').click();
  await settings.waitFor();
  const entry = settings.locator('[data-settings-section="sync"]').getByRole('button', { name: '本曲歌词分词', exact: true });
  await entry.scrollIntoViewIfNeeded(); await entry.waitFor({ state: 'visible' });
  return entry;
}

export async function openDesktopSegmentation(page, { keyboard = false, waitReady = true } = {}) {
  const entry = await desktopSegmentationEntry(page);
  if (keyboard) { await entry.focus(); await entry.press('Enter'); } else await entry.click();
  const dialog = desktopSegmentationDialog(page); await dialog.waitFor();
  assert.equal(await desktopSettingsPanel(page).count(), 0, 'segmentation replaces its parent settings panel');
  if (waitReady) await page.waitForFunction(() => {
    const editor = document.querySelector('.desktop-segmentation-editor textarea'); return editor && !editor.disabled;
  });
  return dialog;
}

export async function expectDesktopSegmentationReturn(page) {
  await desktopSegmentationDialog(page).waitFor({ state: 'detached' });
  await desktopSettingsPanel(page).waitFor();
  await page.waitForFunction(() => document.activeElement?.matches('.settings-segmentation-entry'));
  const entry = desktopSettingsPanel(page).locator('.settings-segmentation-entry');
  assert(await entry.evaluate(element => element === document.activeElement), 'closing segmentation returns focus to its main-settings entry');
  return entry;
}
