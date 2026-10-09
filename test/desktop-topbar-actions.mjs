import assert from 'node:assert/strict';

// test/desktop-topbar-actions.mjs — reach everyday commands directly in the desktop toolbar.
export async function topbarAction(page, name) {
  const inline = page.locator('.desktop-topbar').getByRole('button', { name, exact: true });
  // Restoring immersive controls keeps visibility in transition after the root class changes.
  await inline.waitFor({ state: 'visible' });
  assert.equal(await inline.count(), 1, `${name}: one directly visible command is available in the toolbar`);
  return inline;
}

export async function clickTopbarAction(page, name) {
  const action = await topbarAction(page, name); await action.click();
}
