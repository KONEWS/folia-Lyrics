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
