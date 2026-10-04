import assert from 'node:assert/strict';

// test/verify-close-preference.mjs — bridge-only settings checks; taskbar behavior needs the native host.
export async function verifyClosePreference(page, song, output) {
  const checks = [];
  const saved = await page.evaluate(() => ({ prefs: window.__foliaMockPreferences(),
    override: sessionStorage.getItem('folia.test.mockPreferences'), legacy: sessionStorage.getItem('folia.test.legacyClosePreference') }));
  const emit = (type, data) => page.evaluate(({ type, data }) => window.__foliaEmit(type, data), { type, data });
  const setting = page.getByRole('checkbox', { name: '关闭按钮最小化到任务栏', exact: true });
  const open = () => page.getByRole('button', { name: '打开歌词设置', exact: true }).click();
  const close = () => page.locator('.desktop-topbar [data-settings-trigger]').click();
  const messages = () => page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'closeToTaskbar'));
  const checked = value => page.waitForFunction(value => [...document.querySelectorAll('label.toggle')]
    .find(label => label.textContent.includes('关闭按钮最小化到任务栏'))?.querySelector('input')?.checked === value, value);
  try {
    await page.evaluate(saved => {
      sessionStorage.setItem('folia.test.mockPreferences', JSON.stringify(saved.prefs));
      sessionStorage.setItem('folia.test.legacyClosePreference', 'true');
    }, saved);
    await page.reload({ waitUntil: 'networkidle' }); await open();
    assert.equal(await page.evaluate(() => Object.hasOwn(window.__foliaReadyPreferences, 'closeToTaskbar')), false);
    assert.equal(await setting.isChecked(), false, 'a legacy ready packet without the new field starts with close-to-taskbar disabled');
    assert.equal((await messages()).length, 0, 'reading a legacy preference does not send a new setting command');
    await setting.check();
    await page.waitForFunction(() => window.__foliaMockPreferences().closeToTaskbar === true);
    assert(await setting.isChecked()); assert.deepEqual((await messages()).map(command => command.value), [true]);
    await setting.uncheck();
    await page.waitForFunction(() => window.__foliaMockPreferences().closeToTaskbar === false);
    assert.equal(await setting.isChecked(), false); assert.deepEqual((await messages()).map(command => command.value), [true, false]);
    await setting.check(); await page.waitForFunction(() => window.__foliaMockPreferences().closeToTaskbar === true);
    const beforeReply = (await messages()).length;
    await emit('preferences', { closeToTaskbar: false });
    await checked(false);
    assert.equal((await messages()).length, beforeReply, 'a host preference reply updates the checkbox without resending it');
    await emit('preferences', { closeToTaskbar: true });
    await checked(true);
    await emit('preferences', { topmost: saved.prefs.topmost });
    assert(await setting.isChecked(), 'an unrelated partial preference packet preserves the current close behavior');
    await setting.setChecked(Boolean(saved.prefs.closeToTaskbar));
    await page.waitForFunction(expected => window.__foliaMockPreferences().closeToTaskbar === expected, Boolean(saved.prefs.closeToTaskbar));
    await setting.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/glass-close-to-taskbar-setting.png` }); await close();
    // WindowChrome keeps its original close IPC; the native host chooses its behavior from preferences.
    const beforeClose = await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'window').length);
    await page.getByRole('button', { name: '关闭应用', exact: true }).click();
    const closeMessages = await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'window'));
    assert.equal(closeMessages.length, beforeClose + 1); assert.equal(closeMessages.at(-1).value.action, 'close');
    checks.push('legacy preference packet omitting closeToTaskbar defaults to disabled without writing a preference',
      'close-to-taskbar checkbox sends boolean commands, follows host replies and restores its original value',
      'partial preference updates preserve close behavior and the caption close button keeps its existing window IPC');
    return checks;
  } finally {
    await page.evaluate(saved => {
      sessionStorage.setItem('folia.test.mockPreferences', JSON.stringify(saved.prefs));
      if (saved.legacy === null) sessionStorage.removeItem('folia.test.legacyClosePreference');
      else sessionStorage.setItem('folia.test.legacyClosePreference', saved.legacy);
    }, saved);
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(saved => {
      if (saved.override === null) sessionStorage.removeItem('folia.test.mockPreferences');
      else sessionStorage.setItem('folia.test.mockPreferences', saved.override);
    }, saved);
    await emit('windowState', { maximized: false, fullscreen: false, clickThrough: false }); await emit('restore', {});
    await emit('session', song);
    await emit('lyrics', { key: song.key, title: song.title, artist: song.artist, content: '[00:01.00]玻璃界面验证\n[00:33.00]保留原版动效\n[01:30.00]下一行歌词',
      source: '玻璃界面验证', cover: '', embedded: false, format: 'lrc' });
    await page.locator('.waiting-screen').waitFor({ state: 'detached' });
  }
}
