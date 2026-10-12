import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installDesktopBridgeMock } from './desktop-bridge-mock.mjs';

// test/verify-desktop-notices.mjs — isolated full-app notice timing and narrow-window layout with the shared fake host.
const output = resolve(process.env.FOLIA_UI_OUTPUT || 'test-results/desktop-notices');
await mkdir(output, { recursive: true });
let server, browser;
const checks = [], samples = [], errors = [];
try {
  let url = process.env.FOLIA_TEST_URL;
  if (!url) {
    server = await createServer({ configFile: resolve('vite.desktop.config.ts'), server: { host: '127.0.0.1', port: 0, hmr: false } });
    await server.listen(); url = `http://127.0.0.1:${server.httpServer.address().port}/desktop.html`;
  }
  const origin = new URL(url).origin;
  browser = await chromium.launch({ executablePath: process.env.FOLIA_CHROMIUM_PATH, headless: true, args: ['--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await installDesktopBridgeMock(page);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('.waiting-screen h1').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.clock.install({ time: new Date('2026-10-12T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-12T12:00:01Z'));
  const notice = page.locator('.desktop-message-notice');
  const emit = (type, data) => page.evaluate(({ type, data }) => window.__foliaEmit(type, data), { type, data });
  const publish = async (text, target) => { await emit('notice', { text, target }); await notice.waitFor(); };
  const inspect = () => notice.evaluate(element => {
    const box = element.getBoundingClientRect(), lines = [...element.querySelectorAll('.desktop-notice-line')].map(line => {
      const bounds = line.getBoundingClientRect(), style = getComputedStyle(line);
      return { text: line.textContent, bounds: bounds.toJSON(), height: line.offsetHeight, lineHeight: Number.parseFloat(style.lineHeight),
        whiteSpace: style.whiteSpace, overflow: style.overflow, ellipsis: style.textOverflow, width: line.clientWidth, scrollWidth: line.scrollWidth };
    });
    return { bounds: box.toJSON(), lines, action: element.querySelector('button').getBoundingClientRect().toJSON(), viewport: { width: innerWidth, height: innerHeight } };
  });

  for (const [width, height] of [[1280, 800], [600, 450], [450, 300]]) {
    await page.setViewportSize({ width, height });
    for (const name of ['foobar2000 应用程序', '这是一个名称很长的音乐播放软件名称（测试）'.repeat(6)]) {
      await publish(`已请求打开 ${name}，请在播放器中播放歌曲。`, { id: 'player-source' });
      const sample = await inspect(); samples.push(sample);
      assert.equal(sample.lines.length, 2); assert.equal(sample.lines[1].text, '请在播放器中播放歌曲。');
      for (const line of sample.lines) { assert.equal(line.whiteSpace, 'nowrap'); assert(line.height < line.lineHeight + 2); }
      assert(sample.lines[1].bounds.y > sample.lines[0].bounds.y);
      assert(sample.bounds.x >= 0 && sample.bounds.right <= width, 'notice remains within the viewport');
      assert(sample.lines[1].width >= sample.lines[1].scrollWidth, 'the second line remains fully visible');
      assert(sample.action.x >= sample.lines[0].bounds.right && sample.action.right <= sample.bounds.right, 'settings action remains beside the message');
      await page.screenshot({ path: `${output}/notice-${width}-${name.startsWith('foobar') ? 'normal' : 'long-name'}.png` });
    }
  }
  checks.push('three desktop widths keep launch notices on two semantic lines; long names ellipsize, the complete playback instruction and settings button remain visible');

  await publish('计时测试'); await page.clock.runFor(4999); assert.equal(await notice.innerText(), '计时测试\n关闭');
  await page.clock.runFor(1); await notice.waitFor({ state: 'detached' });
  checks.push('the rendered transient notice disappears exactly five seconds after its host message');
  await publish('旧消息'); await page.clock.runFor(4000); await publish('新消息'); await page.clock.runFor(1000);
  assert.match(await notice.innerText(), /新消息/); await page.clock.runFor(4000); await notice.waitFor({ state: 'detached' });
  checks.push('a newer host notice survives the old deadline and receives its own five seconds');

  await publish('打开设置', { id: 'player-source' }); await notice.getByRole('button', { name: '查看设置', exact: true }).click();
  await notice.waitFor({ state: 'detached' }); await page.locator('.control-panel').waitFor();
  checks.push('the notice action opens the real settings panel and immediately dismisses the notice');
  await page.clock.runFor(5000); assert.equal(await notice.count(), 0);
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(`PASS desktop notices: ${checks.length} checks, ${samples.length} responsive samples`);
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ checks, samples, errors }, null, 2));
  await browser?.close(); await server?.close();
}
