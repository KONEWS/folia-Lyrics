import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { topbarAction } from './desktop-topbar-actions.mjs';

// test/verify-ux-polish.mjs — compact chrome, clearer settings and accurate waiting-state fixtures.
const emit = (page, type, data) => page.evaluate(({ type, data }) => window.__foliaEmit(type, data), { type, data });
const frame = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));

// Preserve comparable rectangles and visible content from the old build, without running the integration suites.
export async function captureUxBaseline(page, song, output) {
  const samples = [];
  const snapshot = async context => {
    await frame(page);
    const sample = await page.evaluate(() => {
      const box = selector => { const element = document.querySelector(selector); return element && { bounds: element.getBoundingClientRect().toJSON(), text: element.textContent.trim(),
        font: getComputedStyle(element).font, visible: getComputedStyle(element).visibility, display: getComputedStyle(element).display }; };
      return { viewport: { width: innerWidth, height: innerHeight }, topbar: box('.desktop-topbar'), footer: box('.desktop-statusbar'),
        caption: box('.track-caption'), clock: box('.clock-readout'), playback: box('.playback-controls'), waiting: box('.waiting-screen'), panel: box('.control-panel'),
        sectionLabels: [...document.querySelectorAll('.control-panel .section-label')].map(element => element.textContent.trim()),
        buttons: [...document.querySelectorAll('.desktop-topbar button,.restore-controls')].map(button => ({ label: button.getAttribute('aria-label'), bounds: button.getBoundingClientRect().toJSON() })) };
    });
    samples.push({ context, ...sample });
    await page.screenshot({ path: `${output}/ux-baseline-${context}.png` });
  };
  for (const [width, height] of [[1280, 800], [450, 300]]) {
    await page.setViewportSize({ width, height }); await snapshot(`playback-${width}x${height}`);
    await page.getByRole('button', { name: '打开歌词设置', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.control-panel')?.getAnimations().every(animation => animation.playState === 'finished'));
    await snapshot(`settings-${width}x${height}`); await page.locator('.desktop-topbar [data-settings-trigger]').click();
  }
  await emit(page, 'session', { ...song, key: '', title: '', artist: '', source: '', sources: [], sessionId: '', playing: false, position: 0, duration: 0, hasTimeline: false, controls: null });
  await page.locator('.waiting-screen').waitFor();
  for (const [width, height] of [[1280, 800], [450, 300]]) { await page.setViewportSize({ width, height }); await snapshot(`waiting-${width}x${height}`); }
  await writeFile(`${output}/ux-baseline-results.json`, JSON.stringify({ samples }, null, 2));
  console.log('PASS read-only old-build UX geometry baseline');
  assert.equal(samples.length, 6);
}

// Exercise compact controls and waiting-page actions through the same in-memory host as the regression runner.
export async function verifyUxPolish(page, song, output) {
  const checks = [], samples = [], viewport = page.viewportSize();
  const saved = await page.evaluate(() => ({ prefs: window.__foliaMockPreferences(), translated: document.querySelector('[aria-label="显示译文"]')?.getAttribute('aria-pressed') !== 'false' }));
  const prefs = values => page.evaluate(values => window.__foliaSetMockPreferences(values), values);
  const open = () => page.locator('.desktop-topbar').getByRole('button', { name: '打开歌词设置', exact: true }).click();
  const close = async () => { if (await page.locator('.control-panel').count()) await page.keyboard.press('Escape'); await page.locator('.control-panel').waitFor({ state: 'detached' }); };
  const menu = page.getByRole('menu', { name: '更多操作', exact: true });
  const more = page.getByRole('button', { name: '更多操作', exact: true });
  const packet = { key: song.key, title: song.title, artist: song.artist, source: '精简界面验证来源', format: 'lrc', embedded: false, cover: '', content: '[00:01.00]音乐在播放\n[00:33.00]保留原版歌词和译文\n[00:42.00]下一行歌词', translation: '[00:33.00]这是译文' };
  const seed = async () => { await emit(page, 'session', song); await emit(page, 'lyrics', packet); await page.locator('.waiting-screen').waitFor({ state: 'detached' }); };
  const visible = (selector, value) => page.waitForFunction(({ selector, value }) => getComputedStyle(document.querySelector(selector)).visibility === (value ? 'visible' : 'hidden'), { selector, value });
  const closedMenu = () => page.locator('.desktop-more-menu').waitFor({ state: 'detached' });
  // Test real hit testing rather than mere DOM presence, including controls inside short scrolling panels.
  const hit = async (locator, context, scroll = false) => {
    if (scroll) await locator.scrollIntoViewIfNeeded(); await frame(page);
    const geometry = await locator.evaluate(element => { const bounds = element.getBoundingClientRect(), target = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      return { bounds: bounds.toJSON(), reachable: target === element || element.contains(target), width: innerWidth, height: innerHeight }; });
    assert(geometry.reachable && geometry.bounds.x >= 0 && geometry.bounds.y >= 0 && geometry.bounds.right <= geometry.width && geometry.bounds.bottom <= geometry.height, `${context}: visible control center is reachable`);
    samples.push({ context, ...geometry }); return geometry.bounds;
  };
  const shoot = name => page.screenshot({ path: `${output}/ux-${name}.png` });
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await emit(page, 'windowState', { maximized: false, fullscreen: false, clickThrough: false }); await emit(page, 'restore', {}); await close();
    await prefs({ autoImmersive: false, immersiveDelay: 30, bottomHoverControls: true, onlineEnabled: true, onlineProviders: ['kugou', 'qq', 'netease', 'lrclib'], topmost: false }); await seed();
    for (const [width, height] of [[1280, 800], [450, 300]]) {
      await page.setViewportSize({ width, height }); await frame(page);
      const layout = await page.evaluate(() => { const box = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
        return { topbar: box('.desktop-topbar'), footer: box('.desktop-statusbar'), caption: box('.track-caption'),
          footerText: document.querySelector('.desktop-statusbar').textContent, song: document.querySelector('.track-caption strong').textContent,
          artist: document.querySelector('.track-caption small')?.textContent, overflow: document.documentElement.scrollWidth > innerWidth,
          footerStrong: document.querySelectorAll('.desktop-statusbar strong,.desktop-statusbar small,.status-right').length, eyeCount: document.querySelectorAll('.restore-controls').length }; });
      assert.equal(layout.song, song.title); assert.equal(layout.artist, song.artist); assert.equal(layout.footerStrong, 0);
      for (const duplicate of [song.title, song.artist, packet.source]) assert(!layout.footerText.includes(duplicate), `footer has no duplicate ${duplicate}`);
      assert.equal(layout.overflow, false); assert.equal(layout.eyeCount, 1); assert(layout.footer.top > layout.topbar.bottom);
      assert.match(await page.locator('.clock-readout').innerText(), /^0:36/);
      for (const control of [page.getByRole('combobox', { name: '歌词样式', exact: true }), page.getByRole('button', { name: '打开歌词设置', exact: true }), page.locator('.restore-controls'), ...['上一首', '继续播放音乐', '下一首'].map(name => page.getByRole('button', { name, exact: true }))]) await hit(control, `${width}x${height} ${await control.getAttribute('aria-label')}`);
      if (width === 450) {
        assert(layout.topbar.height <= 44, 'compact topbar fits a 42px row'); assert(layout.footer.height <= 64, 'compact transport leaves the stage substantially taller');
        assert(layout.footer.top - layout.topbar.bottom >= 140, '450x300 leaves at least 140px between compact bars, versus 80px in the baseline');
        assert.equal(await page.getByRole('button', { name: '显示译文', exact: true }).count(), 0); await hit(more, 'compact More');
      } else assert.equal(await more.count(), 0);
      samples.push({ context: `chrome-${width}x${height}`, ...layout }); await shoot(`chrome-${width}x${height}`);
    }
    checks.push('1280 and 450 chrome keep song information at the top, time/transport at the bottom and reachable essential controls');

    await page.setViewportSize({ width: 1280, height: 800 }); await open();
    assert.deepEqual(await page.locator('.control-panel [data-settings-section]').evaluateAll(elements => elements.map(element => element.dataset.settingsSection)), ['transparency', 'sync', 'player', 'immersion', 'window-sound', 'online', 'local']);
    assert.equal(await page.locator('.control-panel').evaluate(element => element.firstElementChild.dataset.settingsSection), 'transparency');
    assert.equal(await page.locator('.control-panel .panel-heading').count(), 0);
    assert.equal(await page.locator('.control-panel [aria-label="歌词样式"]').count(), 0);
    await hit(page.getByRole('checkbox', { name: '播放页面透明背景', exact: true }), 'first transparent setting', true);
    await hit(page.getByRole('button', { name: '歌词提前 0.2 秒', exact: true }), 'early lyric synchronization', true);
    await hit(page.getByRole('combobox', { name: '选择播放器', exact: true }), 'early player setting', true);
    assert.match(await page.locator('.current-lyric-source').innerText(), /精简界面验证来源/);
    const helps = page.locator('.control-panel .settings-help'); assert.equal(await helps.count(), 6);
    for (const help of await helps.all()) {
      assert.equal(await help.getAttribute('open'), null); assert.equal(await help.locator('p').first().isVisible(), false);
      await help.locator(':scope > summary').click(); assert(await help.locator('p').first().isVisible()); await help.locator(':scope > summary').click();
    }
    assert.equal(await page.locator('.lyric-source-settings').getAttribute('open'), null);
    await page.locator('.control-panel').evaluate(element => { element.scrollTop = 0; }); await shoot('settings-folded');
    await close(); await page.setViewportSize({ width: 450, height: 300 }); await open();
    for (const control of [page.getByRole('checkbox', { name: '播放页面透明背景', exact: true }), page.getByRole('button', { name: '歌词提前 0.2 秒', exact: true }), page.getByRole('combobox', { name: '选择播放器', exact: true })]) await hit(control, 'short panel reachable setting', true);
    await page.locator('.control-panel').evaluate(element => { element.scrollTop = 0; }); await shoot('settings-450x300'); await close();
    checks.push('seven settings groups prioritize transparency, sync and player; six long explanations fold by default and still open in a short window');

    await page.setViewportSize({ width: 1280, height: 800 });
    for (const [name, titleOn, titleOff] of [['显示译文', '译文已开启', '译文已关闭'], ['窗口置顶', '窗口已置顶', '窗口未置顶']]) {
      const action = page.getByRole('button', { name, exact: true });
      for (let step = 0; step < 2; step++) { const before = await action.getAttribute('aria-pressed') === 'true'; await action.click(); await frame(page); const on = await action.getAttribute('aria-pressed') === 'true';
        assert.equal(on, !before, `${name}: the actual shortcut toggles its state`);
        assert.equal(await action.getAttribute('title'), on ? titleOn : titleOff); assert.equal(await action.locator('.topbar-state-check,.lucide-check').count(), 0);
        if (name === '窗口置顶' && on) await shoot('wide-state-on-without-check'); }
    }
    await shoot('wide-state-without-check');
    checks.push('wide translation and pin controls toggle pressed state with accurate state titles and no checkmarks');

    await page.setViewportSize({ width: 450, height: 300 }); await more.click(); await menu.waitFor();
    assert.equal(await menu.locator('button').count(), 4);
    const menuBox = await menu.boundingBox(); assert(menuBox.x >= 8 && menuBox.y >= 8 && menuBox.x + menuBox.width <= 442 && menuBox.y + menuBox.height <= 292);
    for (const item of await menu.locator('button').all()) await hit(item, `More ${await item.getAttribute('aria-label')}`);
    for (const name of ['显示译文', '窗口置顶']) { const item = menu.getByRole('menuitemcheckbox', { name, exact: true }); const checked = await item.getAttribute('aria-checked') === 'true';
      const state = name === '显示译文' ? checked ? '译文已开启' : '译文已关闭' : checked ? '窗口已置顶' : '窗口未置顶';
      assert.equal(await item.locator('.topbar-more-copy small').innerText(), state); assert.equal(await item.getAttribute('title'), state);
      assert.equal(await item.locator('.topbar-more-check svg,.lucide-check').count(), 0); }
    await shoot('more-450x300'); await page.keyboard.press('Escape'); await closedMenu(); assert.equal(await more.getAttribute('aria-expanded'), 'false');
    const mediaBefore = await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'mediaControl').length);
    await more.focus(); await page.keyboard.press('Space'); await menu.waitFor(); await page.keyboard.press('ArrowDown');
    assert(await menu.evaluate(element => element.contains(document.activeElement))); await page.keyboard.press('Escape'); await closedMenu();
    assert.equal(await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'mediaControl').length), mediaBefore);
    for (const name of ['显示译文', '窗口置顶']) {
      for (let step = 0; step < 2; step++) {
        const item = await topbarAction(page, name), before = await item.getAttribute('aria-checked') === 'true'; await item.click(); await closedMenu();
        assert(await more.evaluate(element => element === document.activeElement));
        const updated = await topbarAction(page, name), on = await updated.getAttribute('aria-checked') === 'true';
        assert.equal(on, !before, `${name}: compact command toggles its actual state`);
        const state = name === '显示译文' ? on ? '译文已开启' : '译文已关闭' : on ? '窗口已置顶' : '窗口未置顶';
        assert.equal(await updated.locator('.topbar-more-copy small').innerText(), state); assert.equal(await updated.getAttribute('title'), state);
        assert.equal(await updated.locator('.topbar-more-check svg,.lucide-check').count(), 0);
        if (name === '窗口置顶' && on) await shoot('compact-state-on-without-check');
        await page.keyboard.press('Escape'); await closedMenu();
      }
    }
    await more.click(); await menu.waitFor(); await page.setViewportSize({ width: 1280, height: 800 }); await closedMenu(); assert.equal(await more.count(), 0);
    checks.push('compact More toggles accurate semantic and text states without checkmarks, retaining bounds, keyboard, Escape and focus restoration');

    await page.setViewportSize({ width: 450, height: 300 }); await page.getByRole('button', { name: '沉浸显示', exact: true }).click();
    await page.mouse.move(225, 150); await visible('.desktop-topbar', false); await page.mouse.move(225, 16); await visible('.desktop-topbar', true);
    await more.click(); await menu.waitFor(); const anchor = await more.boundingBox(), target = await menu.locator('button').last().boundingBox();
    const x = anchor.x + anchor.width / 2, start = anchor.y + anchor.height / 2, finish = target.y + target.height / 2;
    for (let step = 1; step <= 20; step++) { await page.mouse.move(x + (target.x + target.width / 2 - x) * step / 20, start + (finish - start) * step / 20);
      assert.equal(await more.getAttribute('aria-expanded'), 'true', `immersive More survives pointer step ${step}`); }
    assert.equal(await page.locator('.top-controls-revealed').count(), 1); await visible('.desktop-statusbar', false);
    await page.mouse.move(20, 150); await closedMenu(); await visible('.desktop-topbar', false);
    await page.mouse.move(225, 294); await visible('.desktop-statusbar', true); await visible('.desktop-topbar', false);
    await page.mouse.move(225, 16); await more.click(); await menu.waitFor();
    await emit(page, 'windowState', { maximized: false, fullscreen: false, clickThrough: true }); await closedMenu(); await visible('.desktop-topbar', false);
    await emit(page, 'windowState', { maximized: false, fullscreen: false, clickThrough: false }); await emit(page, 'restore', {});
    await prefs({ immersiveDelay: 1 }); await page.getByRole('button', { name: '沉浸显示', exact: true }).click(); await page.mouse.move(226, 16); await more.click(); await menu.waitFor();
    await page.locator('.immersive.cursor-idle').waitFor(); await closedMenu(); await visible('.desktop-topbar', false);
    await emit(page, 'restore', {}); await prefs({ immersiveDelay: 30 });
    checks.push('immersive More survives the trigger gap and menu pointer path, leaves cleanly and obeys independent bottom hover, click-through and idle hiding');

    const empty = { key: '', busy: false, phase: 'idle', message: '', errors: [], selectedKey: '', candidates: [] };
    const noPlayer = { ...song, key: '', title: '', artist: '', source: '', sources: [], sessionId: '', position: 0, duration: 0, hasTimeline: false, controls: null };
    const waitingSong = { ...song, key: 'ux-wait-song', title: '等待状态测试歌曲', artist: '状态测试歌手' };
    const fixture = async (session, online) => { await close(); await emit(page, 'session', session); await emit(page, 'online', online); await frame(page); };
    const waiting = async (kind, context) => {
      await page.locator(`.waiting-screen[data-wait-state="${kind}"]`).waitFor(); const primary = page.locator('.waiting-primary-action');
      assert.equal(await primary.count(), 1); assert(await primary.isEnabled());
      assert.equal(await page.locator('.waiting-alternatives').getAttribute('open'), null);
      assert((await page.locator('.waiting-screen h1').innerText()).trim()); assert((await page.locator('.waiting-description').innerText()).trim());
      await hit(primary, `${context} primary`, true); const sample = await page.locator('.waiting-screen').evaluate(element => ({ state: element.dataset.waitState, text: element.innerText, action: element.querySelector('.waiting-primary-action').textContent.trim(), scrollTop: element.scrollTop }));
      samples.push({ context, ...sample }); await shoot(context); return primary;
    };
    for (const [width, height] of [[1280, 800], [450, 300]]) {
      await page.setViewportSize({ width, height });
      await fixture(noPlayer, empty); let primary = await waiting('no-player', `waiting-no-player-${width}x${height}`); await primary.click();
      await hit(page.getByRole('combobox', { name: '选择播放器', exact: true }), 'no-player action scrolls to player');
      await hit(page.locator('.desktop-topbar [data-settings-trigger]'), 'focused player panel keeps its topbar toggle reachable'); await close();
      await fixture(waitingSong, { ...empty, key: waitingSong.key }); primary = await waiting('connected-empty', `waiting-connected-${width}x${height}`); await primary.click();
      for (const control of [page.getByLabel('在线搜索歌名'), page.getByLabel('在线搜索歌手'), page.locator('.control-panel').getByRole('button', { name: '搜索在线歌词', exact: true }), page.locator('.desktop-topbar [data-settings-trigger]')]) await hit(control, 'connected action reveals online form and topbar toggle'); await close();
      await fixture(waitingSong, { ...empty, key: waitingSong.key, busy: true, phase: 'matching', message: '正在匹配在线歌词' }); primary = await waiting('matching', `waiting-matching-${width}x${height}`); await primary.click();
      assert.equal(await page.locator('.online-status.busy').count(), 1); await close();
      await fixture(waitingSong, { ...empty, key: waitingSong.key, phase: 'failed' }); primary = await waiting('failed', `waiting-failed-${width}x${height}`);
      assert.match(await page.locator('.waiting-track').innerText(), /等待状态测试歌曲/); const before = await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'resetOnline').length); await primary.click();
      assert.equal(await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'resetOnline').length), before + 1);
    }
    checks.push('both viewport sizes expose one actionable primary for no-player, connected-empty, matching and explicit no-result failure');
    await fixture(waitingSong, { ...empty, key: waitingSong.key, phase: 'matching', busy: false }); await page.locator('.waiting-screen[data-wait-state="matching"]').waitFor();
    await fixture(waitingSong, { ...empty, key: waitingSong.key, phase: 'ready', errors: ['另一歌词源部分失败'] }); await page.locator('.waiting-screen[data-wait-state="connected-empty"]').waitFor();
    const legacy = { ...empty, key: waitingSong.key }; delete legacy.phase; await fixture(waitingSong, legacy); await page.locator('.waiting-screen[data-wait-state="connected-empty"]').waitFor();
    await emit(page, 'online', { ...empty, key: 'previous-song', phase: 'failed', errors: ['旧歌曲失败'] }); await page.locator('.waiting-screen[data-wait-state="connected-empty"]').waitFor();
    checks.push('busy-false matching phase, partial errors after ready, legacy empty replies and stale-song phases produce accurate waiting states');
    await prefs({ onlineEnabled: false }); await fixture(waitingSong, { ...empty, key: waitingSong.key }); const offline = await waiting('connected-empty', 'waiting-offline');
    const offlineLabel = await offline.innerText();
    const imports = await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'import').length); await offline.click();
    assert.equal(await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'import').length), imports + 1);
    await page.locator('.waiting-alternatives > summary').click(); assert(await page.locator('.waiting-alternatives button').first().isVisible()); await shoot('waiting-alternatives');
    await page.locator('.waiting-alternatives > summary').click();
    checks.push('online-disabled waiting imports local lyrics and secondary alternatives remain available behind a closed disclosure');
    await open();
    const retry = page.getByRole('button', { name: '重新自动匹配', exact: true });
    const beforeRetry = await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'resetOnline').length);
    assert(await retry.isDisabled()); await prefs({ onlineEnabled: true, onlineProviders: [] }); assert(await retry.isDisabled());
    assert.equal(await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'resetOnline').length), beforeRetry);
    await close(); await fixture(waitingSong, { ...empty, key: waitingSong.key });
    const noSources = await waiting('connected-empty', 'waiting-no-sources'); assert.equal(await noSources.innerText(), offlineLabel);
    assert.match(await page.locator('.waiting-description').innerText(), /尚未启用歌词来源/);
    await prefs({ onlineEnabled: true, onlineProviders: ['kugou', 'qq', 'netease', 'lrclib'] });
    await page.setViewportSize({ width: 1280, height: 800 }); await emit(page, 'notice', { text: '宿主待处理提示应保留' });
    await emit(page, 'lyrics', { ...packet, key: waitingSong.key, content: '没有任何时间轴的无效歌词' });
    await page.locator('.waiting-screen[data-wait-state="failed"]').waitFor();
    const invalidImports = await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'import').length);
    await page.locator('.waiting-primary-action').click();
    assert.equal(await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'import').length), invalidImports + 1);
    await emit(page, 'session', { ...waitingSong, key: 'ux-next-song', title: '下一首清理解析提示' });
    await page.locator('.waiting-screen[data-wait-state="connected-empty"]').waitFor();
    assert.match(await page.locator('.desktop-notice').innerText(), /宿主待处理提示应保留/);
    assert(!/解析失败|未找到时间轴/.test(await page.locator('.desktop-notice').innerText()), 'old parse failure clears while an independent host notice survives the song change');
    await emit(page, 'notice', { text: '' });
    checks.push('offline and zero-source retry actions are disabled; invalid parsed content offers import and clears its error on song change');
    await writeFile(`${output}/ux-polish-results.json`, JSON.stringify({ checks, samples }, null, 2));
    console.log(`PASS UX polish: ${checks.length} check groups`); return checks;
  } catch (error) {
    await writeFile(`${output}/ux-polish-failure.json`, JSON.stringify({ checks, samples, error: String(error) }, null, 2));
    throw error;
  } finally {
    await emit(page, 'notice', { text: '' });
    await emit(page, 'windowState', { maximized: false, fullscreen: false, clickThrough: false }); await emit(page, 'restore', {}); await close();
    await page.setViewportSize({ width: 1280, height: 800 }); await prefs(saved.prefs); await seed();
    const translated = page.getByRole('button', { name: '显示译文', exact: true });
    if ((await translated.getAttribute('aria-pressed') === 'true') !== saved.translated) await translated.click();
    await page.setViewportSize(viewport);
  }
}
