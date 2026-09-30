import assert from 'node:assert/strict';

// test/verify-transport.mjs
export async function verifyTransport(page, song, output) {
  const buttons = page.getByRole('group', { name: '外部播放器控制' });
  const emit = (type, data) => page.evaluate(({ type, data }) => window.__foliaEmit(type, data), { type, data });
  const last = () => page.evaluate(() => window.__foliaCommands.filter(c => c.type === 'mediaControl').at(-1).value);
  const reply = async (request, success = true, message = '已发送操作，正在同步播放器状态。') => emit('transport', { requestId: request.requestId, success, message });
  await emit('session', { ...song, playing: true, position: 15 });
  await page.getByRole('button', { name: '暂停音乐', exact: true }).click();
  const pause = await last();
  assert.equal(pause.action, 'pause'); assert.equal(pause.sessionId, song.sessionId); assert.equal(pause.songKey, song.key);
  assert.equal(await buttons.getAttribute('aria-busy'), 'true');
  assert(await page.getByRole('button', { name: '下一首', exact: true }).isDisabled());
  assert(await page.getByRole('button', { name: '上一首', exact: true }).isDisabled());
  await reply(pause);
  await page.waitForFunction(() => document.querySelector('.playback-controls')?.getAttribute('aria-busy') === 'false');
  assert.equal(await page.getByRole('button', { name: '暂停音乐', exact: true }).count(), 1); // ACK must not invent paused state.
  await emit('session', { ...song, playing: false, position: 15 });
  await page.getByRole('button', { name: '继续播放音乐', exact: true }).click();
  const play = await last(); assert.equal(play.action, 'play');
  await reply(play); await emit('session', { ...song, playing: true, position: 15 });
  for (const [name, action] of [['上一首', 'previous'], ['下一首', 'next']]) {
    await page.getByRole('button', { name, exact: true }).click();
    const request = await last(); assert.equal(request.action, action); await reply(request);
    await page.waitForFunction(() => document.querySelector('.playback-controls')?.getAttribute('aria-busy') === 'false');
  }
  await page.getByRole('button', { name: '下一首', exact: true }).click();
  await reply(await last(), false, '播放器未接受操作');
  await page.getByText('播放器未接受操作', { exact: true }).waitFor();
  await emit('session', { ...song, playing: true, controls: { ...song.controls, next: false, previous: false, pause: false, toggle: false } });
  for (const name of ['暂停音乐', '上一首', '下一首']) assert(await page.getByRole('button', { name, exact: true }).isDisabled());
  await emit('session', { ...song, playing: true });
  await page.getByRole('button', { name: '下一首', exact: true }).click();
  const old = await last();
  await emit('session', { ...song, key: 'new-track', title: '切歌后的歌词', playing: false, position: 0 });
  await page.locator('.waiting-screen').waitFor();
  await reply(old, false, 'obsolete-control-error');
  assert(!(await buttons.innerText()).includes('obsolete-control-error'));
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
  assert(await page.getByRole('button', { name: '继续播放音乐', exact: true }).isDisabled());
  await emit('session', { ...song, playing: false });
  assert.equal(await page.locator('audio,video').count(), 0);
  return ['pause/play/previous/next IPC target', 'pending disables duplicate controls', 'ACK waits for real session state', 'provider rejection shown', 'capability changes disable buttons', 'old command result ignored after track change', 'new track loads new lyrics', '680px controls visible', 'connection failure disables controls', 'no audio/video output'];
}
