import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { selectDesktopOption } from './desktop-select.mjs';
import { verifyImmersiveToggleIdle } from './verify-immersive-toggle-idle.mjs';

// test/verify-lyrics-chrome-layout.mjs — one anchored immersion toggle and real shared subtitle clearance.
export async function verifyLyricsChromeLayout(page, song, output) {
  const checks = [], geometry = [];
  let pointer = { x: 640, y: 400 };
  const emit = (type, data) => page.evaluate(({ type, data }) => window.__foliaEmit(type, data), { type, data });
  const toggle = page.locator('.restore-controls');
  const subtitle = page.locator('[data-font-debug-target="visualizer-translation"]');
  const packet = { key: song.key, title: song.title, artist: song.artist, cover: '', embedded: false, format: 'lrc',
    content: '[00:01.00]原版歌词布局验证\n[00:20.00]控制栏独立呼出\n[00:33.00]保留真实共享字幕\n[01:30.00]下一句歌词',
    translation: '[00:01.00]译文第一句\n[00:20.00]译文第二句\n[00:33.00]译文不能被播放控件遮挡\n[01:30.00]译文第四句', source: '字幕避让验证' };
  const saved = await page.evaluate(() => ({ hidden: localStorage.getItem('hide_player_progress_bar'),
    mode: localStorage.getItem('folia.desktop.mode.v1') }));
  const visibility = (selector, visible) => page.waitForFunction(({ selector, visible }) => {
    const element = document.querySelector(selector);
    return element && getComputedStyle(element).visibility === (visible ? 'visible' : 'hidden');
  }, { selector, visible });
  const seed = async () => {
    await emit('windowState', { maximized: false, fullscreen: false, clickThrough: false });
    await emit('restore', {});
    await emit('preferences', { autoImmersive: false, immersiveDelay: 30, bottomHoverControls: true });
    await emit('session', { ...song, position: 36, playing: false });
    await emit('lyrics', packet);
    await page.locator('.waiting-screen').waitFor({ state: 'detached' });
  };
  // Wait for the original MotionValue spring and CSS transitions to settle, rather than reading an intermediate frame.
  const settle = async () => {
    await subtitle.waitFor({ timeout: 60000 });
    await page.evaluate(() => { delete window.__foliaChromeLayoutStability; });
    await page.waitForFunction(() => {
      const text = document.querySelector('[data-font-debug-target="visualizer-translation"]');
      const button = document.querySelector('.restore-controls');
      if (!text || !button) return false;
      const textBox = text.getBoundingClientRect(), buttonBox = button.getBoundingClientRect();
      const sample = [textBox.bottom, buttonBox.left, buttonBox.top, buttonBox.width, buttonBox.height];
      const previous = window.__foliaChromeLayoutStability;
      const stable = previous && sample.every((value, index) => Math.abs(value - previous.sample[index]) < 0.03);
      const frames = stable ? previous.frames + 1 : 0;
      window.__foliaChromeLayoutStability = { sample, frames };
      return frames >= 4;
    }, null, { timeout: 30000, polling: 'raf' });
    assert.equal(await subtitle.innerText(), '译文不能被播放控件遮挡', 'the translation must come from the real lyric packet parser');
  };
  const snapshot = async (context, baseline = null, requireHit = true) => {
    // Reading layout is not user activity; explicitly move within the current zone before testing a visible control.
    if (requireHit) { await page.mouse.move(pointer.x + 1, pointer.y); await page.mouse.move(pointer.x, pointer.y); }
    await settle();
    const sample = await page.evaluate(() => {
      const box = selector => {
        const element = document.querySelector(selector), bounds = element.getBoundingClientRect();
        return { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height,
          right: bounds.right, bottom: bounds.bottom, visibility: getComputedStyle(element).visibility };
      };
      const button = document.querySelector('.restore-controls'), buttonBox = button.getBoundingClientRect();
      const center = { x: buttonBox.left + buttonBox.width / 2, y: buttonBox.top + buttonBox.height / 2 };
      const hit = document.elementFromPoint(center.x, center.y);
      return { count: document.querySelectorAll('.restore-controls,[aria-label="沉浸显示"],[aria-label="显示控制栏"]').length,
        toggle: box('.restore-controls'), shell: box('.desktop-topbar-shell'), header: box('.desktop-topbar'),
        settings: box('[aria-label="打开歌词设置"]'), footer: box('.desktop-statusbar'),
        subtitle: box('[data-font-debug-target="visualizer-translation"]'), center,
        hit: hit === button || button.contains(hit), hitTarget: hit?.outerHTML.slice(0, 500), label: button.getAttribute('aria-label'),
        viewport: { width: innerWidth, height: innerHeight }, storedHidden: localStorage.getItem('hide_player_progress_bar'),
        standaloneRestore: Boolean(document.querySelector('main.desktop-lyrics > .restore-controls')) };
    });
    geometry.push({ context, ...sample });
    assert.equal(sample.count, 1, `${context}: exactly one hide/restore button exists`);
    assert.equal(sample.standaloneRestore, false, `${context}: no second standalone restoration control remains`);
    assert.equal(sample.storedHidden, 'true', `${context}: desktop layout must not rewrite the upstream stored preference`);
    assert(sample.toggle.x >= 0 && sample.toggle.y >= 0 && sample.toggle.right <= sample.viewport.width
      && sample.toggle.bottom <= sample.viewport.height, `${context}: toggle stays within the viewport`);
    assert(sample.toggle.x >= sample.settings.right + 1, `${context}: toggle is rightmost and does not overlap settings`);
    assert(sample.shell.right - sample.toggle.right >= 0 && sample.shell.right - sample.toggle.right <= 24,
      `${context}: toggle stays at the right edge of the same topbar shell`);
    if (requireHit) assert(sample.hit, `${context}: the only toggle is reachable and not covered by settings or chrome`);
    if (baseline) {
      assert(Math.abs(sample.center.x - baseline.center.x) <= 1.1 && Math.abs(sample.center.y - baseline.center.y) <= 1.1,
        `${context}: hide and restore use the same coordinates at the same window size`);
    }
    return sample;
  };
  const clearFooter = sample => assert(sample.subtitle.bottom <= sample.footer.y - 8,
    `${sample.context || 'visible footer'}: translation bottom ${sample.subtitle.bottom} must stay above footer top ${sample.footer.y}`);
  const centerPointer = async () => {
    const viewport = page.viewportSize(); pointer = { x: viewport.width / 2, y: viewport.height / 2 }; await page.mouse.move(pointer.x, pointer.y);
  };
  const bottomPointer = async () => {
    const viewport = page.viewportSize(); pointer = { x: viewport.width / 2, y: viewport.height - 18 }; await page.mouse.move(pointer.x, pointer.y);
  };
  const clickToggle = async () => {
    const center = await toggle.evaluate(button => { const bounds = button.getBoundingClientRect();
      return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }; });
    await page.mouse.move(center.x - 1, center.y); await page.mouse.move(center.x, center.y); await toggle.click();
    pointer = center;
  };
  const count = type => page.evaluate(type => window.__foliaCommands.filter(command => command.type === type).length, type);
  // These smoke checks protect the recently added input bridge without repeating its full test suite.
  const mediaInput = async (action, input) => {
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    const before = await count('mediaControl'); await input();
    await page.waitForFunction(before => window.__foliaCommands.filter(command => command.type === 'mediaControl').length > before, before);
    const commands = await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'mediaControl'));
    assert.equal(commands.length, before + 1); assert.equal(commands.at(-1).value.action, action);
    await emit('transport', { requestId: commands.at(-1).value.requestId, success: true, message: '布局回归操作已发送' });
    await page.waitForFunction(() => document.querySelector('.playback-controls')?.getAttribute('aria-busy') === 'false');
  };
  try {
    await page.evaluate(() => localStorage.setItem('hide_player_progress_bar', 'true'));
    await page.reload({ waitUntil: 'networkidle' }); await seed();
    await selectDesktopOption(page, '歌词样式', { value: 'classic' });
    for (const state of [
      { label: 'window', maximized: false, fullscreen: false },
      { label: 'maximized', maximized: true, fullscreen: false },
      { label: 'fullscreen', maximized: false, fullscreen: true },
    ]) {
      for (const viewport of [{ width: 1280, height: 800 }, { width: 450, height: 300 }]) {
        const context = `${state.label}-${viewport.width}x${viewport.height}`;
        await page.setViewportSize(viewport);
        await emit('windowState', { maximized: state.maximized, fullscreen: state.fullscreen, clickThrough: false });
        await emit('restore', {}); await centerPointer();
        await visibility('.desktop-topbar', true); await visibility('.desktop-statusbar', true);
        const normal = await snapshot(`${context}-normal`); clearFooter(normal);
        assert.equal(normal.label, '沉浸显示');
        await clickToggle(); await centerPointer();
        await page.locator('.desktop-lyrics.immersive').waitFor();
        await visibility('.desktop-topbar', false); await visibility('.desktop-statusbar', false);
        const hidden = await snapshot(`${context}-immersive`, normal);
        assert.equal(hidden.label, '显示控制栏');
        assert(hidden.subtitle.bottom >= normal.subtitle.bottom + 25, `${context}: hiding the footer returns translation towards the bottom`);
        await bottomPointer(); await page.locator('.immersive.controls-revealed').waitFor();
        await visibility('.desktop-statusbar', true);
        const bottom = await snapshot(`${context}-bottom-revealed`, normal); clearFooter(bottom);
        assert.equal(bottom.header.visibility, 'hidden', `${context}: bottom reveal is independent of the topbar`);
        await page.screenshot({ path: `${output}/chrome-layout-${context}-bottom.png` });
        await centerPointer(); await visibility('.desktop-statusbar', false);
        const returned = await snapshot(`${context}-bottom-hidden`, normal);
        assert(Math.abs(returned.subtitle.bottom - hidden.subtitle.bottom) <= 1.1, `${context}: subtitle returns when bottom controls close`);
        pointer = { x: viewport.width / 2, y: 18 }; await page.mouse.move(pointer.x, pointer.y);
        await visibility('.desktop-topbar', !state.fullscreen);
        const top = await snapshot(`${context}-top-hover`, normal);
        assert.equal(top.footer.visibility, 'hidden');
        assert(Math.abs(top.subtitle.bottom - hidden.subtitle.bottom) <= 1.1, `${context}: top-only hover must not lift the bottom subtitle`);
        await clickToggle(); await centerPointer();
        await page.locator('.desktop-lyrics.immersive').waitFor({ state: 'detached' });
        await visibility('.desktop-statusbar', true);
        const restored = await snapshot(`${context}-restored`, normal); clearFooter(restored);
        await page.screenshot({ path: `${output}/chrome-layout-${context}-normal.png` });
        checks.push(`${context}: one fixed rightmost toggle through hide, bottom reveal, top hover and restore`,
          `${context}: parsed translation avoids visible footer, returns when hidden and ignores top-only reveal`);
      }
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await emit('windowState', { maximized: false, fullscreen: true, clickThrough: false });
    await centerPointer();
    // Claddagh omits the chrome-hidden prop, so its shared overlay must use the scoped store presence too.
    for (const mode of ['sonnet', 'claddagh']) {
      await selectDesktopOption(page, '歌词样式', { value: mode });
      const normal = await snapshot(`${mode}-normal`); clearFooter(normal);
      await clickToggle(); await centerPointer(); await visibility('.desktop-statusbar', false);
      const hidden = await snapshot(`${mode}-hidden`, normal);
      assert(hidden.subtitle.bottom >= normal.subtitle.bottom + 25, `${mode}: hidden control bar releases its reserved subtitle space`);
      await bottomPointer(); await visibility('.desktop-statusbar', true);
      const revealed = await snapshot(`${mode}-bottom-revealed`, normal); clearFooter(revealed);
      await page.screenshot({ path: `${output}/chrome-layout-${mode}-bottom.png` });
      await clickToggle(); await centerPointer(); await visibility('.desktop-statusbar', true);
      checks.push(`${mode}: original shared subtitle respects visible, hidden and hover-revealed footer`);
    }
    await selectDesktopOption(page, '歌词样式', { value: 'classic' });
    await mediaInput('play', () => page.keyboard.press('Space'));
    await mediaInput('next', () => page.keyboard.press('ArrowRight'));
    await mediaInput('previous', () => page.locator('.desktop-stage').evaluate(target => {
      for (const type of ['mousedown', 'mouseup', 'auxclick']) target.dispatchEvent(new MouseEvent(type,
        { button: 3, buttons: type === 'mousedown' ? 8 : 0, bubbles: true, cancelable: true }));
    }));
    const volumeBefore = await count('systemVolume');
    await page.locator('.desktop-stage').evaluate(target => target.dispatchEvent(new WheelEvent('wheel',
      { deltaY: -100, deltaMode: 0, bubbles: true, cancelable: true })));
    assert.equal(await count('systemVolume'), volumeBefore + 1);
    assert.equal(await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'systemVolume').at(-1).value.delta), 1);
    checks.push('keyboard, paired mouse side button and system-volume bridge still send exactly one correct command');

    await emit('windowState', { maximized: false, fullscreen: false, clickThrough: false });
    await emit('preferences', { autoImmersive: false, immersiveDelay: 1, bottomHoverControls: true });
    const beforeIdle = await snapshot('before-idle');
    await clickToggle(); await centerPointer();
    await page.locator('.immersive.cursor-idle').waitFor();
    await visibility('.restore-controls', false);
    await snapshot('cursor-idle-hidden-toggle', beforeIdle, false);
    pointer = { x: 641, y: 400 }; await page.mouse.move(pointer.x, pointer.y); await visibility('.restore-controls', true);
    await snapshot('cursor-idle-wakes-toggle', beforeIdle);
    checks.push('idle hides the one toggle and moving the pointer wakes it at exactly the same position');
    await writeFile(`${output}/chrome-layout-geometry.json`, JSON.stringify(geometry, null, 2));
    checks.push(...await verifyImmersiveToggleIdle(page, song, output));
    console.log('PASS fixed immersion toggle and original subtitle/footer layout checks');
    return checks;
  } catch (error) {
    await writeFile(`${output}/chrome-layout-failure.json`, JSON.stringify({ checks, geometry, error: String(error) }, null, 2));
    await page.screenshot({ path: `${output}/chrome-layout-failure.png` });
    throw error;
  } finally {
    await page.evaluate(saved => {
      for (const [key, value] of [['hide_player_progress_bar', saved.hidden], ['folia.desktop.mode.v1', saved.mode]]) {
        if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
      }
    }, saved);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.reload({ waitUntil: 'networkidle' }); await seed();
  }
}
