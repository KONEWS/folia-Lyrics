import assert from 'node:assert/strict';

// test/desktop-select.mjs — interact with the production desktop glass selectors through their accessible roles.
export const desktopSelect = (page, name) => page.getByRole('combobox', { name, exact: true });

export async function openDesktopMenu(page, name) {
  const trigger = desktopSelect(page, name);
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  const menu = page.getByRole('listbox', { name, exact: true });
  await menu.waitFor();
  return menu;
}

// Snapshot registry choices without keeping a menu open between independent checks.
export async function readDesktopOptions(page, name) {
  const menu = await openDesktopMenu(page, name);
  const options = await menu.getByRole('option').evaluateAll(elements => elements.map(el => ({
    value: el.getAttribute('data-value'), label: el.textContent.trim(), selected: el.getAttribute('aria-selected') === 'true',
  })));
  await desktopSelect(page, name).click();
  await menu.waitFor({ state: 'detached' });
  return options;
}

// Selection uses real pointer input, including scrolling offscreen choices inside the portaled list.
export async function selectDesktopOption(page, name, { label, value }) {
  const trigger = desktopSelect(page, name);
  const menu = await openDesktopMenu(page, name);
  const chosen = value === undefined ? menu.getByRole('option', { name: label, exact: true })
    : menu.locator(`[role="option"][data-value=${JSON.stringify(value)}]`);
  assert.equal(await chosen.count(), 1, `${name} should expose exactly one requested choice`);
  const expected = await chosen.getAttribute('data-value');
  await chosen.click(); await menu.waitFor({ state: 'detached' });
  await page.waitForFunction(({ name, expected }) => [...document.querySelectorAll('[role="combobox"]')].find(el => el.getAttribute('aria-label') === name)?.getAttribute('data-value') === expected, { name, expected });
  assert.equal(await trigger.getAttribute('data-value'), expected);
  return expected;
}

// Cover cases use the existing native preference checkbox and retain its previous value.
export async function setDesktopCoverTheme(page, enabled = true) {
  const toggle = page.getByRole('checkbox', { name: '主题跟随歌曲封面', exact: true });
  const alreadyOpen = await toggle.count() > 0;
  if (!alreadyOpen) await page.getByRole('button', { name: '打开歌词设置', exact: true }).click();
  assert.equal(await toggle.isDisabled(), false, 'the original cover-theme preference stays directly usable');
  const previous = await toggle.isChecked();
  await toggle.setChecked(enabled);
  await page.waitForFunction(enabled => [...document.querySelectorAll('input[type="checkbox"]')].find(input =>
    input.closest('label')?.textContent.trim() === '主题跟随歌曲封面')?.checked === enabled, enabled);
  if (!alreadyOpen) await page.locator('.desktop-topbar [data-settings-trigger]').click();
  return previous;
}
