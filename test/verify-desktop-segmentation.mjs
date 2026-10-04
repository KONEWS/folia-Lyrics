import assert from 'node:assert/strict';
import { selectDesktopOption } from './desktop-select.mjs';
import { emitVisual, readVisual, waitVisual, readVisualCache, reloadVisualSong, visualFrame } from './desktop-visual-fixture.mjs';

// test/verify-desktop-segmentation.mjs — original grouping records change wordSegments while preserving exact timed words.
export async function installDesktopSegmentationProbe(page) {
  await page.addInitScript(() => {
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = originalPut.apply(this, args), swap = window.__foliaSegmentationSwapOnWrite;
      if (swap && args[0]?.key === `lyricSeg_desktop:${swap.key}`) {
        delete window.__foliaSegmentationSwapOnWrite; window.__foliaSegmentationRealWriteSeen = args[0].key;
        // This is an actual native IndexedDB request; switch the song before its transaction completes.
        queueMicrotask(() => { window.__foliaEmit('session', swap.song); window.__foliaEmit('lyrics', swap.packet); });
      }
      return request;
    };
  });
}

export async function verifyDesktopSegmentation(page, song, output, samples) {
  const checks = [], key = 'visual-segmentation-A', otherKey = 'visual-segmentation-B';
  const songA = { ...song, key, title: '逐字分词 A', playing: false, position: 2 };
  const songB = { ...song, key: otherKey, title: '逐字分词 B', playing: false, position: 2 };
  const packet = (identity, fullText) => ({ key: identity.key, title: identity.title, artist: identity.artist, cover: '', source: '精确 FIA 词轴', format: 'fia',
    content: JSON.stringify({ format: 'folia-lyricdata', version: 1, exportedAt: '2026-10-03T00:00:00.000Z', song: {},
      lyrics: { isWordByWord: true, lines: [{ startTime: 1, endTime: 5, fullText, translation: '词轴保持不变',
        words: [{ text: fullText.slice(0, 2), startTime: 1, endTime: 2 }, { text: fullText.slice(2, 4), startTime: 2, endTime: 3 },
          { text: fullText.slice(4), startTime: 3, endTime: 5 }] }] } }) });
  const packetA = packet(songA, '春风吹过原野'), packetB = packet(songB, '秋雨落在山川');
  const dialog = page.getByRole('dialog', { name: '本曲歌词分词', exact: true });
  const open = async () => { await page.locator('.segmentation-shortcut').click(); await dialog.waitFor();
    await page.waitForFunction(() => { const input = document.querySelector('.desktop-segmentation-editor textarea'); return input && !input.disabled; }); };
  const close = async () => { await dialog.getByRole('button', { name: '关闭分词设置', exact: true }).click(); await dialog.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.classList.contains('segmentation-shortcut')); };
  await selectDesktopOption(page, '歌词样式', { value: 'classic' });
  await emitVisual(page, 'session', songA); await emitVisual(page, 'lyrics', packetA);
  await page.waitForFunction(() => window.__foliaReadVisualizerProps?.()?.lines[0]?.fullText === '春风吹过原野');
  const before = await readVisual(page);
  await page.evaluate(() => { const props = window.__foliaReadVisualizerProps(); window.__foliaSegmentationOriginalWords = props.lines[0].words; window.__foliaSegmentationOriginalClock = props.currentTime; });
  await open();
  const closeButton = dialog.getByRole('button', { name: '关闭分词设置', exact: true });
  assert(await closeButton.evaluate(element => element === document.activeElement));
  await page.keyboard.press('Shift+Tab');
  assert(await dialog.getByRole('button', { name: '复制当前结果', exact: true }).evaluate(element => element === document.activeElement));
  await page.keyboard.press('Tab'); assert(await closeButton.evaluate(element => element === document.activeElement));
  await dialog.getByRole('textbox', { name: '分词内容', exact: true }).fill('春风/吹过/原野');
  await dialog.getByRole('button', { name: '保存分词', exact: true }).click();
  await page.waitForFunction(() => JSON.stringify(window.__foliaReadVisualizerProps?.()?.lines[0]?.wordSegments) === JSON.stringify(['春风', '吹过', '原野']));
  const after = await readVisual(page);
  assert.deepEqual(after.lines[0].words, before.lines[0].words); assert.equal(after.lines[0].startTime, before.lines[0].startTime); assert.equal(after.lines[0].endTime, before.lines[0].endTime);
  assert.equal(after.lines[0].fullText, before.lines[0].fullText); assert.equal(after.lines[0].translation, before.lines[0].translation);
  assert(await page.evaluate(() => { const props = window.__foliaReadVisualizerProps(); return props.lines[0].words === window.__foliaSegmentationOriginalWords && props.currentTime === window.__foliaSegmentationOriginalClock; }));
  assert.equal(after.clock, before.clock);
  const records = await readVisualCache(page, `lyricSeg_desktop:${key}`); assert.equal(records.length, 1);
  assert.equal(records[0].data.source, 'manual'); assert.equal(records[0].data.songKey, `desktop:${key}`);
  samples.push({ context: 'grouping-only', before: before.lines[0], after: after.lines[0], record: records[0] });
  await page.screenshot({ path: `${output}/visual-segmentation-saved.png` });
  await dialog.getByRole('textbox', { name: '分词内容', exact: true }).fill('不可修改原文');
  await dialog.getByRole('button', { name: '保存分词', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.desktop-segmentation-settings [role="status"]')?.textContent.includes('对不上'));
  assert.deepEqual((await readVisual(page)).lines, after.lines); await close();
  checks.push('segmentation modal traps reverse/forward Tab; manual grouping changes only wordSegments, retains the exact word timing/clock references, persists a genuine record and rejects changed lyric text');

  await reloadVisualSong(page, songA, packetA); await waitVisual(page, { mode: 'classic' });
  await page.waitForFunction(() => JSON.stringify(window.__foliaReadVisualizerProps?.()?.lines[0]?.wordSegments) === JSON.stringify(['春风', '吹过', '原野']));
  assert.deepEqual((await readVisual(page)).lines[0].words, before.lines[0].words);
  await open(); await dialog.getByRole('textbox', { name: '分词内容', exact: true }).fill('春/风吹/过原野');
  await page.evaluate(({ key, song, packet }) => { window.__foliaSegmentationSwapOnWrite = { key, song, packet }; }, { key, song: songB, packet: packetB });
  await dialog.getByRole('button', { name: '保存分词', exact: true }).click();
  await page.waitForFunction(() => window.__foliaSegmentationRealWriteSeen && window.__foliaReadVisualizerProps?.()?.lines[0]?.fullText === '秋雨落在山川');
  await visualFrame(page);
  const next = await readVisual(page); assert.notDeepEqual(next.lines[0].wordSegments, ['春', '风吹', '过原野']);
  assert.deepEqual(next.lines[0].words, JSON.parse(packetB.content).lyrics.lines[0].words);
  assert.equal((await readVisualCache(page, `lyricSeg_desktop:${otherKey}`)).length, 0);
  assert.equal((await readVisualCache(page, `lyricSeg_desktop:${key}`)).length, 1);
  samples.push({ context: 'real-indexedDB-cross-song-write', next: next.lines[0], marker: await page.evaluate(() => window.__foliaSegmentationRealWriteSeen) });
  await dialog.waitFor({ state: 'detached' });
  await emitVisual(page, 'session', songA); await emitVisual(page, 'lyrics', packetA);
  await page.waitForFunction(() => window.__foliaReadVisualizerProps?.()?.lines[0]?.fullText === '春风吹过原野'
    && JSON.stringify(window.__foliaReadVisualizerProps()?.lines[0]?.wordSegments) === JSON.stringify(['春', '风吹', '过原野']));
  await open(); await dialog.getByRole('button', { name: '恢复默认', exact: true }).click();
  await page.waitForFunction(() => !window.__foliaReadVisualizerProps?.()?.lines[0]?.wordSegments);
  assert.equal((await readVisualCache(page, `lyricSeg_desktop:${key}`)).length, 0);
  await close();
  checks.push('reload restores the saved grouping; an actual in-flight IndexedDB write remains owned by song A after switching to B, and reset removes only its per-song record');
  return checks;
}
