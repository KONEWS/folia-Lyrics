import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installDesktopBridgeMock } from './desktop-bridge-mock.mjs';
import { installDesktopParserProbe } from './verify-desktop-parser-formats.mjs';
import { emitVisual, readVisual, visualFrame } from './desktop-visual-fixture.mjs';

// test/verify-desktop-lyric-inspection.mjs — native content inspection through all real page subscribers and the production parser Worker.
const output = resolve(process.env.FOLIA_UI_OUTPUT || 'test-results/desktop-lyric-inspection');
await mkdir(output, { recursive: true });
const checks = [], samples = [], failures = [], errors = [];
let url = process.env.FOLIA_TEST_URL, server, browser;
// Offline ciphertext fixtures verified by the production QQ cipher in the companion unit suite.
const wordQrc = 'd6a2be95d644737237d332720cff3b1cc97cf903179abc2c17e32a3ddd86eddf25a1be679edd3569';
const lineQrc = '32dabb4c5e9846fab6c9dcb03f55b7ad53faccbf9bfcebd2d2fa70a8869011da';
try {
  if (!url) {
    server = await createServer({ configFile: resolve('vite.desktop.config.ts'), server: { host: '127.0.0.1', port: 0, hmr: false,
      watch: { ignored: ['**/obj/**', '**/bin/**', '**/release/**'] } } });
    await server.listen(); url = `http://127.0.0.1:${server.httpServer.address().port}/desktop.html`;
  }
  const origin = new URL(url).origin;
  browser = await chromium.launch({ executablePath: process.env.FOLIA_CHROMIUM_PATH, headless: true, args: ['--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.clear(); localStorage.setItem('folia.desktop.mode.v1', 'classic');
    sessionStorage.setItem('folia.test.mockPreferences', JSON.stringify({ autoImmersive: false, audioReactive: false, coverTheme: false }));
  });
  await installDesktopBridgeMock(page); await installDesktopParserProbe(page);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__foliaReadyAt !== null);
  const song = { key: 'display-original', title: '当前显示歌曲', artist: '测试歌手', cover: '', source: '测试播放器',
    sessionId: 'inspection-session', position: 10, duration: 180, rate: 1, playing: false, hasTimeline: true,
    sources: [{ id: 'inspection-session', label: '测试播放器' }] };
  const displayPacket = { key: song.key, title: song.title, artist: song.artist, cover: '', source: '显示验证', embedded: false,
    format: 'lrc', content: '[00:01.000]当前显示歌词\n[00:09.000]检测候选不会改写画面\n[00:30.000]下一句' };
  await emitVisual(page, 'session', song); await emitVisual(page, 'lyrics', displayPacket);
  await page.waitForFunction(() => window.__foliaReadVisualizerProps?.()?.lines[0]?.fullText === '当前显示歌词');
  const read = async () => ({ visual: await readVisual(page), ...await page.evaluate(() => ({
    storage: Object.fromEntries(Object.entries(localStorage).sort(([a], [b]) => a.localeCompare(b))), preferences: window.__foliaMockPreferences(),
  })) });
  const baseline = await read(); assert(baseline.visual.lines.length > 0); assert.equal(baseline.visual.mode, 'classic');
  const base = { key: 'candidate-song', title: '候选歌曲', artist: '候选歌手', source: 'QQ 音乐', cover: '', embedded: false };
  const replies = requestId => page.evaluate(requestId => window.__foliaCommands.filter(command => command.type === 'lyricInspection' && command.value.requestId === requestId), requestId);
  const inspect = async (name, packet, quality) => {
    const before = await page.evaluate(() => window.__foliaParserProbe.requests.length);
    await emitVisual(page, 'inspectLyrics', { requestId: name, packet: { ...base, ...packet } });
    await page.waitForFunction(requestId => window.__foliaCommands.some(command => command.type === 'lyricInspection' && command.value.requestId === requestId), name);
    await visualFrame(page);
    const results = await replies(name);
    for (const result of results) assert.deepEqual(result, { type: 'lyricInspection', value: { requestId: name, key: packet.key ?? base.key, ...quality } });
    const parserRequests = await page.evaluate(before => window.__foliaParserProbe.requests.slice(before), before);
    samples.push({ name, replies: results, parserRequests });
    assert.equal(parserRequests.length, ['qq-real-word-cipher', 'yrc-real-worker'].includes(name) ? 1 : 0,
      `${name}: one candidate uses at most one Worker parse across all page subscribers`);
    assert.deepEqual(await read(), baseline, `${name}: inspection preserves real renderer, storage and host settings`);
    if (results.length !== 1) failures.push({ name, error: `Expected exactly one inspection reply, received ${results.length}.` });
    else checks.push(name);
  };
  await page.screenshot({ path: `${output}/display-before-inspection.png` });
  await inspect('qq-real-word-cipher', { format: 'qq-qrc', content: wordQrc, fallbackContent: '[00:01.00]备用逐行' }, { usable: true, wordTimed: true });
  await inspect('qq-real-line-cipher', { format: 'qq-qrc', content: lineQrc }, { usable: true, wordTimed: false });
  await inspect('qq-invalid-cipher-line-fallback', { format: 'qq-qrc', content: 'deadbeef01234567deadbeef01234567', fallbackContent: '[00:01.00]备用逐行' }, { usable: true, wordTimed: false });
  await inspect('qq-invalid-cipher-no-fallback', { format: 'qq-qrc', content: 'deadbeef01234567deadbeef01234567' }, { usable: false, wordTimed: false });
  await inspect('yrc-real-worker', { format: 'yrc', content: '[1000,2000](1000,1000,0)你(2000,1000,0)好' }, { usable: true, wordTimed: true });
  const malformedBefore = await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'lyricInspection').length);
  for (const data of [{}, { requestId: '', packet: base }, { requestId: 'x'.repeat(81), packet: base },
    { requestId: 'invalid', packet: null }, { requestId: 'invalid', packet: { key: 'k', content: 1 } },
    { requestId: 'invalid', packet: { content: '[00:01.00]歌词' } }]) await emitVisual(page, 'inspectLyrics', data);
  await visualFrame(page);
  assert.equal(await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'lyricInspection').length), malformedBefore);
  assert.deepEqual(await read(), baseline); checks.push('malformed-envelopes-ignored');
  // Swap the genuine session after the inspection enters the Worker, before that Worker can return.
  const nextSong = { ...song, key: 'display-new', title: '切歌后的新歌曲', position: 10 };
  const nextPacket = { ...displayPacket, key: nextSong.key, title: nextSong.title, content: '[00:01.000]新歌曲显示\n[00:09.000]保留新的歌词画面\n[00:30.000]下一句' };
  const marker = '迟到检测标记';
  const lateBefore = await page.evaluate(() => window.__foliaParserProbe.requests.length);
  await page.evaluate(swap => { window.__foliaParserSwapAfterPost = swap; }, { marker, song: nextSong, packet: nextPacket });
  await emitVisual(page, 'inspectLyrics', { requestId: 'late-original-request', packet: { ...base, key: 'old-candidate-song', format: 'yrc',
    content: `[1000,2000](1000,1000,0)${marker}(2000,1000,0)词` } });
  await page.waitForFunction(() => window.__foliaReadVisualizerProps?.()?.lines[0]?.fullText === '新歌曲显示');
  await page.waitForFunction(() => window.__foliaCommands.some(command => command.type === 'lyricInspection' && command.value.requestId === 'late-original-request'));
  await visualFrame(page);
  const lateReplies = await replies('late-original-request');
  for (const reply of lateReplies) assert.deepEqual(reply.value, { requestId: 'late-original-request', key: 'old-candidate-song', usable: true, wordTimed: true });
  const afterLate = await read(); assert.equal(afterLate.visual.lines[0].fullText, '新歌曲显示');
  assert.equal(afterLate.visual.clock, 10); assert.equal(afterLate.visual.mode, 'classic');
  assert.deepEqual(afterLate.storage, baseline.storage); assert.deepEqual(afterLate.preferences, baseline.preferences);
  if (lateReplies.length !== 1) failures.push({ name: 'late-original-request', error: `Expected exactly one late reply, received ${lateReplies.length}.` });
  else checks.push('late-worker-reply-retains-original-key-and-request-without-changing-new-display');
  const lateRequests = await page.evaluate(before => window.__foliaParserProbe.requests.slice(before), lateBefore);
  assert.equal(lateRequests.length, 1, 'late candidate is parsed once even while all page subscribers receive the request');
  samples.push({ name: 'late-original-request', replies: lateReplies, parserRequests: lateRequests, display: afterLate.visual.lines.map(line => line.fullText) });
  assert(await page.evaluate(() => window.__foliaParserProbe.workers.length > 0 && window.__foliaParserProbe.responses.length > 0), 'real browser Worker handled candidate parsing');
  checks.push('production-parser-worker-used');
  await page.screenshot({ path: `${output}/new-display-after-late-inspection.png` });
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(failures.length, 0, failures.map(failure => `${failure.name}: ${failure.error}`).join('\n'));
  console.log(`PASS desktop lyric inspection: ${checks.length} checks, ${samples.length} request samples`);
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ checks, samples, failures, errors }, null, 2));
  await browser?.close(); await server?.close();
}
