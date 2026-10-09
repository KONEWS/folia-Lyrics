import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
import { installDesktopBridgeMock } from './desktop-bridge-mock.mjs';

// test/benchmark-playback-toggle.mjs — replay identical transport events and count committed lyric-word work and silent SVG writes.
const root = resolve(process.env.FOLIA_BENCH_DIST || 'dist-desktop');
const output = resolve(process.env.FOLIA_BENCH_OUTPUT || 'test-results/playback-performance');
const label = process.env.FOLIA_BENCH_LABEL || 'after';
await mkdir(output, { recursive: true });
const mimes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.otf': 'font/otf', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (!path.startsWith(root + sep)) throw Error('invalid resource path');
    const data = await readFile(path); response.writeHead(200, { 'Content-Type': mimes[extname(path)] || 'application/octet-stream' }); response.end(data);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ executablePath: process.env.FOLIA_CHROMIUM_PATH, headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox'] });
const errors = [], results = [];
const song = { key: 'toggle-benchmark', title: '播放暂停性能', artist: '测试播放器', cover: '', source: 'Benchmark player',
  playing: false, position: 36, duration: 300, rate: 0, hasTimeline: true, sessionId: 'toggle-benchmark-session',
  sources: [{ id: 'Benchmark player', label: 'Benchmark player' }], controls: { play: true, pause: true, toggle: true, previous: true, next: true } };
const packet = { key: song.key, title: song.title, artist: song.artist, cover: '', source: 'performance fixture', embedded: false, format: 'lrc',
  content: '[00:01.000]音乐沿着星河流淌 我们走过山川湖海 阳光落在窗前 风吹过遥远的城市\n[04:00.000]下一行歌词',
  translation: '[00:01.000]Pause and resume keep the same lyric layout\n[04:00.000]Next line' };
try {
  for (let trial = 0; trial < 3; trial++) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await installDesktopBridgeMock(page);
    await page.addInitScript(() => {
      localStorage.setItem('folia.desktop.mode.v1', 'classic');
      sessionStorage.setItem('folia.test.mockPreferences', JSON.stringify({ autoImmersive: false, audioReactive: true, coverTheme: false }));
      const probe = window.__foliaToggleProbe = { commits: 0, wordRenders: 0, wordCount: 0, svgWrites: 0, longTasks: [], collecting: false };
      const propsByFiber = new WeakMap();
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(),
        inject(renderer) { this.renderers.set(1, renderer); return 1; }, checkDCE() {}, onCommitFiberUnmount() {}, onScheduleFiberRoot() {},
        onCommitFiberRoot(_renderer, root) {
          let count = 0, changed = 0;
          const visit = fiber => {
            const props = fiber.memoizedProps;
            if (props?.word && props?.config && props?.renderProfile && typeof fiber.type !== 'string') {
              count++;
              const previous = propsByFiber.get(fiber) || propsByFiber.get(fiber.alternate);
              if (previous !== props) changed++;
              propsByFiber.set(fiber, props); if (fiber.alternate) propsByFiber.set(fiber.alternate, props);
            }
            if (fiber.child) visit(fiber.child); if (fiber.sibling) visit(fiber.sibling);
          };
          visit(root.current); probe.wordCount = count;
          if (probe.collecting) { probe.commits++; probe.wordRenders += changed; }
        } };
      const setAttribute = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (name, value) {
        if (probe.collecting && name === 'd' && this.tagName.toLowerCase() === 'path' && this.closest('.audio-progress')) probe.svgWrites++;
        return setAttribute.call(this, name, value);
      };
      new PerformanceObserver(list => {
        if (probe.collecting) probe.longTasks.push(...list.getEntries().map(entry => entry.duration));
      }).observe({ type: 'longtask', buffered: false });
    });
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${server.address().port}/desktop.html`, { waitUntil: 'networkidle' });
    await page.evaluate(({ song, packet }) => { window.__foliaEmit('session', song); window.__foliaEmit('lyrics', packet); }, { song, packet });
    await page.waitForFunction(() => window.__foliaToggleProbe.wordCount > 0);
    await page.waitForTimeout(900);
    const toggles = await page.evaluate(async song => {
      const probe = window.__foliaToggleProbe; probe.collecting = true;
      const frames = [], acknowledgements = []; let prior = performance.now(), frame = 0;
      const tick = now => { frames.push(now - prior); prior = now; frame = requestAnimationFrame(tick); }; frame = requestAnimationFrame(tick);
      for (let index = 0; index < 12; index++) {
        const playing = index % 2 === 0, started = performance.now();
        window.__foliaEmit('session', { ...song, playing });
        await new Promise(done => {
          const check = () => document.querySelector('.transport-primary')?.getAttribute('aria-label') === (playing ? '暂停音乐' : '继续播放音乐')
            ? done() : requestAnimationFrame(check);
          requestAnimationFrame(check);
        });
        acknowledgements.push(performance.now() - started);
        await new Promise(done => setTimeout(done, 125));
      }
      cancelAnimationFrame(frame); probe.collecting = false;
      return { commits: probe.commits, wordPropCommits: probe.wordRenders, words: probe.wordCount,
        buttonUpdateMs: acknowledgements, maxFrameMs: Math.max(...frames), framesOver50ms: frames.filter(value => value > 50).length, longTasks: [...probe.longTasks] };
    }, song);
    assert(toggles.words > 0 && toggles.commits >= 12, 'probe must observe every real transport update');
    if (label === 'after') assert.equal(toggles.wordPropCommits, 0, 'transport state alone must not rerender stable lyric words');
    await page.evaluate(song => {
      window.__foliaEmit('session', { ...song, playing: true });
      const bins = btoa(String.fromCharCode(...new Uint8Array(1024).fill(230)));
      window.__foliaEmit('spectrum', { bins, sampleRate: 48000 });
    }, song);
    await page.waitForFunction(() => Number(document.querySelector('.audio-progress')?.getAttribute('data-energy')) > .1);
    await page.evaluate(song => window.__foliaEmit('session', song), song);
    await page.waitForTimeout(2600);
    const silent = await page.evaluate(async () => {
      const probe = window.__foliaToggleProbe; probe.svgWrites = 0; probe.collecting = true;
      await new Promise(done => setTimeout(done, 1500)); probe.collecting = false;
      return { svgWrites: probe.svgWrites, energy: document.querySelector('.audio-progress')?.getAttribute('data-energy') };
    });
    if (label === 'after') assert.equal(silent.svgWrites, 0, 'settled silence must stop SVG writes');
    await page.evaluate(song => window.__foliaEmit('session', { ...song, position: 241 }), song);
    await page.waitForFunction(() => document.querySelector('[data-font-debug-target="visualizer-translation"]')?.textContent.includes('Next line'));
    // Wait for the new lyric itself to finish appearing; the subtitle can update before the line transition.
    await page.waitForFunction(() => [...document.querySelectorAll('.desktop-stage .origin-center > span.relative')].some(body => {
      if (!body.textContent.startsWith('下')) return false;
      for (let node = body; node && !node.classList.contains('desktop-stage'); node = node.parentElement) {
        if (Number(getComputedStyle(node).opacity) < .7) return false;
      }
      return body.getBoundingClientRect().width > 0 && getComputedStyle(body).filter === 'none';
    }));
    if (trial === 0) {
      await page.screenshot({ path: resolve(output, `${label}-lyric-after-seek.png`) });
    }
    results.push({ trial: trial + 1, toggles, silent });
    console.log(`PASS ${label} trial ${trial + 1}: ${toggles.wordPropCommits} lyric-word prop commits, ${silent.svgWrites} silent SVG writes`);
    await context.close();
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  await writeFile(resolve(output, `${label}.json`), JSON.stringify({ label, browser: browser.version(), conditions: {
    renderer: 'classic', toggles: 12, trials: 3, fixedPlaybackRate: 0, audioReactive: true, viewport: '1280x800 @ 1',
    scope: 'Production browser with mocked native transport. Word-prop commits measure changed committed props at lyric Word fibers; this is not native player latency or whole-process CPU.' }, results, errors }, null, 2));
} finally { await browser.close(); await new Promise(done => server.close(done)); }
