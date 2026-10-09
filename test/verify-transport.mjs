import assert from 'node:assert/strict';

// test/verify-transport.mjs — target real player commands and show feedback only for matching failures.
export async function verifyTransport(page, song, output) {
  const buttons = page.getByRole('group', { name: '外部播放器控制' });
  const emit = (type, data) => page.evaluate(({ type, data }) => window.__foliaEmit(type, data), { type, data });
  const last = () => page.evaluate(() => window.__foliaCommands.filter(c => c.type === 'mediaControl').at(-1).value);
  const count = () => page.evaluate(() => window.__foliaCommands.filter(c => c.type === 'mediaControl').length);
  const reply = async (request, success = true, message = '已发送操作，正在同步播放器状态。') => emit('transport', { requestId: request.requestId, success, message });
  const busy = pending => page.waitForFunction(pending => document.querySelector('.playback-controls')?.getAttribute('aria-busy') === String(pending), pending);
  // Pending and success remain visible through the button state without adding a second status message.
  const noCaption = async context => {
    await buttons.locator('.transport-caption').waitFor({ state: 'detached' });
    assert.equal((await buttons.innerText()).trim(), '', `${context}: the playback controls contain only icons`);
    assert.equal(await buttons.getByRole('status').count(), 0, `${context}: no normal or pending status message remains`);
    assert.equal(await buttons.getByRole('alert').count(), 0, `${context}: there is no failure alert`);
    assert.equal(await page.getByText('已发送操作，正在同步播放器状态。', { exact: true }).count(), 0, `${context}: successful ACK text is omitted`);
  };
  await emit('session', { ...song, playing: true, position: 15 });
  await noCaption('connected idle');
  await page.getByRole('button', { name: '暂停音乐', exact: true }).click();
  const pause = await last();
  assert.equal(pause.action, 'pause'); assert.equal(pause.sessionId, song.sessionId); assert.equal(pause.songKey, song.key);
  await busy(true); await noCaption('pending pause');
  assert(await buttons.locator('.transport-spinner').isVisible(), 'pending retains its compact progress icon');
  assert(await page.getByRole('button', { name: '下一首', exact: true }).isDisabled());
  assert(await page.getByRole('button', { name: '上一首', exact: true }).isDisabled());
  const pendingCount = await count();
  await buttons.locator('button').evaluateAll(elements => elements.forEach(button => button.click()));
  assert.equal(await count(), pendingCount, 'disabled pending buttons do not send duplicate commands');
  await reply({ ...pause, requestId: `unrelated-${pause.requestId}` }, false, 'unrelated-control-error');
  assert.equal(await buttons.getAttribute('aria-busy'), 'true', 'a response for another request cannot unlock the pending command');
  await noCaption('unrelated rejection');
  assert.equal(await page.getByText('unrelated-control-error', { exact: true }).count(), 0);
  await reply(pause);
  await busy(false); await noCaption('successful pause ACK');
  assert.equal(await buttons.locator('.transport-spinner').count(), 0);
  assert.equal(await page.getByRole('button', { name: '暂停音乐', exact: true }).count(), 1); // ACK must not invent paused state.
  await reply(pause, false, 'duplicate-ACK-error'); await noCaption('duplicate ACK');
  assert.equal(await page.getByText('duplicate-ACK-error', { exact: true }).count(), 0, 'an already completed request cannot show a later duplicate failure');
  await emit('session', { ...song, playing: false, position: 15 });
  await page.getByRole('button', { name: '继续播放音乐', exact: true }).click();
  const play = await last(); assert.equal(play.action, 'play');
  await reply(play); await busy(false); await noCaption('successful play ACK'); await emit('session', { ...song, playing: true, position: 15 });
  for (const [name, action] of [['上一首', 'previous'], ['下一首', 'next']]) {
    await page.getByRole('button', { name, exact: true }).click();
    const request = await last(); assert.equal(request.action, action); await reply(request);
    await busy(false); await noCaption(`successful ${action} ACK`);
  }
  await page.getByRole('button', { name: '下一首', exact: true }).click();
  await reply(await last(), false, '播放器未接受操作');
  await busy(false);
  const failure = buttons.getByRole('alert'); await failure.waitFor();
  assert.equal(await failure.innerText(), '播放器未接受操作'); assert.equal(await failure.count(), 1);
  assert(await failure.evaluate(element => element.classList.contains('transport-caption') && element.classList.contains('error')));
  await page.screenshot({ path: `${output}/transport-error.png` });
  await page.getByRole('button', { name: '下一首', exact: true }).click();
  const retry = await last(); await busy(true); await noCaption('retry clears previous failure');
  assert.equal(await page.getByText('播放器未接受操作', { exact: true }).count(), 0);
  await reply(retry); await busy(false); await noCaption('successful retry ACK');
  await emit('session', { ...song, playing: true, controls: { ...song.controls, next: false, previous: false, pause: false, toggle: false } });
  for (const name of ['暂停音乐', '上一首', '下一首']) {
    const button = page.getByRole('button', { name, exact: true }); assert(await button.isDisabled());
    assert.equal(await button.getAttribute('title'), '当前播放器未开放这项控制', 'unsupported actions explain the disabled state in their tooltip');
  }
  await noCaption('unsupported player controls');
  await emit('session', { ...song, playing: true });
  await page.getByRole('button', { name: '下一首', exact: true }).click();
  const old = await last();
  const footer = await page.locator('.desktop-statusbar').elementHandle();
  await emit('session', { ...song, key: 'new-track', title: '切歌后的歌词', playing: false, position: 0 });
  await page.locator('.waiting-screen').waitFor();
  await emit('lyrics', { key: 'new-track', title: '切歌后的歌词', artist: song.artist, content: '', source: '', cover: '', embedded: false });
  const loadingFrames = await footer.evaluate(async original => {
    const frames = [];
    for (let frame = 0; frame < 8; frame++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const current = document.querySelector('.desktop-statusbar'), style = current && getComputedStyle(current);
      frames.push(original.isConnected && current === original && style?.visibility === 'visible'
        && style.opacity === '1' && style.pointerEvents !== 'none');
    }
    return frames;
  });
  assert(loadingFrames.every(Boolean), 'normal playback controls stay mounted and visible while the next song has no lyrics');
  await footer.dispose();
  await reply(old, false, 'obsolete-control-error');
  await noCaption('track change clears pending feedback');
  assert.equal(await page.getByText('obsolete-control-error', { exact: true }).count(), 0);
  await emit('lyrics', { key: 'new-track', title: '切歌后的歌词', artist: song.artist, content: '[00:01.00]切换歌曲后重新同步\n[00:05.00]歌词显示来自新歌曲', source: '切歌验证', cover: '', embedded: false });
  await page.locator('.waiting-screen').waitFor({ state: 'detached' });
  await emit('session', { ...song, playing: false, position: 15 });
  await emit('lyrics', { key: song.key, title: song.title, artist: song.artist, content: '[00:01.00]音乐由外部播放器播放\n[00:20.00]保留原版歌词动效', source: '媒体控制验证', cover: '', embedded: false });
  await page.locator('.waiting-screen').waitFor({ state: 'detached' });
  await page.screenshot({ path: `${output}/transport.png` });
  await page.setViewportSize({ width: 680, height: 450 });
  const box = await buttons.boundingBox();
  assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 680 && box.y + box.height <= 450);
  await page.screenshot({ path: `${output}/transport-small.png` });
  await page.setViewportSize({ width: 1280, height: 800 });
  await emit('connectionError', { text: '播放器连接中断' });
  const disconnectedPlay = page.getByRole('button', { name: '继续播放音乐', exact: true });
  assert(await disconnectedPlay.isDisabled()); assert.equal(await disconnectedPlay.getAttribute('title'), '请先连接音乐播放器');
  await noCaption('disconnected controls');
  await emit('session', { ...song, playing: false });
  assert.equal(await page.locator('audio,video').count(), 0);
  return ['pause/play/previous/next IPC target', 'pending shows only an icon and disables duplicate controls', 'successful ACK is silent and waits for real session state',
    'unrelated and duplicate replies cannot unlock requests or show errors', 'provider rejection appears once as a failure alert', 'retry clears the previous failure and successful retry stays silent',
    'unsupported and disconnected controls use disabled buttons with explanatory tooltips', 'old command result ignored after track change', 'normal playback controls remain visible while new lyrics load', 'new track loads new lyrics',
    '680px controls visible', 'connection failure disables controls', 'no audio/video output'];
}
