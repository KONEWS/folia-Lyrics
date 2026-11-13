import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { installDesktopBridgeMock } from './desktop-bridge-mock.mjs';
import { installDesktopParserProbe } from './verify-desktop-parser-formats.mjs';
import { emitVisual, readVisual, visualFrame } from './desktop-visual-fixture.mjs';

// test/verify-desktop-settings-search.mjs — real searchable settings with isolated storage, host and renderer observations.
let url = process.env.FOLIA_TEST_URL;
const output = resolve(process.env.FOLIA_UI_OUTPUT || 'test-results/desktop-settings-search');
await mkdir(output, { recursive: true });
const checks = [], samples = [], failures = [], errors = [];
let browser, page, server, stage = 'fixture';
try {
  if (!url) {
    server = await createServer({ configFile: resolve('vite.desktop.config.ts'), server: { host: '127.0.0.1', port: 0, hmr: false,
      watch: { ignored: ['**/obj/**', '**/bin/**', '**/release/**'] } } });
    await server.listen(); url = `http://127.0.0.1:${server.httpServer.address().port}/desktop.html`;
  }
  const origin = new URL(url).origin;
  browser = await chromium.launch({ executablePath: process.env.FOLIA_CHROMIUM_PATH, headless: true, args: ['--no-proxy-server'] });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('folia.desktop.mode.v1', 'classic');
    localStorage.setItem('folia.desktop.backgroundEnabled.v1', 'true');
    localStorage.setItem('visualizer_background_mode', 'common');
    localStorage.setItem('subtitle_font_inherits_lyrics', 'true');
    localStorage.setItem('visualizer_smart_beat', JSON.stringify({ mode: 'cached', effects: {
      'hanabi.beatBursts': { on: true, strength: 0.6 }, 'hanabi.beatPulse': { on: true, strength: 1.4 },
      'sonnet.lensTear': { on: false, strength: 1 },
    } }));
    localStorage.setItem('tempera_tuning', JSON.stringify({ postProcessEnabled: false }));
    localStorage.setItem('sonnet_tuning', JSON.stringify({ postProcessEnabled: false }));
    localStorage.setItem('latent_background_tuning', JSON.stringify({ ditheringSpeed: 0.3, meshSpeed: 1.7 }));
    localStorage.setItem('monet_background_tuning', JSON.stringify({ backgroundLayout: 'full-overlay', backgroundDriftEnabled: false, backgroundWashColorMode: 'theme' }));
    sessionStorage.setItem('folia.test.mockPreferences', JSON.stringify({ autoImmersive: false, audioReactive: false, coverTheme: false,
      musicApps: [{ slot: 2, name: '测试播放器', path: 'C:\\fake\\player.exe', icon: '' }] }));
  });
  await installDesktopBridgeMock(page); await installDesktopParserProbe(page);
  // The 8s default above is for in-page assertions; the first dev-server page load gets its own longer budget.
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => window.__foliaReadyAt !== null);
  const song = { key: 'test', title: '搜索验证歌曲', artist: '测试歌手', cover: '', source: '测试播放器', sessionId: 'search-session',
    position: 10, duration: 180, rate: 1, playing: false, hasTimeline: true, sources: [{ id: 'search-session', label: '测试播放器' }] };
  await emitVisual(page, 'session', song);
  await emitVisual(page, 'lyrics', { key: song.key, title: song.title, artist: song.artist, content: '[00:01.000]真实渲染器\n[00:09.000]保持播放模式\n[00:20.000]下一句',
    source: '搜索验证', format: 'lrc', cover: '', embedded: false });
  await emitVisual(page, 'online', { key: song.key, busy: false, selectedKey: '', errors: [], message: '在线候选', candidates: [
    { key: 'qq:one', provider: 'qq', id: 'one', title: song.title, artist: song.artist, quality: '逐字', available: true, score: 99, autoEligible: true },
  ] });
  await page.waitForFunction(() => window.__foliaReadVisualizerProps?.()?.lines.length > 0);
  await emitVisual(page, 'appearance', { acrylic: true, transparent: false, solid: false, highContrast: false });
  const search = () => page.getByRole('combobox', { name: '搜索全部设置', exact: true });
  const results = () => page.getByRole('listbox', { name: '设置搜索候选', exact: true });
  const main = () => page.locator('.desktop-main-settings');
  const state = async () => ({ visual: await readVisual(page), ...await page.evaluate(() => ({
    storage: Object.fromEntries(Object.entries(localStorage).sort(([a], [b]) => a.localeCompare(b))),
    preferences: window.__foliaMockPreferences(), commands: window.__foliaCommands.filter(command => command.type !== 'ready'),
  })) });
  await page.waitForFunction(() => window.__foliaReadVisualizerProps?.()?.currentTime.get() === 10);
  const baseline = await state();
  assert.equal(baseline.visual.mode, 'classic'); assert.equal(baseline.visual.background.mode, 'common');
  assert(baseline.visual.lines.length > 0 && Object.keys(baseline.storage).length >= 7);
  assert.equal(baseline.preferences.audioReactive, false);
  const unchanged = async context => {
    await visualFrame(page);
    assert.deepEqual(await state(), baseline, `${context}: navigation preserves real storage, host preferences, commands and committed renderer props`);
  };
  const index = await page.evaluate(async () => (await import('/src/desktopLyrics/desktopSettingsSearchIndex.ts')).buildDesktopSettingsSearchIndex());
  const entries = new Map(index.map(entry => [entry.key, entry]));
  assert.equal(new Set(index.filter(entry => entry.mode).map(entry => entry.mode)).size, 15);
  assert.equal(new Set(index.filter(entry => entry.background).map(entry => entry.background)).size, 6);
  const open = async () => {
    if (!await search().count()) { await page.locator('[data-settings-trigger]').click(); await search().waitFor(); }
  };
  const choose = async key => {
    const entry = entries.get(key); assert(entry, `indexed destination ${key}`);
    await open(); await search().fill(entry.label);
    const option = results().locator(`[data-search-key="${key}"]`);
    await option.waitFor(); await option.click();
    return entry;
  };
  // Verify the actual focused target against its owning scroll viewport, not merely a rendered label.
  const landing = async (key, expected = {}) => {
    const entry = await choose(key);
    await visualFrame(page);
    await page.waitForFunction(() => document.activeElement?.classList.contains('desktop-settings-search-target'));
    if (expected.hint) await page.waitForFunction(({ label, hint }) => {
      const text = document.querySelector('.desktop-settings-search-hint')?.textContent ?? '';
      return text.includes(label) && text.includes(hint);
    }, { label: entry.label, hint: expected.hint });
    const sample = await page.evaluate(() => {
      const active = document.activeElement, content = active.closest('.desktop-settings-scroll,.desktop-visual-content');
      const label = active.closest('label'), parent = label?.parentElement ?? active.parentElement;
      const named = element => element?.getAttribute('aria-label') || element?.getAttribute('aria-labelledby')?.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ');
      return { tag: active.tagName, type: active.getAttribute('type'), role: active.getAttribute('role'), aria: named(active), title: active.getAttribute('title'),
        text: active.textContent?.trim(), row: label?.textContent?.trim() || parent?.textContent?.trim(), controlGroup: parent?.parentElement?.textContent?.trim(), group: label?.parentElement?.firstElementChild?.textContent?.trim(),
        fieldsetLegend: named(active.closest('fieldset')) || active.closest('fieldset')?.querySelector('legend')?.textContent?.trim(), sectionHeading: active.closest('section')?.querySelector('h3')?.textContent?.trim(),
        anchorHeading: active.closest('[data-settings-anchor]')?.querySelector('h3')?.textContent?.trim(), effect: active.closest('[data-beat-effect]')?.getAttribute('data-beat-effect'),
        ownerMode: active.closest('[data-visualizer-settings]')?.dataset.visualizerSettings ?? null,
        ownerBackground: active.closest('[data-background-settings]')?.dataset.backgroundSettings ?? null,
        section: active.closest('[data-visual-section]')?.dataset.visualSection ?? 'main', value: active.value ?? null,
        bounds: active.getBoundingClientRect().toJSON(), viewport: content?.getBoundingClientRect().toJSON(),
        contentScrollTop: content?.scrollTop, pageX: scrollX, pageY: scrollY, hint: document.querySelector('.desktop-settings-search-hint')?.textContent ?? '' };
    });
    assert.equal(sample.section, entry.section, `${key}: destination section`);
    if (expected.aria) assert.equal(sample.aria, expected.aria, `${key}: exact named control`);
    if (expected.mode) assert.equal(sample.ownerMode, expected.mode, `${key}: original mode parameter panel`);
    if (expected.background) assert.equal(sample.ownerBackground, expected.background, `${key}: original background parameter panel`);
    if (expected.type) assert.equal(sample.type, expected.type, `${key}: control type`);
    if (expected.group) assert.equal(sample.group ?? sample.anchorHeading, expected.group, `${key}: distinguish identical labels in different groups`);
    if (expected.effect) assert.equal(sample.effect, expected.effect, `${key}: exact beat effect`);
    if (expected.legend) assert.equal(sample.fieldsetLegend, expected.legend, `${key}: effect-scoped control stays in its own group`);
    if (expected.sectionHeading) assert.equal(sample.sectionHeading, entry.label, `${key}: parameter section opens its own controls`);
    if (expected.text) assert([sample.text, sample.row, sample.controlGroup, sample.title].some(value => value?.includes(expected.text)), `${key}: exact control label`);
    if (expected.hint) assert(sample.hint.includes(entry.label) && sample.hint.includes(expected.hint), `${key}: hidden-control prerequisite guidance`);
    assert(sample.viewport && sample.bounds.top >= sample.viewport.top - 1 && sample.bounds.bottom <= sample.viewport.bottom + 1,
      `${key}: focus target is visible in its settings scroll viewport`);
    assert.equal(sample.pageY, 0); assert.equal(sample.pageX, 0);
    await unchanged(key); samples.push({ key, width: page.viewportSize().width, ...sample });
    return sample;
  };
  const attempt = async (name, action) => {
    stage = name;
    try { await action(); checks.push(name); }
    catch (error) {
      const evidence = `${name.replace(/[^a-zA-Z0-9_-]+/g, '-')}.png`;
      await page.screenshot({ path: `${output}/${evidence}` }).catch(() => {});
      failures.push({ name, error: String(error), evidence });
      console.error(`FAIL ${name}: ${String(error).split('\n')[0]}`);
      await page.keyboard.press('Escape').catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
    }
  };
  for (const [key, expected] of [
    ['main.topmost', { type: 'checkbox', text: '窗口置顶' }],
    ['main.online-title', { aria: '在线搜索歌名' }], ['main.online-artist', { aria: '在线搜索歌手' }],
    ['main.source-qq', { aria: '启用QQ 音乐歌词源' }], ['main.audio', { text: '跟随系统声音变化', type: 'checkbox' }],
    ['main.local-import', { text: '导入歌词' }], ['main.manual-clock', { text: '手动歌词时钟', type: 'checkbox' }],
  ]) await attempt(key, () => landing(key, expected));
  await attempt('main-disclosures-and-draft', async () => {
    await landing('main.online-title', { aria: '在线搜索歌名' });
    await main().getByRole('textbox', { name: '在线搜索歌名', exact: true }).fill('保留尚未提交的歌名');
    await main().evaluate(element => { element.dataset.searchIdentity = 'persistent'; });
    await landing('main.online-artist', { aria: '在线搜索歌手' }); await landing('main.online-title', { aria: '在线搜索歌名' });
    assert.equal(await main().getAttribute('data-search-identity'), 'persistent');
    assert.equal(await main().getByRole('textbox', { name: '在线搜索歌名', exact: true }).inputValue(), '保留尚未提交的歌名');
    await landing('main.source-qq', { aria: '启用QQ 音乐歌词源' });
    assert.equal(await main().locator('.lyric-source-settings').getAttribute('open'), '');
    await landing('main.manual-clock', { text: '手动歌词时钟', type: 'checkbox' });
    assert.equal(await main().locator('details').filter({ has: page.locator('[data-settings-target="manual-clock"]') }).getAttribute('open'), '');
  });
  for (const [key, expected] of [
    ['common.options.fontFamily', { aria: '字体' }], ['common.options.fontSize', { aria: '字号', type: 'range' }],
    ['common.options.fontWeight', { aria: '自动字重', hint: '自动字重' }],
    ['subtitle.options.fontFamily', { aria: '字幕继承歌词字体', hint: '字幕继承歌词字体' }],
    ['subtitle.options.fontWeight', { aria: '字幕继承歌词字体', hint: '字幕继承歌词字体' }],
    ['subtitle.options.subtitleFontScale', { type: 'range' }],
    ['common.options.chooseSystemFont', { text: '选择自定义字体' }],
    ['common.options.uploadCustomFont', { text: '选择自定义字体', hint: '选择自定义字体' }],
    ['subtitle.options.chooseSystemFont', { aria: '字幕继承歌词字体', hint: '字幕继承歌词字体' }],
    ['subtitle.options.hidePlayerTranslationSubtitle', { aria: '隐藏底部字幕层' }],
    ['visualizer.desktopVisual.previewTitle', { text: '样式预览' }],
    ['visualizer.options.randomPool', { aria: '每首歌随机歌词动画', hint: '每首歌随机歌词动画' }],
    ['visualizer.options.randomVisualizerReroll', { aria: '每首歌随机歌词动画', hint: '每首歌随机歌词动画' }],
    ['background.options.videoLayerUrl', { aria: '在歌词后方显示视频', hint: '在歌词后方显示视频' }],
    ['background.options.videoLayerClearFile', { aria: '在歌词后方显示视频', hint: '在歌词后方显示视频' }],
    ['common.options.smartBeatCached', { text: '只用已分析' }],
    ['common.desktopVisual.selectBeatAudio', { text: '选择本曲音频并分析' }],
  ]) await attempt(key, () => landing(key, expected));
  await attempt('beat-effect-strength-context', async () => {
    const bursts = await landing('visualizer.hanabi.beat.hanabi.beatBursts.strength', { type: 'range', effect: 'hanabi.beatBursts' });
    const pulse = await landing('visualizer.hanabi.beat.hanabi.beatPulse.strength', { type: 'range', effect: 'hanabi.beatPulse' });
    assert.equal(Number(bursts.value), 0.6); assert.equal(Number(pulse.value), 1.4);
    await landing('visualizer.sonnet.beat.sonnet.lensTear.strength', { effect: 'sonnet.lensTear', aria: '推镜裂光', hint: '推镜裂光' });
  });
  const modes = [
    ['classic', 'classicWordRotation'], ['cadenza'], ['partita', 'partitaGuideLines'], ['fume', 'fumeCameraSpeed'],
    ['claddagh', 'claddaghRadiusScale'], ['cappella', 'cappellaAvatarSource'], ['tilt', 'tiltSplitProbability'],
    ['diorama', 'dioramaCameraSpeed'], ['pendolo', 'pendoloWheelCenterX'], ['monet', 'monetFontScale'],
    ['sonnet', 'sonnetTextureResolution'], ['tempera', 'temperaTextureResolution'], ['lumiere', 'lumiereLightIntensity'], ['hanabi', 'hanabiSparkAmount'], ['still'],
  ];
  for (const [mode, parameter] of modes) await attempt(`mode-${mode}`, async () => {
    const key = parameter ? `visualizer.${mode}.options.${parameter}` : `visualizer.${mode}`;
    await landing(key, parameter ? { mode } : {});
    assert.equal(await page.locator(`[data-visualizer-settings="${mode}"]`).count(), 1);
    assert.equal(await page.locator('[data-visual-mode="classic"]').getAttribute('aria-pressed'), 'true');
    if (mode !== 'classic') assert((await page.locator('.desktop-search-editing').textContent()).includes(entries.get(`visualizer.${mode}`).label));
  });
  for (const [mode, sections] of [
    ['sonnet', ['sonnetQualitySection', 'sonnetMotionSection', 'sonnetPostProcessSection', 'sonnetDisplaySection']],
    ['tempera', ['temperaImageSection', 'temperaQualitySection', 'temperaMotionSection', 'temperaPostProcessSection', 'temperaLyricSection', 'temperaDisplaySection']],
    ['lumiere', ['lumiereLightSection', 'lumiereAtmosphereSection', 'lumiereTextSection', 'lumiereThemeSection', 'lumierePerformanceSection']],
  ]) for (const section of sections) await attempt(`section-${mode}-${section}`, () => landing(`visualizer.${mode}.options.${section}`, { mode, sectionHeading: true }));
  await attempt('diorama-geometry-child-disclosure', async () => {
    const entry = entries.get('visualizer.diorama.options.dioramaGeometryRings');
    await landing(entry.key, { mode: 'diorama', aria: entry.label, legend: entry.context });
    const group = page.locator('[data-visualizer-settings="diorama"]').getByRole('group', { name: entry.context, exact: true });
    const fieldset = page.locator('[data-visualizer-settings="diorama"] fieldset').filter({ has: page.getByRole('switch', { name: entry.label, exact: true }) });
    assert.equal(await fieldset.locator('button[aria-expanded]').getAttribute('aria-expanded'), 'true');
    assert.equal(await group.count(), 1);
  });
  for (const effect of ['Glow', 'Soul', 'Gradient']) for (const parameter of ['dioramaEffectStrength', 'dioramaCustomStrength'])
    await attempt(`diorama-${effect}-${parameter}`, async () => {
      const entry = entries.get(`visualizer.diorama.${effect}.${parameter}`);
      await landing(entry.key, { mode: 'diorama', legend: entry.context, ...(parameter === 'dioramaCustomStrength' ? { hint: entry.fallback } : {}) });
      const fieldset = page.locator('[data-visualizer-settings="diorama"] fieldset').filter({ has: page.getByRole('switch', { name: entry.context, exact: true }) });
      assert.equal(await fieldset.locator('button[aria-expanded]').getAttribute('aria-expanded'), 'true');
    });
  await attempt('configuration-file-opener', async () => {
    await landing('common.desktopVisual.chooseConfig', { type: 'button', text: '读取配置文件' });
    assert.equal(await page.locator('[data-visual-config]').getAttribute('open'), '');
    assert.equal(await page.locator('input[type=file].desktop-settings-search-target').count(), 0);
  });
  for (const [mode, parameter, fallback] of [
    ['sonnet', 'sonnetPostProcessGrain', 'sonnetPostProcessEnabled'], ['tempera', 'temperaPostProcessGrain', 'temperaPostProcessEnabled'],
    ['tempera', 'temperaLayerImageScale', 'temperaImageSection'],
  ]) await attempt(`hidden-${mode}-${parameter}`, async () => {
    const fallbackLabel = entries.get(`visualizer.${mode}.options.${fallback}`).label;
    await landing(`visualizer.${mode}.options.${parameter}`, { mode, hint: fallbackLabel, ...(parameter === 'temperaLayerImageScale' ? {} : { text: fallbackLabel }) });
    assert.equal(await page.locator('.desktop-visual-asset-dialog').count(), 0, 'search only reveals the image settings opener');
  });
  for (const [background, parameter, expected] of [
    ['common', 'previewCoverBackgroundOpacity', { hint: '添加封面色彩' }], ['monet', 'monetBackgroundBlur', { type: 'range' }],
    ['nomand', 'nomandBackgroundFlutedGlassBlur', { hint: '纹理玻璃' }],
    ['latent', 'latentDitheringSize', { type: 'range' }], ['url', 'urlBackgroundAdd', { text: '添加' }], ['sora', 'soraBlank', { text: '空白' }],
  ]) await attempt(`background-${background}`, async () => {
    await landing(`background.${background}.options.${parameter}`, { background, ...expected });
    assert.equal((await readVisual(page)).background.mode, 'common');
  });
  await attempt('hidden-monet-custom-color', () => landing('background.monet.options.monetBackgroundWashCustomColor', { background: 'monet', hint: '水洗色彩' }));
  await attempt('hidden-monet-layout-offset', () => landing('background.monet.options.monetHalfPaneOffsetX', { background: 'monet', hint: '布局模式' }));
  await attempt('hidden-monet-drift-strength', () => landing('background.monet.options.monetBackgroundDriftStrength', { background: 'monet', hint: '缓慢漂移' }));
  await attempt('hidden-url-note', () => landing('background.url.options.urlBackgroundNotePlaceholder', { background: 'url', hint: '添加' }));
  await attempt('latent-context-and-breadcrumb', async () => {
    await open(); await search().fill('基础速度');
    const dithering = results().locator('[data-search-key="background.latent.Dithering.latentBaseSpeed"]');
    const mesh = results().locator('[data-search-key="background.latent.Mesh.latentBaseSpeed"]');
    assert((await dithering.innerText()).includes('像素背景')); assert((await mesh.innerText()).includes('流体背景'));
    assert.notEqual(await dithering.innerText(), await mesh.innerText());
    const first = await landing('background.latent.Dithering.latentBaseSpeed', { background: 'latent', type: 'range', group: '像素背景' });
    const second = await landing('background.latent.Mesh.latentBaseSpeed', { background: 'latent', type: 'range', group: '流体背景' });
    assert.notEqual(first.value, second.value, 'different live tuning values prove distinct controls');
  });
  for (const [width, height] of [[1280, 800], [450, 300], [320, 600]]) await attempt(`keyboard-and-layout-${width}`, async () => {
    await page.setViewportSize({ width, height }); await open(); await page.mouse.move(0, 0); await search().fill('背景');
    const list = results(); assert(await list.getByRole('option').count() > 20);
    const scrollBefore = await page.locator('.control-panel .desktop-settings-scroll,.control-panel .desktop-visual-content').evaluateAll(elements => elements.map(element => element.scrollTop));
    await search().press('ArrowUp'); assert.equal(await list.getByRole('option').last().getAttribute('aria-selected'), 'true');
    await search().press('Home'); assert.equal(await list.getByRole('option').first().getAttribute('aria-selected'), 'true');
    await search().press('End'); assert.equal(await list.getByRole('option').last().getAttribute('aria-selected'), 'true');
    const bounds = await list.evaluate(element => {
      const selected = element.querySelector('[aria-selected="true"]');
      return { list: element.getBoundingClientRect().toJSON(), option: selected.getBoundingClientRect().toJSON(),
        scrollTop: element.scrollTop, horizontal: element.scrollWidth - element.clientWidth, pageY: scrollY, height: innerHeight };
    });
    assert(bounds.list.top >= 0 && bounds.list.bottom <= height + 1, 'candidate viewport remains within the window');
    assert(bounds.option.top >= bounds.list.top - 1 && bounds.option.bottom <= bounds.list.bottom + 1, 'keyboard selection stays visible');
    assert(bounds.scrollTop > 0 && bounds.horizontal <= 1); assert.equal(bounds.pageY, 0);
    assert.deepEqual(await page.locator('.control-panel .desktop-settings-scroll,.control-panel .desktop-visual-content').evaluateAll(elements => elements.map(element => element.scrollTop)), scrollBefore,
      'candidate navigation scrolls its own list only');
    await search().press('ArrowDown'); assert.equal(await list.getByRole('option').first().getAttribute('aria-selected'), 'true');
    await search().press('ArrowDown'); assert.equal(await list.locator('[data-search-option="1"]').getAttribute('aria-selected'), 'true');
    await search().press('ArrowUp'); assert.equal(await list.getByRole('option').first().getAttribute('aria-selected'), 'true');
    await search().fill('窗口置顶');
    await search().dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
    assert.equal(await search().inputValue(), '窗口置顶'); assert.equal(await results().count(), 1);
    await search().dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229 });
    assert.equal(await search().inputValue(), '窗口置顶'); assert.equal(await results().count(), 1);
    await search().press('Enter');
    await page.waitForFunction(() => document.activeElement?.closest('label')?.textContent.includes('窗口置顶'));
    assert.equal(await search().inputValue(), ''); await unchanged(`keyboard-${width}`);
    await landing('main.online-title', { aria: '在线搜索歌名' });
    await landing('background.latent.Mesh.latentBaseSpeed', { background: 'latent', type: 'range', group: '流体背景' });
    await search().fill('桌面背景'); await page.screenshot({ path: `${output}/search-${width}.png` });
    samples.push({ context: `candidate-layout-${width}`, ...bounds });
    await search().press('Escape'); assert.equal(await results().count(), 0); assert.equal(await search().count(), 1);
    await search().press('Escape'); await search().waitFor({ state: 'detached' });
  });
  await attempt('empty-query-clear-and-no-match', async () => {
    await open(); await search().fill('不存在的设置候选xyz');
    assert.equal(await results().getByRole('option').count(), 0); assert.equal(await results().getByRole('status').count(), 1);
    await page.getByRole('button', { name: '清空设置搜索', exact: true }).click();
    assert.equal(await search().inputValue(), ''); assert.equal(await results().count(), 0);
    assert(await search().evaluate(element => element === document.activeElement)); await unchanged('cleared-search');
  });
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(failures.length, 0, failures.map(failure => `${failure.name}: ${failure.error}`).join('\n'));
  console.log(`PASS desktop settings search: ${checks.length} checks, ${samples.length} real target/layout samples`);
} catch (error) {
  if (!failures.length) failures.push({ name: stage, error: String(error) });
  throw error;
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ checks, samples, failures, errors }, null, 2));
  await browser?.close();
  await server?.close();
}
