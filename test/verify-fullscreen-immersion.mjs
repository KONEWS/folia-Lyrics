import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { desktopSelect, selectDesktopOption } from './desktop-select.mjs';

// test/verify-fullscreen-immersion.mjs — real mouse paths to fullscreen immersive controls and settings.
const frame = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const emit = (page, type, data) => page.evaluate(({ type, data }) => window.__foliaEmit(type, data), { type, data });

// Keep native window state, rendered visibility and actual hit targets in the same browser evidence.
const snapshot = page => page.evaluate(() => {
  const root = document.querySelector('.desktop-lyrics');
  const appearance = selector => {
    const element = root.querySelector(selector), style = getComputedStyle(element);
    return { opacity: Number(style.opacity), visibility: style.visibility, pointerEvents: style.pointerEvents,
      bounds: element.getBoundingClientRect().toJSON() };
  };
  return { classes: root.className, immersive: root.classList.contains('immersive'), fullscreen: root.classList.contains('native-fullscreen'),
    top: root.classList.contains('top-controls-revealed'), bottom: root.classList.contains('controls-revealed'),
    topbar: appearance('.desktop-topbar'), footer: appearance('.desktop-statusbar'), chrome: appearance('.window-chrome'),
    windows: root.querySelectorAll('.window-buttons,.window-edge').length,
    menuCount: root.querySelectorAll('.desktop-top-menu').length, focused: document.activeElement?.outerHTML.slice(0, 500) };
});

export async function verifyFullscreenImmersion(page, song, output) {
  const checks = [], samples = [], viewport = page.viewportSize();
  const saved = await page.evaluate(() => ({ prefs: window.__foliaMockPreferences(), mode: localStorage.getItem('folia.desktop.mode.v1') }));
  // Mock messages are synchronous; wait for React to commit and replace effects before the next real mouse event.
  const prefs = async values => {
    await page.evaluate(values => window.__foliaSetMockPreferences(values), values); await frame(page);
  };
  const windowState = async (fullscreen = true, clickThrough = false) => {
    await emit(page, 'windowState', { fullscreen, maximized: false, clickThrough }); await frame(page);
  };
  const centre = () => page.mouse.move(8, page.viewportSize().height / 2);
  const topEdge = () => page.mouse.move(page.viewportSize().width / 2, 2);
  const bottomEdge = () => page.mouse.move(page.viewportSize().width / 2, page.viewportSize().height - 2);
  const commands = () => page.evaluate(() => window.__foliaCommands.filter(command => ['systemVolume', 'mediaControl', 'fullscreen', 'exitFullscreen', 'window'].includes(command.type)));
  const record = async context => { const sample = { context, ...await snapshot(page) }; samples.push(sample); return sample; };
  const quiet = async (action, context) => {
    const before = await commands(); await action(); await frame(page);
    assert.deepEqual(await commands(), before, `${context}: exposing or scrolling settings must not send playback, volume or native window commands`);
  };
  // Wait for the real CSS transition, then assert both bars independently rather than trusting only a root class.
  const revealed = async (top, bottom, context) => {
    await page.waitForFunction(({ top, bottom }) => {
      const root = document.querySelector('.desktop-lyrics');
      const matches = (selector, expected) => {
        const style = getComputedStyle(root.querySelector(selector));
        return expected ? Number(style.opacity) >= .98 && style.visibility === 'visible' && style.pointerEvents !== 'none'
          : Number(style.opacity) <= .02 && style.visibility === 'hidden' && style.pointerEvents === 'none';
      };
      return root.classList.contains('top-controls-revealed') === top && root.classList.contains('controls-revealed') === bottom
        && matches('.desktop-topbar', top) && matches('.desktop-statusbar', bottom);
    }, { top, bottom });
    const sample = await record(context);
    assert(sample.immersive && sample.fullscreen, `${context}: edge movement preserves immersive native fullscreen`);
    assert.equal(sample.top, top); assert.equal(sample.bottom, bottom); assert.equal(sample.windows, 0);
    assert.equal(sample.chrome.visibility, 'hidden'); assert.equal(sample.chrome.pointerEvents, 'none');
  };
  const reachable = async (locator, context) => {
    const bounds = await locator.boundingBox(); assert(bounds, `${context}: rendered control has bounds`);
    const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    assert(await locator.evaluate((element, point) => document.elementFromPoint(point.x, point.y)?.closest('button') === element, point),
      `${context}: the visible control owns its actual mouse hit target`);
  };
  const enter = async () => {
    await emit(page, 'restore', {}); await windowState();
    await page.getByRole('button', { name: '沉浸显示', exact: true }).click(); await centre();
    await revealed(false, false, 'fullscreen-immersive-hidden');
  };
  const closePanel = async () => {
    const trigger = page.locator('[data-settings-trigger]');
    await trigger.click(); await page.locator('.control-panel').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.native-fullscreen').count(), 1, 'closing main settings through its entry preserves native fullscreen');
    assert(await trigger.evaluate(element => element === document.activeElement), 'closing main settings returns focus to its entry');
  };
  let stage = 'fixture';
  try {
    await windowState(false); await emit(page, 'restore', {});
    if (await page.locator('.control-panel').count()) await page.keyboard.press('Escape');
    await prefs({ autoImmersive: false, immersiveDelay: 30, bottomHoverControls: true, audioReactive: false });
    await emit(page, 'session', { ...song, playing: false, position: 36 });
    await emit(page, 'lyrics', { key: song.key, title: song.title, artist: song.artist, cover: '', embedded: false, format: 'lrc',
      content: '[00:01.00]全屏沉浸边缘呼出\n[00:33.00]保留歌词与设置操作\n[01:30.00]下一行歌词', source: '全屏沉浸验证' });
    await page.locator('.waiting-screen').waitFor({ state: 'detached' });
    await selectDesktopOption(page, '歌词样式', { value: 'classic' });

    for (const [width, height] of [[1280, 800], [450, 300]]) {
      const context = `${width}x${height}`; stage = `${context}-edges`;
      await page.setViewportSize({ width, height }); await enter();
      await quiet(async () => {
        await topEdge(); await revealed(true, false, `${context}-top`);
        await reachable(page.locator('[data-settings-trigger]'), `${context}-main-settings`);
        await reachable(page.locator('[data-background-settings-trigger]'), `${context}-background-settings`);
        await page.screenshot({ path: `${output}/fullscreen-immersion-${context}-top.png` });
        await page.locator('[data-settings-trigger]').hover(); await revealed(true, false, `${context}-top-button`);
        await centre(); await revealed(false, false, `${context}-top-retracted`);
        await bottomEdge(); await revealed(false, true, `${context}-bottom`);
        await reachable(page.locator('.transport-primary'), `${context}-playback`);
        await page.locator('.transport-primary').hover(); await revealed(false, true, `${context}-playback-button`);
        await page.screenshot({ path: `${output}/fullscreen-immersion-${context}-bottom.png` });
        await centre(); await revealed(false, false, `${context}-bottom-retracted`);
      }, `${context} real top/bottom mouse movement`);
      checks.push(`${context}: top and bottom mouse edges independently expose real settings and playback hit targets, preserve immersive fullscreen and retract over blank lyrics without window buttons or commands`);

      stage = `${context}-main-settings`; await topEdge(); await revealed(true, false, `${context}-before-main-settings`);
      await quiet(async () => {
        await page.locator('[data-settings-trigger]').click(); await page.locator('.desktop-main-settings').waitFor();
        assert.equal(await page.locator('.immersive').count(), 0, 'opening main settings restores ordinary controls');
        assert.equal(await page.locator('.native-fullscreen').count(), 1);
        const scroll = page.locator('.desktop-main-settings > .desktop-settings-scroll');
        await scroll.evaluate(element => { element.scrollTop = 0; }); await scroll.hover(); await page.mouse.wheel(0, 300);
        await page.waitForFunction(() => document.querySelector('.desktop-main-settings > .desktop-settings-scroll')?.scrollTop > 0);
        assert.equal(await page.locator('.top-controls-revealed,.controls-revealed').count(), 0);
        await page.screenshot({ path: `${output}/fullscreen-immersion-${context}-settings.png` });
        await closePanel();
      }, `${context} main settings entry and internal scrolling`);
      checks.push(`${context}: revealed main settings open in one click, scroll normally and close through the same entry while retaining native fullscreen and entry focus`);

      stage = `${context}-background-settings`; await enter(); await topEdge();
      await quiet(async () => {
        await page.locator('[data-background-settings-trigger]').click(); await page.locator('.desktop-background-settings').waitFor();
        assert.equal(await page.locator('.native-fullscreen').count(), 1); assert.equal(await page.locator('.immersive').count(), 0);
        await page.getByRole('button', { name: '关闭背景设置', exact: true }).click();
        await page.locator('.desktop-background-settings').waitFor({ state: 'detached' });
        assert(await page.locator('[data-background-settings-trigger]').evaluate(element => element === document.activeElement));
      }, `${context} background settings entry`);
      checks.push(`${context}: the revealed background button opens its original settings, retains native fullscreen and receives focus on close`);
    }

    stage = 'fullscreen-menu'; await enter(); await topEdge(); await revealed(true, false, 'menu-top-edge');
    const trigger = desktopSelect(page, '歌词样式');
    await trigger.click(); const menu = page.locator('.desktop-top-menu'); await menu.waitFor();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.desktop-top-menu')).opacity === '1');
    const anchor = await trigger.boundingBox(), option = await menu.getByRole('option').first().boundingBox(); assert(anchor && option);
    await quiet(async () => {
      for (let step = 0; step <= 8; step++) {
        await page.mouse.move(anchor.x + anchor.width / 2, anchor.y + anchor.height / 2
          + (option.y + option.height / 2 - anchor.y - anchor.height / 2) * step / 8);
        await frame(page); assert.equal(await trigger.getAttribute('aria-expanded'), 'true', `menu pointer path ${step}: selector stays open`);
        await revealed(true, false, `menu-pointer-path-${step}`);
      }
      const scroll = menu.locator('.custom-select-options-scroll'); await scroll.hover(); await page.mouse.wheel(0, 800);
      await page.waitForFunction(() => document.querySelector('.desktop-top-menu .custom-select-options-scroll')?.scrollTop > 0);
      await revealed(true, false, 'menu-internal-scroll');
      const lastValue = await menu.getByRole('option').last().getAttribute('data-value');
      await trigger.focus(); await page.keyboard.press('End');
      await page.waitForFunction(value => document.activeElement?.getAttribute('data-value') === value, lastValue);
      await revealed(true, false, 'menu-keyboard-focus');
      await page.screenshot({ path: `${output}/fullscreen-immersion-narrow-menu.png` });
      await page.keyboard.press('Escape'); await menu.waitFor({ state: 'detached' });
      assert.equal(await page.locator('.native-fullscreen').count(), 1); await centre(); await revealed(false, false, 'menu-departure');
    }, 'immersive fullscreen menu pointer bridge, wheel and keyboard navigation');
    checks.push('narrow fullscreen immersion preserves the real trigger-to-option mouse path, scrolling and keyboard focus within the style menu; Escape closes the menu before leaving fullscreen');

    stage = 'bottom-preference'; await prefs({ bottomHoverControls: false }); await centre();
    await quiet(async () => {
      await bottomEdge(); await revealed(false, false, 'bottom-preference-off');
      await topEdge(); await revealed(true, false, 'top-with-bottom-disabled');
      await prefs({ bottomHoverControls: true }); await bottomEdge(); await revealed(false, true, 'bottom-preference-restored');
    }, 'bottom hover preference');
    checks.push('disabling bottom hover suppresses only the playback bar; top settings remain reachable and re-enabling restores the bottom bar');

    stage = 'window-leave'; await topEdge(); await trigger.click(); await menu.waitFor();
    await page.mouse.move(-8, -8); await revealed(false, false, 'mouse-left-webview'); await menu.waitFor({ state: 'detached' });
    assert(await page.evaluate(() => !document.activeElement?.closest('.desktop-topbar-shell,.desktop-top-menu,.desktop-statusbar')));
    checks.push('leaving the WebView retracts both fullscreen immersive bars and dismisses its menu focus');

    stage = 'click-through'; await topEdge(); await revealed(true, false, 'before-click-through');
    await windowState(true, true); await revealed(false, false, 'click-through-active');
    await quiet(async () => { await bottomEdge(); await topEdge(); await revealed(false, false, 'click-through-no-hover'); }, 'click-through mouse edges');
    await windowState(); await centre(); await topEdge(); await revealed(true, false, 'click-through-restored');
    checks.push('mouse click-through clears revealed controls and blocks edge hover until native interaction is restored');

    stage = 'idle'; await prefs({ immersiveDelay: 1 }); await trigger.click(); await menu.waitFor();
    await page.locator('.immersive.native-fullscreen.cursor-idle').waitFor({ timeout: 7000 });
    await menu.waitFor({ state: 'detached' }); await revealed(false, false, 'idle-retracted');
    await prefs({ immersiveDelay: 30 }); await centre(); await topEdge(); await revealed(true, false, 'idle-mouse-recovered');
    checks.push('the real idle deadline retracts bars and menu focus while keeping fullscreen immersion; fresh edge movement restores the top controls');
    await writeFile(`${output}/fullscreen-immersion-results.json`, JSON.stringify({ checks, samples }, null, 2));
    console.log(`PASS fullscreen immersive mouse edges: ${checks.length} checks`); return checks;
  } catch (error) {
    await writeFile(`${output}/fullscreen-immersion-primary-failure.json`, JSON.stringify({ stage, error: String(error), checks, samples,
      snapshot: await snapshot(page) }, null, 2));
    await page.screenshot({ path: `${output}/fullscreen-immersion-primary-failure.png` }); throw error;
  } finally {
    if (await page.locator('.desktop-top-menu').count()) await page.keyboard.press('Escape');
    if (await page.locator('.control-panel').count()) await page.keyboard.press('Escape');
    await windowState(false); await emit(page, 'restore', {}); await prefs(saved.prefs); await page.setViewportSize(viewport);
    if (saved.mode && await desktopSelect(page, '歌词样式').getAttribute('data-value') !== saved.mode)
      await selectDesktopOption(page, '歌词样式', { value: saved.mode });
  }
}
