import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { installDesktopBridgeMock } from './desktop-bridge-mock.mjs';

// test/verify-desktop-offset.mjs: Real offset controls, version storage and late host packets in an isolated browser context.
const prefix = 'folia.desktop.offset.v2:';
const labelFor = value => value === 0 ? '时间无偏移' : `${value > 0 ? '提前' : '延后'} ${Math.abs(value).toFixed(1)} 秒`;
const metadataKey = song => prefix + JSON.stringify([song.title.toLowerCase(), song.artist.toLowerCase(), song.album.toLowerCase(), Math.round(song.duration)]);
const importedKey = packet => prefix + JSON.stringify([packet.title.toLowerCase(), packet.artist.toLowerCase(), 'lyrics',
  createHash('md5').update(JSON.stringify([packet.format ?? '', packet.content, packet.fallbackContent ?? ''])).digest('hex')]);

// Reuse the caller's server and browser while keeping calibration records and reloads separate from other UI checks.
export async function verifyDesktopOffsets(page, song, output) {
  const context = await page.context().browser().newContext({ viewport: page.viewportSize(), deviceScaleFactor: 1 });
  const testPage = await context.newPage();
  const checks = [], samples = [], runtimeErrors = [];
  let stage = 'initialization';
  let releaseParser;
  testPage.on('pageerror', error => runtimeErrors.push(String(error)));
  testPage.on('console', message => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
  await installDesktopBridgeMock(testPage);
  await testPage.addInitScript(() => localStorage.setItem('folia.desktop.mode.v1', 'classic'));
  const frame = () => testPage.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const emit = async (type, data) => {
    await testPage.evaluate(({ type, data }) => window.__foliaEmit(type, data), { type, data }); await frame();
  };
  const storage = () => testPage.evaluate(prefix => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith(prefix))), prefix);
  const open = async () => {
    if (!await testPage.locator('.control-panel').count()) await testPage.getByRole('button', { name: '打开歌词设置', exact: true }).click();
    await testPage.locator('.offset-row').waitFor();
  };
  const expectOffset = async (offset, name) => {
    const expected = labelFor(offset);
    await testPage.waitForFunction(expected => document.querySelector('.offset-row > span')?.textContent === expected, expected);
    assert.equal(await testPage.locator('.offset-row > span').innerText(), expected, name);
    samples.push({ stage: name, offset, storage: await storage() });
  };
  const change = async (steps, name) => {
    const button = testPage.getByRole('button', { name: steps > 0 ? '歌词提前 0.2 秒' : '歌词延后 0.2 秒', exact: true });
    for (let count = 0; count < Math.abs(steps); count++) await button.click();
    await frame();
    samples.push({ stage: name, label: await testPage.locator('.offset-row > span').innerText(), storage: await storage() });
  };
  const expectSaved = (key, value) => testPage.waitForFunction(({ key, value }) => localStorage.getItem(key) === String(value), { key, value });
  const reload = async () => {
    await testPage.reload({ waitUntil: 'networkidle' });
    await testPage.waitForFunction(() => window.__foliaReadyAt !== null); await open();
  };
  const importedRows = async title => Object.entries(await storage()).filter(([key]) => {
    const version = JSON.parse(key.slice(prefix.length)); return version[0] === title.toLowerCase() && version[2] === 'lyrics';
  });
  const packet = (title, artist, content, key = '') => ({ key, title, artist, content, format: 'lrc', source: '本地导入 · offset.lrc', cover: '', embedded: false });
  try {
    await testPage.goto(page.url(), { waitUntil: 'networkidle' });
    await testPage.waitForFunction(() => window.__foliaReadyAt !== null); await open();
    const original = { ...song, key: 'offset-original', title: 'Offset Same Title', artist: 'Offset Singer', album: 'Album A',
      duration: 180, position: 2, playing: false, source: 'Offset Player A', sessionId: 'offset-session-a' };
    stage = 'version-isolation';
    await emit('session', original); await expectOffset(0, 'original version begins without calibration');
    await change(2, 'edit original version'); await expectOffset(.4, 'original version saves its own calibration');
    await expectSaved(metadataKey(original), .4);
    const otherAlbum = { ...original, key: 'offset-other-album', album: 'Album B' };
    await emit('session', otherAlbum); await expectOffset(0, 'same name in a different album has no inherited offset');
    await change(-1, 'edit other album'); await expectOffset(-.2, 'other album keeps a separate calibration');
    await expectSaved(metadataKey(otherAlbum), -.2);
    const otherDuration = { ...original, key: 'offset-other-duration', duration: 241 };
    await emit('session', otherDuration); await expectOffset(0, 'same album with a different recording duration has no inherited offset');
    await change(1, 'edit other duration'); await expectSaved(metadataKey(otherDuration), .2);
    checks.push('same title and artist retain independent calibrations for different albums and recording durations');

    stage = 'cross-player-restore';
    const otherPlayer = { ...original, key: 'offset-another-player-key', source: 'Offset Player B', sessionId: 'offset-session-b' };
    await emit('session', otherPlayer); await expectOffset(.4, 'the same metadata restores calibration through another player');
    await emit('session', otherAlbum); await expectOffset(-.2, 'album calibration survives switching players and versions');
    await emit('session', otherDuration); await expectOffset(.2, 'duration calibration survives switching versions');
    checks.push('the persisted song version is shared across players while album and duration records remain separate');

    stage = 'immediate-song-reset';
    await emit('session', original); await expectOffset(.4, 'prepare a nonzero calibration before switching');
    const rapid = { ...original, key: 'offset-rapid-next', title: 'Offset Rapid Next', artist: 'Next Singer' };
    const commits = await testPage.evaluate(async next => {
      const commits = [];
      const observer = new MutationObserver(() => commits.push({ title: document.querySelector('.track-caption strong')?.textContent,
        offset: document.querySelector('.offset-row > span')?.textContent }));
      observer.observe(document.querySelector('.desktop-lyrics'), { subtree: true, childList: true, characterData: true });
      window.__foliaEmit('session', next);
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))); observer.disconnect(); return commits;
    }, rapid);
    await expectOffset(0, 'an unknown next song immediately resets calibration');
    const nextCommits = commits.filter(commit => commit.title === rapid.title);
    assert(nextCommits.length > 0, 'the next-song DOM commit is observed');
    assert(nextCommits.every(commit => commit.offset === labelFor(0)), 'every next-song DOM commit already has its own zero offset');
    samples.push({ stage, commits });
    checks.push('the first DOM commit for a new song already shows zero calibration instead of one frame of the previous song offset');

    stage = 'import-fingerprint-isolation';
    const disconnected = { ...song, key: '', title: '', artist: '', album: '', duration: 0, position: 0,
      source: '', sessionId: '', sources: [], playing: false, hasTimeline: false, controls: null };
    const importedA = packet('Imported Same Title', 'Imported Singer', '[00:01.00]第一份歌词\n[00:12.00]第一份的下一行');
    const importedB = { ...importedA, content: '[00:01.00]第二份歌词\n[00:22.00]不同的时间轴', source: '本地导入 · another.lrc' };
    await emit('session', disconnected); await emit('lyrics', importedA); await expectOffset(0, 'first disconnected import has no calibration');
    await change(3, 'edit first disconnected import'); await expectOffset(.6, 'first imported lyric saves its fingerprint calibration');
    await expectSaved(importedKey(importedA), .6);
    const firstRows = await importedRows(importedA.title); assert.equal(firstRows.length, 1);
    await emit('lyrics', importedB); await expectOffset(0, 'same-name imported lyrics with different timed content reset calibration');
    await change(-2, 'edit second disconnected import'); await expectOffset(-.4, 'second imported lyric has an independent calibration');
    await expectSaved(importedKey(importedB), -.4);
    const secondRows = await importedRows(importedB.title);
    assert.equal(secondRows.length, 2); assert.deepEqual(secondRows.map(([, value]) => Number(value)).sort((a, b) => a - b), [-.4, .6]);
    await emit('lyrics', { ...importedA, source: '另一个来源描述', translation: '[00:01.00]New translation' });
    await expectOffset(.6, 'source descriptions and translations do not change the timed lyric version');
    assert.equal((await importedRows(importedA.title)).length, 2);
    checks.push('without a media session, same-name imports use independent timed-content fingerprints while descriptive source and translation changes retain calibration');

    stage = 'import-reload';
    await reload(); await emit('lyrics', importedA); await expectOffset(.6, 'first imported fingerprint restores after reloading');
    await emit('lyrics', importedB); await expectOffset(-.4, 'second imported fingerprint restores after reloading');
    checks.push('both disconnected imported-lyric calibrations survive a real browser reload');

    stage = 'late-import-packet';
    // Reload clears the module cache. Hold the real parser import so two animation frames
    // cannot accidentally stand in for parsing, identity adoption and the persistence effect.
    const parserModule = /\/parseDesktopLyrics(?:-[\w-]+)?\.(?:js|ts)(?:\?|$)/;
    const parserGate = new Promise(done => { releaseParser = done; });
    const holdParser = async route => { await parserGate; await route.continue(); };
    await testPage.route(parserModule, holdParser);
    await reload(); await expectOffset(0, 'a fresh disconnected page has no song identity');
    const beforePendingImport = await storage();
    await change(4, 'edit while the first import packet is pending'); await expectOffset(.8, 'pending import retains the local calibration draft');
    assert.deepEqual(await storage(), beforePendingImport, 'a draft without title or content cannot write a guessed song version');
    const lateImport = packet('Late Imported Title', 'Late Imported Singer', '[00:01.00]歌词和标题稍后一起到达\n[00:16.00]保留刚才的校准');
    const parserRequested = testPage.waitForRequest(parserModule);
    await emit('lyrics', lateImport); await parserRequested;
    await expectOffset(.8, 'the pending parser still shows the calibration draft');
    assert.deepEqual(await storage(), beforePendingImport, 'unparsed lyrics cannot persist a guessed identity');
    releaseParser();
    // The label is already 0.8 before lyrics arrive; only the exact fingerprint record
    // proves that the asynchronous import has committed and saved the draft.
    await expectSaved(importedKey(lateImport), .8);
    await expectOffset(.8, 'the first late import packet preserves the already edited calibration');
    const lateRows = await importedRows(lateImport.title); assert.equal(lateRows.length, 1);
    await reload(); await emit('lyrics', lateImport); await expectOffset(.8, 'late import calibration is restored from its final fingerprint');
    checks.push('an offset edited before the first disconnected lyric packet is carried into its arriving title and fingerprint and survives reload');

    stage = 'late-media-metadata';
    const early = { ...original, key: 'offset-late-metadata', title: 'Late Metadata Title', artist: 'Late Metadata Singer', album: '', duration: 0 };
    const completed = { ...early, album: 'Late Album', duration: 201 };
    await emit('session', early); await expectOffset(0, 'an incomplete new media identity begins at zero');
    await change(2, 'edit before album and duration arrive'); await expectOffset(.4, 'incomplete media identity retains its calibration draft');
    await testPage.evaluate(key => localStorage.setItem(key, '1.2'), metadataKey(completed));
    await emit('session', completed); await expectOffset(.4, 'late metadata keeps the user edit instead of replacing it with an older saved value');
    await expectSaved(metadataKey(completed), .4);
    await emit('lyrics', packet(completed.title, completed.artist, '[00:01.00]媒体元数据已经补齐\n[00:16.00]歌词随后到达', completed.key));
    await expectOffset(.4, 'a later lyric packet keeps the completed media version calibration');
    await reload(); await emit('session', { ...completed, source: 'Restored Player', sessionId: 'restored-session', key: 'restored-key' });
    await expectOffset(.4, 'late metadata calibration persists through reload and another player');
    checks.push('album and duration enrichment preserves a live user edit, replaces an older saved calibration and restores the final media version on reload');
    await testPage.screenshot({ path: `${output}/desktop-offset.png` });
    assert.equal(runtimeErrors.length, 0, runtimeErrors.join('\n'));
    return { checks, samples, runtimeErrors };
  } catch (error) {
    const diagnostic = { stage, checks, samples, runtimeErrors, storage: await storage().catch(() => ({})), error: String(error) };
    await writeFile(`${output}/desktop-offset-failure.json`, JSON.stringify(diagnostic, null, 2));
    await testPage.screenshot({ path: `${output}/desktop-offset-failure.png`, timeout: 10000 }).catch(() => {});
    throw error;
  } finally { releaseParser?.(); await testPage.unrouteAll({ behavior: 'wait' }); await context.close(); }
}
