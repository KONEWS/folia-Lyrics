import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

// test/verify-desktop-parser-formats.mjs — observe the actual parser Worker and original rendered translation.
export async function installDesktopParserProbe(page) {
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.__foliaParserProbe = { workers: [], requests: [], responses: [] };
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(),
      inject(renderer) { this.renderers.set(1, renderer); return 1; }, checkDCE() {},
      onCommitFiberRoot(_renderer, root) {
        if (root.containerInfo === document.getElementById('root')) window.__foliaParserCommittedContainer = root;
      }, onCommitFiberUnmount() {}, onScheduleFiberRoot() {} };
    // Observe the live DOM root; Diorama's separate Three.js root may commit or unmount after the desktop root.
    Object.defineProperty(window, '__foliaParserCommittedRoot', { get: () => window.__foliaParserCommittedContainer?.current });
    window.__foliaParserReadRenderer = () => {
      const stack = [window.__foliaParserCommittedRoot];
      while (stack.length) {
        const node = stack.pop(); if (!node) continue;
        const props = node.memoizedProps;
        if (props?.mode === 'classic' && Array.isArray(props.lines) && props.currentTime) return props;
        if (node.sibling) stack.push(node.sibling); if (node.child) stack.push(node.child);
      }
      return null;
    };
    // The visual-settings suite observes committed production props for every original mode.
    window.__foliaReadVisualizerProps = () => {
      const stack = [window.__foliaParserCommittedRoot];
      while (stack.length) {
        const node = stack.pop(); if (!node) continue;
        const props = node.memoizedProps;
        if (typeof props?.mode === 'string' && Array.isArray(props.lines) && props.currentTime && props.theme) return props;
        if (node.sibling) stack.push(node.sibling); if (node.child) stack.push(node.child);
      }
      return null;
    };
    window.__foliaReadResolvedVisualizerProps = mode => {
      const stack = [window.__foliaParserCommittedRoot];
      while (stack.length) {
        const node = stack.pop(); if (!node) continue;
        const props = node.memoizedProps;
        if (!props?.mode && Array.isArray(props?.lines) && props.currentTime && props.theme && props[`${mode}Tuning`]) return props;
        if (node.sibling) stack.push(node.sibling); if (node.child) stack.push(node.child);
      }
      return null;
    };
    window.__foliaParserReadLines = () => window.__foliaParserReadRenderer()?.lines || [];
    window.__foliaParserReadData = () => {
      const stack = [window.__foliaParserCommittedRoot];
      while (stack.length) {
        const node = stack.pop(); if (!node) continue;
        for (let hook = node.memoizedState; hook; hook = hook.next) {
          const value = hook.memoizedState;
          if (Array.isArray(value?.lines) && typeof value.isWordByWord === 'boolean') return value;
        }
        if (node.sibling) stack.push(node.sibling); if (node.child) stack.push(node.child);
      }
      return null;
    };
    window.Worker = class extends OriginalWorker {
      constructor(...args) {
        super(...args);
        window.__foliaParserProbe.workers.push(String(args[0]));
        this.addEventListener('message', event => window.__foliaParserProbe.responses.push(structuredClone(event.data)));
      }
      postMessage(...args) {
        const request = args[0];
        if (request?.type === 'parse') window.__foliaParserProbe.requests.push(structuredClone(request));
        super.postMessage(...args);
        // Trigger a real song change after A has entered the Worker, before its result can be delivered.
        const swap = window.__foliaParserSwapAfterPost;
        if (swap && request?.content.includes(swap.marker)) {
          delete window.__foliaParserSwapAfterPost;
          queueMicrotask(() => { window.__foliaEmit('session', swap.song); window.__foliaEmit('lyrics', swap.packet); });
        }
      }
    };
  });
}

export async function verifyDesktopParserFormats(page, song, output) {
  const checks = [], samples = [];
  let activeFormat = 'initialization';
  const saved = await page.evaluate(() => ({ mode: localStorage.getItem('folia.desktop.mode.v1'),
    prefs: sessionStorage.getItem('folia.test.mockPreferences') }));
  const packet = (format, content, translation = '') => ({ key: `format-${format}`, title: `格式 ${format}`, artist: '原版解析器',
    content, translation, cover: '', source: `parser-${format}`, embedded: false, format });
  const ttml = '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Word"><body><div><p begin="00:01.000" end="00:05.000" itunes:key="L1"><span begin="00:01.000" end="00:02.000">词</span><span begin="00:02.000" end="00:05.000">时</span><span ttm:role="x-bg" begin="00:02.000" end="00:03.000"><span begin="00:02.000" end="00:03.000">和声</span><span ttm:role="x-translation" xml:lang="zh-CN">和声原版译文</span></span><span ttm:role="x-translation" xml:lang="zh-CN">TTML原版译文</span></p></div></body></tt>';
  const krcLanguage = Buffer.from(JSON.stringify({ content: [{ lyricContent: [['KRC原版译文']], type: 1 }] })).toString('base64');
  const fia = JSON.stringify({ format: 'folia-lyricdata', version: 1, exportedAt: '2026-10-02T00:00:00.000Z', song: {},
    lyrics: { isWordByWord: true, lines: [{ startTime: 1, endTime: 5, fullText: '词时', translation: 'FIA原版译文', wordSegments: ['词', '时'],
      words: [{ text: '词', startTime: 1, endTime: 2 }, { text: '时', startTime: 2, endTime: 5 }] }] } });
  const fixtures = [
    { packet: packet('lrc', '[00:01.000]逐行歌词\n[00:05.000]下一行', '[00:01.000]LRC原版译文'), worker: null, translated: 'LRC原版译文', word: false },
    { packet: packet('lrc', '[00:01.000]大文件逐行歌词\n[00:05.000]下一行\n' + '未计时填充内容\n'.repeat(6000), '[00:01.000]大LRC原版译文'), worker: 'lrc', translated: '大LRC原版译文', word: false },
    { packet: packet('lrc', '[00:01.000]主轨短译文大\n[00:05.000]下一行', '[00:01.000]长译文LRC原版译文\n' + '未计时填充译文\n'.repeat(6000)), worker: 'lrc', translated: '长译文LRC原版译文', word: false },
    { packet: packet('lrc', '[00:01.000]<00:01.000>词<00:02.000>时<00:05.000>', '[00:01.000]增强LRC原版译文'), worker: 'enhanced-lrc', translated: '增强LRC原版译文', word: true },
    { packet: packet('yrc', '[1000,4000](1000,1000,0)词(2000,3000,0)时', '[00:01.000]YRC原版译文'), worker: 'yrc', translated: 'YRC原版译文', word: true },
    { packet: packet('qrc', '[1000,4000](1000,1000)词(2000,3000)时', '[00:01.000]QRC原版译文'), worker: 'qrc', translated: 'QRC原版译文', word: true },
    { packet: packet('krc', `[1000,4000]<0,1000,0>词<1000,3000,0>时\n[language:${krcLanguage}]`), worker: 'krc', translated: 'KRC原版译文', word: true },
    { packet: packet('ttml', ttml), worker: 'ttml', translated: 'TTML原版译文', word: true },
    { packet: packet('fia', fia), worker: null, translated: 'FIA原版译文', word: true },
    { packet: { ...packet('qq-qrc', 'invalid-test-ciphertext'), fallbackContent: '[00:01.000]密文回退歌词\n[00:05.000]下一句',
      fallbackTranslation: '[00:01.000]QQ回退原版译文' }, worker: null, translated: 'QQ回退原版译文', word: false },
  ];
  const subtitle = page.locator('[data-font-debug-target="visualizer-translation"]');
  // Reload into a lightweight original renderer so parser formats do not depend on a previous style's fade duration.
  try {
    await page.evaluate(() => {
      localStorage.setItem('folia.desktop.mode.v1', 'classic');
      sessionStorage.setItem('folia.test.mockPreferences', JSON.stringify({ autoImmersive: false, audioReactive: false }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    for (const fixture of fixtures) {
      activeFormat = fixture.translated;
      const before = await page.evaluate(() => window.__foliaParserProbe.requests.length);
      await page.evaluate(({ song, packet }) => {
        window.__foliaEmit('session', { ...song, key: packet.key, title: packet.title, position: 2.5, playing: false });
        window.__foliaEmit('lyrics', packet);
      }, { song, packet: fixture.packet });
      await page.waitForFunction(text => document.querySelector('[data-font-debug-target="visualizer-translation"]')?.textContent === text,
        fixture.translated, { timeout: 60000 });
      assert.equal(await subtitle.innerText(), fixture.translated);
      assert.equal(await page.getByText('这个动效暂时无法显示', { exact: false }).count(), 0);
      const sample = await page.evaluate(before => {
        const probe = window.__foliaParserProbe, requests = probe.requests.slice(before);
        const lines = window.__foliaParserReadLines();
        return { requests, responses: probe.responses.filter(response => requests.some(request => request.requestId === response.requestId)), parsedData: window.__foliaParserReadData(),
          renderedLines: lines.map(({ fullText, startTime, endTime, words, translation, wordSegments }) => ({ fullText, startTime, endTime, words, translation, wordSegments })) };
      }, before);
      if (fixture.worker) {
        assert.equal(sample.requests.length, 1, `${fixture.translated}: exactly one original Worker parse request`);
        assert.equal(sample.requests[0].format, fixture.worker);
        assert.equal(sample.responses[0]?.type, 'result');
        const parsed = sample.responses[0].data, line = parsed.lines.find(line => line.translation === fixture.translated);
        assert(line, `${fixture.translated}: translated line comes from the actual Worker result`);
        assert.equal(Boolean(parsed.isWordByWord), fixture.word, `${fixture.translated}: preserve line/word timing classification`);
        if (fixture.word) {
          assert.deepEqual(line.words.map(word => ({ text: word.text, start: word.startTime, end: word.endTime })),
            [{ text: '词', start: 1, end: 2 }, { text: '时', start: 2, end: 5 }], `${fixture.translated}: exact word timeline survives Worker transfer`);
        }
        if (fixture.worker === 'ttml') {
          assert.equal(line.backgroundVocal?.text, '和声');
          assert.equal(line.backgroundVocal?.translation, '和声原版译文', 'TTML harmony survives original Worker conversion');
        }
      } else {
        assert.equal(sample.requests.length, 0, `${fixture.translated}: direct original parser/document path avoids Worker startup`);
        assert.equal(sample.parsedData?.isWordByWord, fixture.word, `${fixture.translated}: actual desktop state preserves timing classification`);
        const rendered = sample.renderedLines.find(line => line.translation === fixture.translated);
        assert(rendered, 'parsed data reaches the actual original renderer props');
        if (fixture.packet.format === 'fia') {
          assert.deepEqual(rendered.words, [{ text: '词', startTime: 1, endTime: 2 }, { text: '时', startTime: 2, endTime: 5 }]);
          assert.deepEqual(rendered.wordSegments, ['词', '时'], 'FIA preserves explicit segmentation');
        }
      }
      samples.push({ format: fixture.worker || fixture.packet.format, route: fixture.worker ? 'Worker' : 'original direct parser/document', translation: fixture.translated, ...sample });
      checks.push(`${fixture.packet.format === 'qq-qrc' ? 'QQ encrypted fallback' : fixture.worker || fixture.packet.format} original parsing, translation and timing classification`);
      console.log('PASS parser', fixture.translated);
    }
    const replacement = packet('yrc', '[1000,4000](1000,1000,0)词(2000,3000,0)时', '[00:01.000]最终歌曲译文');
    replacement.key = 'after-worker-race';
    activeFormat = 'in-flight Worker song change';
    await page.evaluate(({ song, replacement }) => {
      window.__foliaParserSwapAfterPost = { marker: '应丢弃的进行中歌词', song: { ...song, key: replacement.key, title: replacement.title, position: 2.5 }, packet: replacement };
      window.__foliaEmit('session', { ...song, key: 'in-flight-A', position: 2.5 });
      window.__foliaEmit('lyrics', { key: 'in-flight-A', content: '[1000,4000](1000,4000,0)应丢弃的进行中歌词', format: 'yrc', source: 'race-A' });
    }, { song, replacement });
    await page.waitForFunction(() => document.querySelector('[data-font-debug-target="visualizer-translation"]')?.textContent === '最终歌曲译文');
    await page.waitForFunction(() => {
      const probe = window.__foliaParserProbe;
      const request = probe.requests.find(request => request.content.includes('应丢弃的进行中歌词'));
      return request && probe.responses.some(response => response.requestId === request.requestId);
    });
    assert.equal(await subtitle.innerText(), '最终歌曲译文', 'the in-flight result for the previous song cannot overwrite the current song');
    assert.equal(await page.locator('.waiting-screen').count(), 0);
    checks.push('in-flight Worker result rejected after a real song change');
    await page.screenshot({ path: `${output}/parser-formats-final.png` });
    await writeFile(`${output}/parser-formats-results.json`, JSON.stringify({ checks, samples }, null, 2));
    console.log('PASS desktop parser format and in-flight song-change checks');
    return checks;
  } catch (error) {
    const state = await page.evaluate(() => ({ probe: window.__foliaParserProbe,
      caption: document.querySelector('.track-caption')?.textContent, clock: document.querySelector('.clock-readout')?.textContent,
      subtitle: document.querySelector('[data-font-debug-target="visualizer-translation"]')?.textContent,
      stage: document.querySelector('.desktop-stage')?.textContent, notice: document.querySelector('.desktop-notice')?.textContent }));
    await writeFile(`${output}/parser-format-failure.json`, JSON.stringify({ activeFormat, checks, samples, state }, null, 2));
    console.error(`FAIL parser ${activeFormat}`, JSON.stringify(state));
    throw error;
  } finally {
    await page.evaluate(saved => {
      for (const [key, value, storage] of [['folia.desktop.mode.v1', saved.mode, localStorage], ['folia.test.mockPreferences', saved.prefs, sessionStorage]]) {
        if (value === null) storage.removeItem(key); else storage.setItem(key, value);
      }
    }, saved);
    await page.reload({ waitUntil: 'networkidle' });
  }
}
