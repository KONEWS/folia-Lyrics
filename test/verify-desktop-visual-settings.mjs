import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { desktopSelect, openDesktopMenu, selectDesktopOption } from './desktop-select.mjs';
import { visualDialog, visualSurface, backgroundDialog, visualFrame, emitVisual, openVisualSettings, closeVisualSettings, readVisual, waitVisual,
  dragVisualRange, reloadVisualSong } from './desktop-visual-fixture.mjs';
import { verifyDesktopVisualAssets } from './verify-desktop-visual-assets.mjs';
import { verifyDesktopSegmentation } from './verify-desktop-segmentation.mjs';
import { verifyDesktopMonetAudio } from './verify-desktop-monet-audio.mjs';

// test/verify-desktop-visual-settings.mjs — real original settings, committed renderer props, persistence and appearance roundtrips.
export async function verifyDesktopVisualSettings(page, song, output) {
  const checks = [], samples = [], viewport = page.viewportSize();
  const saved = await page.evaluate(() => ({ storage: Object.fromEntries(Object.entries(localStorage)), prefs: window.__foliaMockPreferences(),
    testPrefs: sessionStorage.getItem('folia.test.mockPreferences'), appearance: {
      acrylic: document.querySelector('.desktop-lyrics').classList.contains('native-acrylic'),
      transparent: document.querySelector('.desktop-lyrics').classList.contains('transparent-background'),
      solid: document.querySelector('.desktop-lyrics').classList.contains('solid-surfaces'),
      highContrast: document.querySelector('.desktop-lyrics').classList.contains('high-contrast') } }));
  const packet = { key: song.key, title: song.title, artist: song.artist, cover: '', source: '原版视觉设置验证', format: 'lrc',
    content: '[00:01.000]保留原版歌词画面\n[00:33.000]参数直接传给原版渲染器\n[00:42.000]下一行歌词', translation: '[00:33.000]实际字幕译文', romanization: '[00:33.000]yuan ban zi mu' };
  let stage = 'fixture';
  const record = async context => { const snapshot = await readVisual(page); assert(snapshot); samples.push({ context, ...snapshot }); return snapshot; };
  const setTab = section => openVisualSettings(page, section);
  const exportText = async format => {
    const details = visualSurface(page).locator('[data-visual-config]');
    if (await details.getAttribute('open') === null) await details.locator('summary').click();
    await details.getByRole('button', { name: format === 'json' ? '复制 JSON' : '复制配置短码', exact: true }).click();
    const input = details.getByRole('textbox', { name: '视觉配置内容', exact: true });
    await page.waitForFunction(format => {
      const value = document.querySelector('[aria-label="视觉配置内容"]')?.value || '';
      return format === 'json' ? value.startsWith('{') : value.startsWith('folia-theme:');
    }, format);
    return input.inputValue();
  };
  const importText = async text => {
    const details = visualSurface(page).locator('[data-visual-config]');
    if (await details.getAttribute('open') === null) await details.locator('summary').click();
    await details.getByRole('textbox', { name: '视觉配置内容', exact: true }).fill(text);
    await details.getByRole('button', { name: '应用配置', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.desktop-visual-feedback')?.textContent.includes('视觉配置已应用'));
    await visualFrame(page);
  };
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => {
      localStorage.setItem('folia.desktop.mode.v1', 'classic'); localStorage.removeItem('folia.desktop.backgroundEnabled.v1');
      localStorage.setItem('video_layer_enabled', 'true'); localStorage.setItem('video_layer_url', 'data:video/mp4;base64,AAAA');
      sessionStorage.setItem('folia.test.mockPreferences', JSON.stringify({ autoImmersive: false, audioReactive: false, transparentBackground: false }));
    });
    await reloadVisualSong(page, { ...song, playing: false, position: 36 }, packet);
    await emitVisual(page, 'appearance', { acrylic: true, transparent: false, solid: false, highContrast: false });
    const initial = await record('initial'); assert.equal(initial.background.transparent, true);
    const originalClock = await page.evaluate(() => { const props = window.__foliaReadVisualizerProps(); window.__foliaVisualOriginalClock = props.currentTime; window.__foliaVisualOriginalLines = props.lines; return props.currentTime.get(); });
    stage = 'menu-footer';
    await desktopSelect(page, '歌词样式').focus(); await page.keyboard.press('ArrowDown');
    const menu = page.locator('.desktop-top-menu'); await menu.waitFor();
    assert.equal(await menu.getAttribute('role'), 'group');
    assert.equal(await menu.getByRole('listbox', { name: '歌词样式', exact: true }).getByRole('option').count(), 13);
    assert.equal(await menu.getByRole('option').filter({ hasText: '静止' }).count(), 0);
    const footer = menu.getByRole('button', { name: '更多设置', exact: false });
    assert.equal(await footer.getAttribute('role'), null); assert.equal(await footer.count(), 1);
    await page.keyboard.press('Tab'); assert(await footer.evaluate(element => element === document.activeElement));
    await page.keyboard.press('Shift+Tab'); assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-value')), 'classic');
    await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await visualDialog(page).waitFor(); await menu.waitFor({ state: 'detached' });
    assert.equal((await record('more-settings-open')).mode, 'classic');
    assert.equal(await visualDialog(page).getByRole('tab').count(), 3);
    assert.deepEqual(await visualDialog(page).getByRole('tab').allTextContents(), ['通用', '歌词动画', '字幕']);
    assert.equal(await visualDialog(page).getByRole('tab', { name: '背景', exact: true }).count(), 0);
    await page.screenshot({ path: `${output}/visual-settings-original-panel.png` });
    checks.push('the real more-settings footer is outside the 13-option listbox, supports Tab/Shift+Tab and opens common, lyric-animation and subtitle tabs without duplicating background settings or changing the current style');

    stage = 'registry-cards';
    const panel = await setTab('visualizer'), grid = panel.locator('[data-visual-mode-grid]');
    const modes = await grid.locator('button[data-visual-mode]').evaluateAll(elements => elements.map(element => ({ value: element.dataset.visualMode, label: element.textContent.trim() })));
    assert.equal(modes.length, 13); assert(!modes.some(mode => mode.value === 'still'));
    assert.equal(await panel.locator('.desktop-visual-still [data-visual-mode="still"]').count(), 1);
    let withPanel = 0, withoutPanel = 0;
    for (const mode of [...modes, { value: 'still', label: '静止' }]) {
      await panel.locator(`button[data-visual-mode="${mode.value}"]`).click(); await waitVisual(page, { mode: mode.value });
      if (mode.value === 'still') await page.locator('.visualizer-still').waitFor();
      else await page.waitForFunction(mode => Boolean(window.__foliaReadResolvedVisualizerProps(mode)), mode.value);
      assert.equal((await readVisual(page)).isPreviewMode, false); assert.equal(await page.locator('audio,video').count(), 0);
      if (mode.value !== 'still') assert.equal(await page.evaluate(mode => window.__foliaReadResolvedVisualizerProps(mode)?.isPreviewMode, mode.value), false);
      const originalPanel = panel.locator(`[data-visualizer-settings="${mode.value}"]`); await originalPanel.waitFor();
      const none = ['cadenza', 'still'].includes(mode.value);
      assert.equal(await originalPanel.getByText('此样式没有专属参数面板', { exact: false }).count(), none ? 1 : 0);
      if (none) { withoutPanel++; assert.equal(await originalPanel.locator('input,button').count(), 0); }
      else { withPanel++; assert(await originalPanel.locator('input,button').count() > 0, `${mode.value}: the real registry panel exposes its own controls`); }
      assert.equal(await panel.locator(`button[data-visual-mode="${mode.value}"]`).getAttribute('aria-pressed'), 'true');
      const canSegment = ['classic', 'partita', 'sonnet', 'tempera', 'lumiere'].includes(mode.value);
      const grouping = await setTab('common');
      assert.equal(await grouping.getByRole('button', { name: '本曲歌词分词', exact: true }).isDisabled(), !canSegment);
      await setTab('visualizer');
      samples.push({ context: 'registry-card', ...mode, dedicatedPanel: !none, canSegment });
    }
    assert.equal(withPanel, 12); assert.equal(withoutPanel, 2);
    assert.equal(await desktopSelect(page, '歌词样式').getAttribute('data-value'), 'still');
    await closeVisualSettings(page);
    const stillMenu = await openDesktopMenu(page, '歌词样式');
    assert.equal(await stillMenu.getByRole('option').count(), 13); assert.equal(await stillMenu.locator('[data-value="still"]').count(), 0);
    await page.keyboard.press('Escape'); await stillMenu.waitFor({ state: 'detached' });
    await setTab('visualizer');
    await panel.locator('[data-visual-mode="classic"]').click(); await waitVisual(page, { mode: 'classic' });
    checks.push('all 13 original dynamic modes and separate still mode mount with their real 12 dedicated cards and two explicit no-card states');
    console.log('PASS visual settings: 13 dynamic modes / separate still / 12 original cards');
    stage = 'monet-live-spectrum'; checks.push(...await verifyDesktopMonetAudio(page, output, samples));
    await setTab('visualizer'); await panel.locator('[data-visual-mode="classic"]').click(); await waitVisual(page, { mode: 'classic' });

    stage = 'common-and-draft';
    const common = await setTab('common');
    const staticToggle = common.getByRole('switch', { name: '减少动态效果', exact: true });
    if (await staticToggle.getAttribute('aria-checked') !== 'true') await staticToggle.click();
    await waitVisual(page, { staticMode: true }); await common.getByRole('button', { name: '默认', exact: true }).click();
    await waitVisual(page, { staticMode: false, 'theme.fontStyle': 'sans', lyricsFontScale: 1, visualizerOpacity: 1 });
    checks.push('the common Default action resets the original static-mode switch and typography/opacity rather than leaving reduced-motion settings enabled');
    await selectDesktopOption(page, '动画强度', { value: 'chaotic' }); await waitVisual(page, { 'theme.animationIntensity': 'chaotic' });
    await selectDesktopOption(page, '字体', { value: 'serif' }); await waitVisual(page, { 'theme.fontStyle': 'serif' });
    await common.getByRole('textbox', { name: '自定义字体名称', exact: true }).fill('Microsoft YaHei');
    await common.getByRole('textbox', { name: '自定义字体名称', exact: true }).press('Enter');
    await waitVisual(page, { 'theme.fontFamily': 'Microsoft YaHei' });
    const scale = common.getByRole('slider', { name: '字号', exact: true }), beforeScale = await readVisual(page);
    const scaleStorageBefore = await page.evaluate(() => localStorage.getItem('lyrics_font_scale'));
    let scaleValue = await dragVisualRange(page, scale, 0.8, async draft => {
      assert.notEqual(draft, beforeScale.lyricsFontScale);
      assert.equal((await readVisual(page)).lyricsFontScale, beforeScale.lyricsFontScale, 'the slider draft must not reconfigure the original renderer while held');
      assert.equal(await page.evaluate(() => localStorage.getItem('lyrics_font_scale')), scaleStorageBefore);
    });
    await waitVisual(page, { lyricsFontScale: scaleValue });
    assert.equal(await page.evaluate(() => Number(localStorage.getItem('lyrics_font_scale'))), scaleValue);
    await scale.focus(); await page.keyboard.down('ArrowLeft'); await page.keyboard.down('ArrowLeft'); await visualFrame(page);
    const keyboardScale = Number(await scale.inputValue()); assert.notEqual(keyboardScale, scaleValue);
    assert.equal((await readVisual(page)).lyricsFontScale, scaleValue);
    assert.equal(await page.evaluate(() => Number(localStorage.getItem('lyrics_font_scale'))), scaleValue);
    await page.keyboard.up('ArrowLeft'); await waitVisual(page, { lyricsFontScale: keyboardScale }); scaleValue = keyboardScale;
    const opacityValue = await dragVisualRange(page, common.getByRole('slider', { name: '整体透明度', exact: true }), 0.6);
    await waitVisual(page, { visualizerOpacity: opacityValue });
    const commonChanged = await record('common-committed');
    assert.equal(commonChanged.theme.backgroundColor, initial.theme.backgroundColor); assert.equal(commonChanged.theme.accentColor, initial.theme.accentColor);
    assert(await page.evaluate(() => { const props = window.__foliaReadVisualizerProps(); return props.currentTime === window.__foliaVisualOriginalClock && props.lines === window.__foliaVisualOriginalLines; }));
    assert.equal(commonChanged.clock, originalClock);
    await page.screenshot({ path: `${output}/visual-settings-common-committed.png` });
    checks.push('intensity, font, size and opacity reach original props; held pointer/keyboard slider drafts commit on release while preserving song colors, lyric references and clock');

    stage = 'tuning';
    const tuning = (await setTab('visualizer')).locator('[data-visualizer-settings="classic"]');
    const beforeTuning = await readVisual(page);
    const tuningValue = await dragVisualRange(page, tuning.locator('input[type=range]').first(), 0.7, async draft => {
      assert.notEqual(draft, beforeTuning.visualizerTunings.classic.breathingFloatMultiplier);
      assert.deepEqual((await readVisual(page)).visualizerTunings.classic, beforeTuning.visualizerTunings.classic);
    });
    await waitVisual(page, { 'visualizerTunings.classic.breathingFloatMultiplier': tuningValue });
    checks.push('a genuine upstream tuning slider keeps its committed tuning unchanged during drag and applies its exact released value');

    stage = 'subtitle';
    const subtitle = await setTab('subtitle');
    await selectDesktopOption(page, '副字幕内容', { value: 'romanization' }); await waitVisual(page, { subtitleContentMode: 'romanization' });
    const subtitleOpacity = await dragVisualRange(page, subtitle.getByRole('slider', { name: '字幕透明度', exact: true }), 0.5);
    await waitVisual(page, { subtitleOverlayOpacity: subtitleOpacity });
    const backgroundToggle = subtitle.getByRole('switch', { name: '字幕背景', exact: true });
    const previousBackground = await backgroundToggle.getAttribute('aria-checked') === 'true'; await backgroundToggle.click();
    await waitVisual(page, { subtitleOverlayBackground: !previousBackground });
    await page.screenshot({ path: `${output}/visual-settings-subtitle.png` });
    checks.push('subtitle content, opacity and background switches change the original subtitle props without inventing translation or timing');

    stage = 'background-priority';
    const bg = await setTab('background'), enable = bg.getByRole('switch', { name: '启用原版歌词背景', exact: true });
    assert.equal(await backgroundDialog(page).getByRole('tablist').count(), 0); assert.equal(await visualDialog(page).count(), 0);
    assert.equal(await enable.getAttribute('aria-checked'), 'false'); await enable.click(); await waitVisual(page, { 'background.transparent': false });
    const backgroundBefore = await readVisual(page);
    for (const value of ['common', 'latent', 'monet', 'nomand', 'sora', 'url']) {
      await selectDesktopOption(page, '背景类型', { value }); await waitVisual(page, { 'background.mode': value });
      const card = bg.locator(`[data-background-settings="${value}"]`); await card.waitFor();
      assert(await card.locator('input,button').count() > 0, `${value}: the original background registry card has actual controls`);
      samples.push({ context: 'original-background-card', mode: value, controls: await card.locator('input,button').count() });
    }
    const backgroundMode = backgroundBefore.background.mode ?? null;
    await importText(JSON.stringify({ visualizerBackgroundMode: backgroundMode }));
    await waitVisual(page, { 'background.mode': backgroundMode });
    await emitVisual(page, 'appearance', { acrylic: false, transparent: true, solid: false, highContrast: false });
    await waitVisual(page, { 'background.transparent': true });
    assert.equal(await enable.getAttribute('aria-checked'), 'true');
    assert(await bg.getByText('当前开启了透明背景，原版背景暂时不绘制', { exact: false }).isVisible());
    await emitVisual(page, 'appearance', { acrylic: true, transparent: false, solid: false, highContrast: false });
    await waitVisual(page, { 'background.transparent': false });
    checks.push('the independent topbar background dialog exposes all six genuine cards and their original props; background defaults off and transparent playback suppresses drawing without clearing the enabled selection');

    stage = 'codec';
    const json = await exportText('json'), exported = JSON.parse(json), code = await exportText('code');
    assert.equal(exported.desktopBackgroundEnabled, true); assert.equal(exported.visualizerMode, 'classic');
    assert.equal(exported.theme.dark.animationIntensity, 'chaotic'); assert.equal(exported.lyricsCustomFontFamily, 'Microsoft YaHei');
    assert.equal(exported.lyricsFontScale, scaleValue); assert.equal(exported.subtitleContentMode, 'romanization');
    assert.equal(exported.visualizerTunings.classic.breathingFloatMultiplier, tuningValue);
    assert.equal(Object.hasOwn(exported.theme.dark, 'backgroundColor'), false, 'appearance export must not overwrite per-song cover colors');
    await writeFile(`${output}/visual-settings-export.json`, json); await writeFile(`${output}/visual-settings-export.txt`, code);
    for (const [name, text] of [['JSON', json], ['original shortcode', code]]) {
      const changed = { ...exported, desktopBackgroundEnabled: false, lyricsFontScale: 0.9,
        theme: { light: { ...exported.theme.light, animationIntensity: 'calm' }, dark: { ...exported.theme.dark, animationIntensity: 'calm' } } };
      await importText(JSON.stringify(changed)); await waitVisual(page, { lyricsFontScale: 0.9, 'theme.animationIntensity': 'calm', 'background.transparent': true });
      await importText(text); await waitVisual(page, { lyricsFontScale: scaleValue, 'theme.animationIntensity': 'chaotic', 'background.transparent': false,
        'theme.fontFamily': 'Microsoft YaHei', subtitleContentMode: 'romanization', 'visualizerTunings.classic.breathingFloatMultiplier': tuningValue });
      samples.push({ context: `${name}-roundtrip`, ...await readVisual(page) });
    }
    checks.push('JSON and the original compressed shortcode roundtrip desktop background, mode, motion, fonts, subtitle settings and genuine tuning while excluding song colors and binary files');
    console.log('PASS visual settings: committed motion / typography / tuning / subtitles / six backgrounds / JSON and shortcode');

    stage = 'reload';
    await closeVisualSettings(page); await reloadVisualSong(page, { ...song, playing: false, position: 36 }, packet);
    await emitVisual(page, 'appearance', { acrylic: true, transparent: false, solid: false, highContrast: false });
    await waitVisual(page, { lyricsFontScale: scaleValue, 'theme.animationIntensity': 'chaotic', 'theme.fontStyle': 'serif',
      'theme.fontFamily': 'Microsoft YaHei', 'background.transparent': false, subtitleContentMode: 'romanization', subtitleOverlayOpacity: subtitleOpacity,
      'visualizerTunings.classic.breathingFloatMultiplier': tuningValue });
    checks.push('a full page reload restores committed visual settings through their original storage keys');

    stage = 'null-and-still-codec';
    await openVisualSettings(page, 'common');
    const clearFonts = { ...exported, desktopBackgroundEnabled: false, lyricsCustomFontFamily: null, lyricsFontFallbackFamilies: [],
      subtitleFontInheritsLyrics: false, subtitleFontFamily: null, subtitleFontFallbackFamilies: [], visualizerBackgroundMode: null, urlBackgroundSelectedId: null };
    await importText(JSON.stringify(clearFonts));
    await waitVisual(page, { 'theme.fontFamily': undefined, 'theme.fontFamilyStack': [], 'subtitleTheme.fontFamily': undefined,
      'subtitleTheme.fontFamilyStack': [], 'background.transparent': true });
    const clearCode = await exportText('code');
    await importText(json); await waitVisual(page, { 'theme.fontFamily': 'Microsoft YaHei', 'background.transparent': false });
    await importText(clearCode); await waitVisual(page, { 'theme.fontFamily': undefined, 'theme.fontFamilyStack': [],
      'subtitleTheme.fontFamily': undefined, 'subtitleTheme.fontFamilyStack': [], 'background.transparent': true });
    await importText(JSON.stringify({ ...clearFonts, visualizerMode: 'still' })); await waitVisual(page, { mode: 'still' });
    await closeVisualSettings(page);
    const staticMenu = await openDesktopMenu(page, '歌词样式');
    assert.equal(await staticMenu.getByRole('option').count(), 13); assert.equal(await staticMenu.locator('[data-value="still"]').count(), 0);
    await page.keyboard.press('Escape'); await staticMenu.waitFor({ state: 'detached' });
    await openVisualSettings(page, 'common');
    await importText(json); await waitVisual(page, { mode: 'classic', 'theme.fontFamily': 'Microsoft YaHei' }); await closeVisualSettings(page);
    checks.push('false background, null system-font families and empty fallback stacks clear old values in JSON and shortcode; importing still preserves the separate static mode and 13 dynamic topbar options');

    stage = 'compact-dialog';
    await page.setViewportSize({ width: 450, height: 300 });
    await emitVisual(page, 'windowState', { fullscreen: true, maximized: false, clickThrough: false });
    await openVisualSettings(page, 'common');
    const bounds = await visualDialog(page).boundingBox(), close = visualDialog(page).getByRole('button', { name: '关闭歌词样式设置', exact: true });
    assert(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 450 && bounds.y + bounds.height <= 300);
    assert(await close.evaluate(element => { const box = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)); }));
    await page.screenshot({ path: `${output}/visual-settings-450x300.png` });
    await page.keyboard.press('Escape'); await visualDialog(page).waitFor({ state: 'detached' });
    assert.equal(await page.locator('.native-fullscreen').count(), 1, 'Escape closes visual settings before exiting fullscreen');
    await emitVisual(page, 'windowState', { fullscreen: false, maximized: false, clickThrough: false }); await page.setViewportSize({ width: 1280, height: 800 });
    const intensityBefore = (await readVisual(page)).theme.animationIntensity; await page.locator('.style-intensity-button').click();
    await page.waitForFunction(previous => window.__foliaReadVisualizerProps?.()?.theme.animationIntensity !== previous, intensityBefore);
    samples.push({ context: 'shortcut', ...await readVisual(page) });
    checks.push('450x300 fullscreen settings remain inside the viewport with a usable close button; Escape dismisses the dialog first and the intensity shortcut reaches the same original theme');

    stage = 'real-assets'; checks.push(...await verifyDesktopVisualAssets(page, song, packet, output, samples));
    console.log('PASS visual settings: actual Tempera image dialog / IndexedDB persistence');
    stage = 'segmentation'; checks.push(...await verifyDesktopSegmentation(page, song, output, samples));
    await writeFile(`${output}/visual-settings-results.json`, JSON.stringify({ checks, samples }, null, 2));
    console.log('PASS original desktop visual settings / assets / segmentation checks'); return checks;
  } catch (error) {
    const focus = await page.evaluate(() => ({ active: document.activeElement?.outerHTML.slice(0, 500),
      rootClass: document.querySelector('.desktop-lyrics')?.className,
      segmentationOpener: document.querySelector('.settings-segmentation-entry')?.outerHTML }));
    await writeFile(`${output}/visual-settings-primary-failure.json`, JSON.stringify({ stage, error: String(error), checks, focus, snapshot: await readVisual(page), samples }, null, 2));
    await page.screenshot({ path: `${output}/visual-settings-primary-failure.png` }); throw error;
  } finally {
    await page.evaluate(saved => {
      localStorage.clear(); for (const [key, value] of Object.entries(saved.storage)) localStorage.setItem(key, value);
      if (saved.testPrefs === null) sessionStorage.removeItem('folia.test.mockPreferences'); else sessionStorage.setItem('folia.test.mockPreferences', saved.testPrefs);
    }, saved);
    await page.setViewportSize(viewport); await reloadVisualSong(page, song, packet);
    await page.evaluate(prefs => window.__foliaSetMockPreferences(prefs), saved.prefs); await emitVisual(page, 'appearance', saved.appearance);
  }
}
