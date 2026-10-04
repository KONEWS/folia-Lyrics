import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { selectDesktopOption, setDesktopCoverTheme } from './desktop-select.mjs';
import { visualDialog, backgroundDialog, visualFrame, emitVisual, openVisualSettings, closeVisualSettings,
  openBackgroundSettings, readVisual, waitVisual, reloadVisualSong } from './desktop-visual-fixture.mjs';

// test/verify-selected-controls.mjs — genuine preset state, flat selection skin and persistence without added checkmarks.
export async function verifySelectedControls(page, song, output) {
  const checks = [], samples = [], viewport = page.viewportSize();
  const saved = await page.evaluate(() => ({ storage: Object.fromEntries(Object.entries(localStorage)), prefs: window.__foliaMockPreferences(),
    testPrefs: sessionStorage.getItem('folia.test.mockPreferences'), appearance: {
      acrylic: document.querySelector('.desktop-lyrics').classList.contains('native-acrylic'),
      transparent: document.querySelector('.desktop-lyrics').classList.contains('transparent-background'),
      solid: document.querySelector('.desktop-lyrics').classList.contains('solid-surfaces'),
      highContrast: document.querySelector('.desktop-lyrics').classList.contains('high-contrast') } }));
  const packet = { key: song.key, title: song.title, artist: song.artist, cover: '', source: '选中控件验证', format: 'lrc',
    content: '[00:01.000]保留原版歌词画面\n[00:33.000]选中状态清晰可见\n[00:42.000]下一行歌词' };
  const group = (scope, label) => scope.getByRole('group', { name: label, exact: true });
  const windowState = (fullscreen = false) => emitVisual(page, 'windowState', { fullscreen, maximized: false, clickThrough: false });
  const storageValue = (key, field) => page.evaluate(({ key, field }) => JSON.parse(localStorage.getItem(key) || '{}')[field], { key, field });
  const setMode = async mode => {
    const content = await openVisualSettings(page, 'visualizer');
    await content.locator(`[data-visual-mode="${mode}"]`).click(); await waitVisual(page, { mode });
    const card = content.locator(`[data-visualizer-settings="${mode}"]`); await card.waitFor(); return card;
  };
  // Contrast is observed on the original control, including hovered states; renderer values are read independently below.
  const skin = async (controls, context, systemContrast = false) => {
    const rows = await controls.locator('button[aria-pressed]').evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      return { label: element.textContent.trim(), selected: element.getAttribute('aria-pressed'), disabled: element.disabled,
        background: `${style.backgroundImage}|${style.backgroundColor}`, border: style.borderTopColor, borderWidth: parseFloat(style.borderTopWidth),
        borderStyle: style.borderTopStyle, weight: Number(style.fontWeight), shadow: style.boxShadow, color: style.color,
        checks: element.querySelectorAll('.lucide-check,.lucide-check-check').length, bounds: element.getBoundingClientRect().toJSON() };
    }));
    assert(rows.length >= 2); assert.equal(rows.filter(row => row.selected === 'true').length, 1, `${context}: exactly one preset is selected`);
    const selected = rows.find(row => row.selected === 'true'), other = rows.find(row => row.selected === 'false' && !row.disabled); assert(selected && other);
    for (const row of rows) {
      assert.equal(row.checks, 0, `${context}: the selected state must not add a checkmark icon`);
      assert(!/[✓✔☑]/.test(row.label), `${context}: original option text remains unchanged`);
    }
    if (systemContrast) {
      assert.equal(selected.borderStyle, 'double'); assert(selected.borderWidth >= 3);
      assert.notEqual(other.borderStyle, selected.borderStyle, `${context}: the operating-system contrast mode retains a distinct selected border`);
    } else {
      assert.notEqual(selected.background, other.background, `${context}: selected fill differs from the ordinary flat control`);
      assert.notEqual(selected.border, other.border, `${context}: selected accent border differs from the ordinary border`);
      assert(selected.weight >= 600 && other.weight === 400, `${context}: selected text is visibly heavier`);
      assert.equal(selected.shadow, 'none', `${context}: selection has no reflective inner outline`);
      assert.equal(other.shadow, 'none', `${context}: ordinary controls have no reflective inner outline`);
    }
    samples.push({ context, rows }); return selected;
  };
  // Compare settled skins rather than snapshots taken partway through the original CSS transitions.
  const settleSkin = async controls => {
    await visualFrame(page);
    const element = await controls.elementHandle();
    try {
      await page.waitForFunction(element => element.getAnimations({ subtree: true }).every(animation =>
        !(animation instanceof CSSTransition) || (!animation.pending && animation.playState !== 'running')), element, { timeout: 5000 });
    } finally { await element.dispose(); }
  };
  // Keep the selected treatment stable while moving the actual pointer between the selected and unselected options.
  const hoverSkin = async (controls, context) => {
    await controls.scrollIntoViewIfNeeded(); await page.mouse.move(40, 120); await settleSkin(controls);
    const idle = await skin(controls, `${context}-idle`), selected = controls.locator('button[aria-pressed="true"]');
    await selected.hover(); await settleSkin(controls); const hovered = await skin(controls, `${context}-selected-hover`);
    assert.equal(hovered.background, idle.background, `${context}: selected hover must not revert to the ordinary hover fill`);
    assert.equal(hovered.border, idle.border); assert.equal(hovered.weight, idle.weight); assert.equal(hovered.shadow, idle.shadow);
    await controls.locator('button[aria-pressed="false"]:not(:disabled)').first().hover(); await settleSkin(controls);
    const otherHover = await skin(controls, `${context}-other-hover`); assert.equal(otherHover.background, idle.background);
    await selected.hover(); await controls.screenshot({ path: `${output}/selected-controls-${context}.png` });
  };
  let stage = 'fixture';
  try {
    await page.evaluate(() => {
      localStorage.setItem('folia.desktop.mode.v1', 'lumiere');
      sessionStorage.setItem('folia.test.mockPreferences', JSON.stringify({ autoImmersive: false, audioReactive: false, coverTheme: true, transparentBackground: false }));
    });
    await reloadVisualSong(page, { ...song, playing: false, position: 36 }, packet); await windowState();
    await emitVisual(page, 'appearance', { acrylic: true, transparent: false, solid: false, highContrast: false });
    await page.setViewportSize({ width: 1280, height: 800 });
    await setDesktopCoverTheme(page);
    stage = 'lumiere-keyword-and-quality';
    let card = await setMode('lumiere'), keyword = group(card, '关键字着色');
    for (const [label, value] of [['关闭', false], ['开启', true]]) {
      await keyword.getByRole('button', { name: label, exact: true }).click(); await waitVisual(page, { 'visualizerTunings.lumiere.keywordColors': value });
      assert.equal(await keyword.getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await storageValue('lumiere_tuning', 'keywordColors'), value); await hoverSkin(keyword, `lumiere-keyword-${value}`);
    }
    const quality = group(card, '画质');
    for (const [label, value] of [['省电', 'low'], ['全分辨率', 'full'], ['均衡', 'balanced']]) {
      await quality.getByRole('button', { name: label, exact: true }).click(); await waitVisual(page, { 'visualizerTunings.lumiere.renderQuality': value });
      assert.equal(await quality.getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await storageValue('lumiere_tuning', 'renderQuality'), value); await skin(quality, `lumiere-quality-${value}`);
    }
    checks.push('the original Lumiere keyword-colour and quality presets expose exactly one pressed option, match genuine renderer props/storage and retain distinct flat fill, border and weight while hovering without reflections or checkmarks');

    stage = 'monet-keyword'; card = await setMode('monet'); keyword = group(card, '关键字着色');
    for (const [label, value] of [['启用', true], ['关闭', false]]) {
      await keyword.getByRole('button', { name: label, exact: true }).click(); await waitVisual(page, { 'visualizerTunings.monet.keywordColoringEnabled': value });
      assert.equal(await keyword.getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await storageValue('monet_tuning', 'keywordColoringEnabled'), value); await hoverSkin(keyword, `monet-keyword-${value}`);
    }
    checks.push('the genuine Monet Enable/Disable keyword-colouring group displays the persisted renderer setting and keeps its selected appearance distinct when either option is hovered');

    stage = 'background-preset';
    const background = await openBackgroundSettings(page); assert.equal(await visualDialog(page).count(), 0);
    assert.equal(await backgroundDialog(page).getByRole('tablist').count(), 0);
    await selectDesktopOption(page, '背景类型', { value: 'monet' }); await waitVisual(page, { 'background.mode': 'monet' });
    const wash = group(background.locator('[data-background-settings="monet"]'), '水洗色彩');
    for (const [label, value] of [['自定义', 'custom'], ['主题色', 'theme']]) {
      await wash.getByRole('button', { name: label, exact: true }).click(); await waitVisual(page, { 'background.monet.tuning.backgroundWashColorMode': value });
      assert.equal(await wash.getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await storageValue('monet_background_tuning', 'backgroundWashColorMode'), value); await hoverSkin(wash, `background-wash-${value}`);
    }
    checks.push('the permanent background entry retains its independent page and the original Monet theme/custom wash preset applies and clearly marks the same persisted background setting');

    stage = 'cover-themes'; card = await setMode('lumiere'); keyword = group(card, '关键字着色');
    const cover = fill => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="${fill}"/></svg>`)}`;
    for (const [context, image] of [['monochrome', cover('#888888')], ['green-cover', cover('#23c766')]]) {
      await emitVisual(page, 'session', { ...song, cover: image, playing: false, position: 36 });
      await page.waitForFunction(({ image, green }) => {
        const root = document.querySelector('.desktop-lyrics'), img = document.querySelector('.track-caption img');
        return img?.getAttribute('src') === image && img.complete && (green
          ? root.classList.contains('cover-theme') && root.style.getPropertyValue('--cover-background') !== '#121212'
          : root.style.getPropertyValue('--cover-background') === '#121212');
      }, { image, green: context === 'green-cover' });
      await visualFrame(page); await hoverSkin(keyword, context);
      samples.push({ context: `${context}-renderer-theme`, ...await readVisual(page) });
      assert.equal((await readVisual(page)).visualizerTunings.lumiere.keywordColors, true);
    }
    checks.push('actual monochrome and green cover extraction changes the theme while the original selected keyword option keeps clearly different fill, border and weight without changing its value');

    stage = 'small-window-keyboard'; card = await setMode('monet'); keyword = group(card, '关键字着色');
    const mediaBefore = await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'mediaControl').length);
    await page.setViewportSize({ width: 450, height: 300 });
    for (const fullscreen of [false, true]) {
      await windowState(fullscreen); await keyword.getByRole('button', { name: '启用', exact: true }).focus(); await page.keyboard.press('Space');
      await waitVisual(page, { 'visualizerTunings.monet.keywordColoringEnabled': true });
      await page.keyboard.press('Tab'); assert(await keyword.getByRole('button', { name: '关闭', exact: true }).evaluate(element => element === document.activeElement));
      await page.keyboard.press('Enter'); await waitVisual(page, { 'visualizerTunings.monet.keywordColoringEnabled': false });
      assert.equal(await storageValue('monet_tuning', 'keywordColoringEnabled'), false);
      await hoverSkin(keyword, fullscreen ? '450x300-fullscreen' : '450x300-window');
      const bounds = await visualDialog(page).boundingBox(); assert(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 450 && bounds.y + bounds.height <= 300);
    }
    assert.equal(await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'mediaControl').length), mediaBefore);
    checks.push('450x300 window/fullscreen keeps both original preset options usable; Space, Tab and Enter update the pressed/persisted value without triggering external-player transport');

    stage = 'solid-and-system-contrast'; await page.setViewportSize({ width: 1280, height: 800 }); await windowState();
    await emitVisual(page, 'appearance', { acrylic: false, transparent: false, solid: true, highContrast: false }); await page.locator('.solid-surfaces').waitFor();
    await hoverSkin(keyword, 'solid-surface');
    await emitVisual(page, 'appearance', { acrylic: false, transparent: false, solid: true, highContrast: true }); await page.locator('.high-contrast').waitFor();
    await skin(keyword, 'high-contrast', true); await keyword.screenshot({ path: `${output}/selected-controls-high-contrast.png` });
    await emitVisual(page, 'appearance', { acrylic: false, transparent: false, solid: false, highContrast: false });
    await page.locator('.high-contrast').waitFor({ state: 'detached' }); await page.emulateMedia({ forcedColors: 'active' });
    await skin(keyword, 'forced-colors', true); await keyword.screenshot({ path: `${output}/selected-controls-forced-colors.png` }); await page.emulateMedia({ forcedColors: 'none' });
    checks.push('solid fallback keeps the flat selected treatment without reflection; high contrast and forced colours preserve a distinct double selected border without relying on translucent fills or checkmarks');

    stage = 'reload'; await closeVisualSettings(page); await reloadVisualSong(page, { ...song, playing: false, position: 36 }, packet);
    await waitVisual(page, { mode: 'monet', 'visualizerTunings.monet.keywordColoringEnabled': false, 'visualizerTunings.lumiere.keywordColors': true,
      'visualizerTunings.lumiere.renderQuality': 'balanced', 'background.monet.tuning.backgroundWashColorMode': 'theme' });
    card = await setMode('monet'); keyword = group(card, '关键字着色'); assert.equal(await keyword.getByRole('button', { name: '关闭', exact: true }).getAttribute('aria-pressed'), 'true');
    await hoverSkin(keyword, 'reload-monet');
    assert.deepEqual(await visualDialog(page).getByRole('tab').allTextContents(), ['通用', '歌词动画', '字幕']);
    await setMode('lumiere'); await waitVisual(page, { 'visualizerTunings.lumiere.keywordColors': true });
    await openBackgroundSettings(page); assert.equal(await backgroundDialog(page).getByRole('tablist').count(), 0);
    checks.push('a real browser reload restores original keyword, quality and background values and their pressed appearance, retaining three visual tabs and the separate background entry');
    await writeFile(`${output}/selected-controls-results.json`, JSON.stringify({ checks, samples }, null, 2));
    console.log(`PASS selected original controls: ${checks.length} checks`); return checks;
  } catch (error) {
    await writeFile(`${output}/selected-controls-primary-failure.json`, JSON.stringify({ stage, error: String(error), checks, samples, snapshot: await readVisual(page) }, null, 2));
    await page.screenshot({ path: `${output}/selected-controls-primary-failure.png` }); throw error;
  } finally {
    await page.emulateMedia({ forcedColors: 'none' }); await closeVisualSettings(page); await windowState(); await emitVisual(page, 'restore', {});
    await page.evaluate(saved => {
      localStorage.clear(); for (const [key, value] of Object.entries(saved.storage)) localStorage.setItem(key, value);
      if (saved.testPrefs === null) sessionStorage.removeItem('folia.test.mockPreferences'); else sessionStorage.setItem('folia.test.mockPreferences', saved.testPrefs);
    }, saved);
    await page.setViewportSize(viewport); await reloadVisualSong(page, song, packet);
    await page.evaluate(prefs => window.__foliaSetMockPreferences(prefs), saved.prefs); await emitVisual(page, 'appearance', saved.appearance);
  }
}
