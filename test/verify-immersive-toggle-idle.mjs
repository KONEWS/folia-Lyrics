import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

// test/verify-immersive-toggle-idle.mjs — the Eye restore button has a separate five-second input deadline.
export async function verifyImmersiveToggleIdle(page, song, output) {
  const checks = [], samples = [];
  const savedMode = await page.evaluate(() => localStorage.getItem('folia.desktop.mode.v1'));
  const emit = (type, data) => page.evaluate(({ type, data }) => window.__foliaEmit(type, data), { type, data });
  const toggle = page.locator('.restore-controls');
  // Install before reloading the renderer so native and fake animation-frame IDs cannot mix.
  await page.evaluate(() => localStorage.setItem('folia.desktop.mode.v1', 'classic'));
  await page.clock.install(); await page.reload({ waitUntil: 'networkidle' });
  await emit('preferences', { autoImmersive: false, immersiveDelay: 30, bottomHoverControls: true });
  await emit('windowState', { maximized: false, fullscreen: false, clickThrough: false });
  await emit('session', { ...song, position: 36, playing: false });
  await emit('lyrics', { key: song.key, title: song.title, artist: song.artist, format: 'lrc', embedded: false, cover: '',
    content: '[00:01.00]沉浸恢复按钮验证\n[00:33.00]独立五秒闲置隐藏\n[01:30.00]保留原版动效', source: '沉浸按钮闲置验证' });
  await page.locator('.waiting-screen').waitFor({ state: 'detached' });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  const frame = () => page.clock.runFor(32);
  const advance = async milliseconds => { await page.clock.fastForward(milliseconds); await frame(); };
  const move = async (x, y) => { await page.mouse.move(x, y); await frame(); };
  const snapshot = async (context, visible, baseline = null) => {
    const sample = await page.evaluate(() => {
      const root = document.querySelector('.desktop-lyrics'), button = root.querySelector('.restore-controls');
      const bounds = button.getBoundingClientRect();
      return { time: performance.now(), count: root.querySelectorAll('.restore-controls').length,
        immersive: root.classList.contains('immersive'), idle: root.classList.contains('immersive-toggle-idle'),
        cursorIdle: root.classList.contains('cursor-idle'), top: root.classList.contains('top-controls-revealed'),
        bottom: root.classList.contains('controls-revealed'), visibility: getComputedStyle(button).visibility,
        focused: button.contains(document.activeElement), center: { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 } };
    });
    assert.equal(sample.count, 1, `${context}: the independent timer must not create a second button`);
    assert.equal(sample.visibility, visible ? 'visible' : 'hidden', `${context}: Eye visibility follows its own deadline`);
    assert.equal(sample.cursorIdle, false, `${context}: the configured 30-second cursor timer must not be shortened to five seconds`);
    if (baseline) assert(Math.abs(sample.center.x - baseline.center.x) <= 1.1 && Math.abs(sample.center.y - baseline.center.y) <= 1.1,
      `${context}: waking or hiding the only button preserves its position`);
    samples.push({ context, ...sample }); return sample;
  };
  const clickToggle = async () => {
    const center = await toggle.evaluate(button => { const bounds = button.getBoundingClientRect();
      return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }; });
    await move(center.x - 1, center.y); await move(center.x, center.y);
    // Geometry is fixed and verified separately; force avoids an actionability RAF wait while the clock is paused.
    await toggle.click({ force: true }); await frame();
  };
  try {
    await move(640, 400); const normal = await snapshot('normal-before-idle', true);
    await advance(6100); const normalIdle = await snapshot('normal-after-six-seconds', true, normal);
    assert.equal(normalIdle.immersive, false); assert.equal(normalIdle.idle, false);
    checks.push('ordinary mode keeps the single Eye button visible after five seconds');

    for (const fullscreen of [false, true]) {
      await emit('windowState', { maximized: false, fullscreen, clickThrough: false }); await frame();
      await clickToggle(); await move(641, 400);
      const before = await snapshot(`${fullscreen ? 'fullscreen' : 'window'}-immersive-start`, true, normal);
      assert(before.immersive);
      await advance(4500); await snapshot(`${fullscreen ? 'fullscreen' : 'window'}-before-five-seconds`, true, normal);
      await advance(600); const hidden = await snapshot(`${fullscreen ? 'fullscreen' : 'window'}-after-five-seconds`, false, normal);
      assert(hidden.idle);
      await page.screenshot({ path: `${output}/immersive-eye-${fullscreen ? 'fullscreen' : 'window'}-idle.png` });
      await move(642, 400); const restored = await snapshot(`${fullscreen ? 'fullscreen' : 'window'}-mouse-wakes`, true, normal);
      assert.equal(restored.idle, false);
      await clickToggle(); await move(640, 400); assert.equal((await snapshot('restored-normal', true, normal)).immersive, false);
    }
    checks.push('manual window and fullscreen immersion hide Eye after five seconds while the 30-second cursor deadline remains unchanged',
      'mouse movement wakes the same button at the same coordinates in both window states');

    await emit('windowState', { maximized: false, fullscreen: false, clickThrough: false }); await frame();
    await clickToggle(); await move(643, 400);
    await advance(4500); await move(644, 400);
    await advance(4500); await snapshot('pointer-activity-restarts-five-seconds', true, normal);
    await advance(600); await snapshot('pointer-activity-new-deadline-expires', false, normal);
    checks.push('activity restarts the complete five-second Eye deadline instead of retaining its previous timeout');

    await move(645, 400); await move(normal.center.x, normal.center.y); await toggle.focus(); await frame();
    assert((await snapshot('focused-eye-before-deadline', true, normal)).focused);
    await advance(5100); const focusedIdle = await snapshot('focused-eye-after-deadline', false, normal);
    assert.equal(focusedIdle.focused, false, 'the expired Eye button must release keyboard focus even while the pointer rests on it');
    checks.push('a pointer resting on the focused Eye button does not keep it visible and expiry releases its focus');

    await move(640, 18); const top = await snapshot('top-hover-after-eye-idle', true, normal);
    assert(top.top); assert.equal(top.bottom, false);
    await move(640, 782); const bottom = await snapshot('bottom-hover-after-eye-idle', true, normal);
    assert(bottom.bottom); assert.equal(bottom.top, false);
    await page.screenshot({ path: `${output}/immersive-eye-bottom-revealed.png` });
    checks.push('top and bottom hover still reveal their controls independently after the Eye deadline');

    await move(646, 400); await advance(3000);
    await emit('restore', {}); await frame(); await advance(3000);
    const exited = await snapshot('old-immersive-timer-cancelled-after-exit', true, normal);
    assert.equal(exited.immersive, false); assert.equal(exited.idle, false);
    await clickToggle(); await move(647, 400);
    await advance(4500); await snapshot('reentered-immersion-new-five-seconds', true, normal);
    await advance(600); await snapshot('reentered-immersion-deadline-expires', false, normal);
    checks.push('exiting immersion cancels the old timeout and reentering starts a fresh five-second deadline');
    await emit('restore', {}); await frame();
    await page.getByRole('button', { name: '打开歌词设置', exact: true }).click({ force: true }); await frame();
    assert.equal(await page.getByRole('spinbutton', { name: '无操作等待时间', exact: true }).inputValue(), '30');
    assert.equal(await page.getByRole('checkbox', { name: '闲置时自动进入沉浸模式', exact: true }).isChecked(), false);
    await page.locator('.desktop-topbar [data-settings-trigger]').click({ force: true }); await frame();
    await writeFile(`${output}/immersive-eye-idle-results.json`, JSON.stringify({ checks, samples }, null, 2));
    console.log('PASS independent five-second immersive Eye deadline checks');
    return checks;
  } finally {
    await page.clock.resume();
    await page.evaluate(savedMode => {
      if (savedMode === null) localStorage.removeItem('folia.desktop.mode.v1'); else localStorage.setItem('folia.desktop.mode.v1', savedMode);
    }, savedMode);
    await page.reload({ waitUntil: 'networkidle' });
  }
}
