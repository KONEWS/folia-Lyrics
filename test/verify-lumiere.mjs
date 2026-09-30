import assert from 'node:assert/strict';

// test/verify-lumiere.mjs: exercise the production Lumiere renderer through the desktop bridge.
export async function verifyLumiere(page, song, output) {
  const checks = [];
  const emit = (type, data) => page.evaluate(({ type, data }) => window.__foliaEmit(type, data), { type, data });
  const lumiere = page.locator('button.effect').filter({ hasText: '绘光' });
  const classic = page.locator('button.effect').filter({ hasText: 'Luminous' });
  // Observe cleanup calls without changing the renderer or its resource ownership.
  await page.evaluate(() => {
    window.__lumiereResources = { disconnects: 0, deletes: 0 };
    const disconnect = ResizeObserver.prototype.disconnect;
    ResizeObserver.prototype.disconnect = function (...args) {
      window.__lumiereResources.disconnects++;
      return disconnect.apply(this, args);
    };
    for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const name of ['deleteTexture', 'deleteBuffer', 'deleteProgram']) {
        const original = prototype[name];
        prototype[name] = function (...args) {
          if (args[0]) window.__lumiereResources.deletes++;
          return original.apply(this, args);
        };
      }
    }
  });
  await classic.click();
  await page.locator('.desktop-stage canvas').waitFor({ state: 'detached' });
  await lumiere.click();
  const canvas = page.locator('.desktop-stage canvas');
  await canvas.waitFor({ timeout: 60000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.desktop-stage canvas');
    return canvas && canvas.width > 0 && canvas.height > 0;
  });
  await page.waitForTimeout(800);
  assert.equal(await canvas.count(), 1);
  const frozen = await canvas.screenshot();
  await page.waitForTimeout(350);
  assert(frozen.equals(await canvas.screenshot()), 'paused Lumiere canvas should not advance');
  assert.match(await page.locator('.clock-readout').innerText(), /^0:36/);
  checks.push('paused mount creates a nonzero canvas and freezes its pixels and lyric clock');
  await page.getByRole('button', { name: '关闭设置' }).click();
  await emit('session', { ...song, playing: true });
  await emit('clock', { ...song, playing: true, position: 37 });
  await page.waitForFunction(() => document.querySelector('.clock-readout')?.textContent?.startsWith('0:37'));
  const running = await canvas.screenshot();
  await page.waitForTimeout(500);
  assert(!running.equals(await canvas.screenshot()), 'resumed Lumiere canvas should draw new frames');
  await emit('session', { ...song, position: 38 });
  await page.waitForFunction(() => document.querySelector('.clock-readout')?.textContent?.startsWith('0:38'));
  await page.waitForTimeout(300);
  const paused = await canvas.screenshot();
  await page.waitForTimeout(300);
  assert(paused.equals(await canvas.screenshot()), 'pause after resume must stop drawing');
  checks.push('resume advances pixels and clock; pause freezes again');
  const oldSize = await canvas.evaluate(el => ({ width: el.width, height: el.height }));
  await page.setViewportSize({ width: 900, height: 600 });
  await page.waitForFunction(old => {
    const canvas = document.querySelector('.desktop-stage canvas');
    return canvas && canvas.width > 0 && canvas.height > 0 && (canvas.width !== old.width || canvas.height !== old.height);
  }, oldSize);
  await page.screenshot({ path: `${output}/lumiere-resized.png` });
  await page.setViewportSize({ width: 1280, height: 800 });
  checks.push('paused resize updates canvas dimensions');
  const next = { ...song, key: 'lumiere-next', title: '绘光换歌测试', position: 2 };
  await emit('session', next);
  await page.locator('.waiting-screen').waitFor();
  await canvas.waitFor({ state: 'detached' });
  await emit('lyrics', { key: next.key, title: next.title, artist: next.artist, content: '[00:01.00]新的歌词\n[00:04.00]保留原版绘光\n[00:08.00]逐行时间轴', source: '隔离测试', cover: '', embedded: false, format: 'lrc' });
  await page.locator('.waiting-screen').waitFor({ state: 'detached' });
  await canvas.waitFor({ timeout: 60000 });
  await page.waitForTimeout(500);
  assert.equal(await canvas.count(), 1);
  assert.match(await page.locator('.track-caption').innerText(), /绘光换歌测试/);
  assert.match(await page.locator('.clock-readout').innerText(), /^0:02/);
  await page.screenshot({ path: `${output}/lumiere-track-change.png` });
  checks.push('track change removes old canvas and mounts exactly one canvas for new lyrics');
  await page.getByRole('button', { name: '打开歌词设置' }).click();
  for (let i = 0; i < 3; i++) {
    const before = await page.evaluate(() => ({ ...window.__lumiereResources }));
    await classic.click();
    await canvas.waitFor({ state: 'detached' });
    const after = await page.evaluate(() => ({ ...window.__lumiereResources }));
    assert(after.disconnects > before.disconnects, 'unmount must disconnect ResizeObserver');
    assert(after.deletes > before.deletes, 'unmount must release WebGL resources');
    await lumiere.click();
    await canvas.waitFor({ timeout: 60000 });
    await page.waitForTimeout(350);
    assert.equal(await canvas.count(), 1);
  }
  checks.push('three mode-switch cycles disconnect observers, delete GPU resources and keep one canvas');
  // Restore the common fixture for the existing transport and online-lyrics checks.
  await classic.click();
  await canvas.waitFor({ state: 'detached' });
  await emit('session', song);
  await emit('lyrics', { key: song.key, title: song.title, artist: song.artist, content: '[00:01.00]音乐在播放\n[00:20.00]歌词跟随时间\n[00:33.00]保留原版动效\n[00:42.00]下一行歌词', source: '绘光验证恢复', cover: '', embedded: false, format: 'lrc' });
  await page.locator('.waiting-screen').waitFor({ state: 'detached' });
  console.log('PASS Lumiere lifecycle checks');
  return checks;
}
