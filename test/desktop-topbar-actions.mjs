import assert from 'node:assert/strict';

// test/desktop-topbar-actions.mjs — reach the same commands through inline buttons or the compact More menu.
export async function topbarAction(page, name) {
  const inline = page.getByRole('button', { name, exact: true });
  const more = page.getByRole('button', { name: '更多操作', exact: true });
  // Restoring immersive controls keeps visibility in transition after the root class changes.
  await inline.or(more).filter({ visible: true }).first().waitFor({ state: 'visible' });
  if (await inline.isVisible()) return inline;
  assert(await more.isVisible(), `${name}: compact view exposes its More trigger`);
  if (await more.getAttribute('aria-expanded') !== 'true') await more.click();
  const menu = page.getByRole('menu', { name: '更多操作', exact: true });
  await menu.waitFor();
  // A CSS role/label query avoids confusing the state text with the stable action name.
  const exactAction = menu.locator(`[aria-label=${JSON.stringify(name)}]`);
  assert.equal(await exactAction.count(), 1, `${name}: one semantic command is available in More`);
  assert(['menuitem', 'menuitemcheckbox'].includes(await exactAction.getAttribute('role')));
  return exactAction;
}

export async function clickTopbarAction(page, name) {
  const action = await topbarAction(page, name); await action.click();
  if (await page.locator('.desktop-more-menu').count()) await page.locator('.desktop-more-menu').waitFor({ state: 'detached' });
}
