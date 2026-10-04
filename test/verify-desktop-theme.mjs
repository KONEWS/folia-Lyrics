import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { openDesktopMenu, selectDesktopOption, setDesktopCoverTheme } from './desktop-select.mjs';
import { emitVisual, readVisual, waitVisual, openVisualSettings, closeVisualSettings, visualDialog, visualSurface, reloadVisualSong } from './desktop-visual-fixture.mjs';
import { verifyTransparency } from './verify-transparency.mjs';

// test/verify-desktop-theme.mjs — the original cover checkbox, default fallback and renderer colour checks through real browser input.
const obsoletePresetKey = 'folia.desktop.themePreset.v1';
const rgb = { light: 'rgb(102, 204, 255)', deep: 'rgb(64, 84, 199)', background: 'rgb(11, 13, 23)', text: 'rgb(244, 247, 255)' };
const cover = fill => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="${fill}"/></svg>`)}`;
const style = (locator, property) => locator.evaluate((element, property) => getComputedStyle(element)[property], property);
const settled = async locator => { await locator.evaluate(async element => {
  await Promise.allSettled(element.getAnimations({ subtree: true }).filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished));
}); };
// Resolve variables through a real element so color-mix and inherited portal values are checked in Chromium.
const tokens = page => page.locator('.desktop-lyrics').evaluate(root => Object.fromEntries(
  ['--theme-primary-light', '--theme-primary', '--theme-bg', '--theme-text', '--theme-active'].map(key => {
    const probe = document.createElement('i'); probe.style.color = `var(${key})`; root.append(probe);
    const value = getComputedStyle(probe).color; probe.remove(); return [key, value];
  })));
export async function verifyDesktopTheme(page, song, output) {
  const checks = [], samples = [];
  const packet = { key: song.key, title: song.title, artist: song.artist, cover: '', source: '双色主题验证', format: 'lrc',
    content: '[00:01.000]洛天依明亮浅蓝\n[00:33.000]Ado 深邃蓝紫\n[00:42.000]保留原版逐字动画',
    translation: '[00:33.000]Keep the original lyric animation', romanization: '[00:33.000]Ado' };
  const initial = await readVisual(page); assert(initial);
  const noThemeSelector = async () => assert.equal(await page.getByRole('combobox', { name: '主题配色', exact: true }).count(), 0,
    'the original cover checkbox is the only theme control; there is no new theme selector');
  await setDesktopCoverTheme(page, false);
  await selectDesktopOption(page, '歌词样式', { value: 'classic' });
  await emitVisual(page, 'lyrics', packet); await waitVisual(page, { mode: 'classic' });
  await page.waitForFunction(() => window.__foliaReadVisualizerProps()?.lines.some(line => line.fullText?.includes('Ado')));
  await page.evaluate(() => { const props = window.__foliaReadVisualizerProps(); window.__foliaThemeRefs = { clock: props.currentTime, lines: props.lines }; });
  const verifyFixed = async context => {
    const value = await tokens(page); const props = await readVisual(page);
    assert.equal(value['--theme-primary-light'], rgb.light); assert.equal(value['--theme-primary'], rgb.deep);
    assert.equal(value['--theme-bg'], rgb.background); assert.equal(value['--theme-text'], rgb.text);
    assert.equal(props.theme.accentColor.toUpperCase(), '#66CCFF'); assert.equal(props.theme.backgroundColor.toUpperCase(), '#0B0D17');
    for (const field of ['fontStyle', 'fontFamily', 'fontWeight', 'fontFamilyStack', 'animationIntensity']) assert.deepEqual(props.theme[field], initial.theme[field], `${context}: ${field} stays unchanged`);
    assert.equal(await page.locator('.cover-theme').count(), 0);
    samples.push({ context, tokens: value, renderer: props.theme }); return props;
  };
  await verifyFixed('default-without-cover');
  for (const fill of ['#dd5234', '#20c96e']) {
    const image = cover(fill); await emitVisual(page, 'session', { ...song, cover: image });
    await page.waitForFunction(image => { const img = document.querySelector('.track-caption img'); return img?.getAttribute('src') === image && img.complete && img.naturalWidth > 0; }, image);
    await verifyFixed(`default-with-real-cover-${fill}`);
  }
  assert(await page.getByRole('button', { name: '刷新主题色', exact: true }).isDisabled());
  assert(await page.evaluate(() => { const p = window.__foliaReadVisualizerProps(); return p.currentTime === window.__foliaThemeRefs.clock && p.lines === window.__foliaThemeRefs.lines; }));
  await page.waitForTimeout(1500); // Let the original paused renderer finish its entry transition before readability screenshots.
  await page.screenshot({ path: `${output}/theme-default-lyrics.png` });
  checks.push('turning off the original cover checkbox keeps both default colours with decoded red and green artwork; clock, lyric array, typography and animation intensity retain their original references/values');

  const settings = page.getByRole('button', { name: '打开歌词设置', exact: true }); await settings.click();
  const coverToggle = page.getByRole('checkbox', { name: '主题跟随歌曲封面', exact: true });
  assert.equal(await coverToggle.isDisabled(), false); assert.equal(await coverToggle.isChecked(), false);
  await noThemeSelector();
  await page.screenshot({ path: `${output}/theme-default-settings.png` });
  await page.locator('.desktop-topbar [data-settings-trigger]').click();
  const normal = page.getByRole('button', { name: '上一首', exact: true });
  await page.mouse.move(500, 300); await settled(normal); assert.equal(await style(normal, 'color'), rgb.text);
  await normal.hover(); await settled(normal); assert.equal(await style(normal, 'color'), rgb.light);
  await page.mouse.down();
  try { await settled(normal); assert.equal(await style(normal, 'backgroundColor'), (await tokens(page))['--theme-active']); }
  finally { await page.mouse.move(500, 300); await page.mouse.up(); }
  const primary = page.locator('.desktop-statusbar .transport-primary');
  assert.equal(await style(primary, 'backgroundColor'), (await tokens(page))['--theme-active']);
  const close = page.locator('.window-close'); await close.hover(); await settled(close);
  const danger = await style(close, 'backgroundColor');
  assert.match(danger, /(?:rgba\(202, 71, 99|color\(srgb 0\.792)/, 'close action keeps the red danger palette');
  await page.mouse.move(500, 300);
  await emitVisual(page, 'session', { ...song, cover: cover('#20c96e'), controls: { ...song.controls, previous: false } });
  assert(await normal.isDisabled());
  const disabledBefore = await style(normal, 'color'); await normal.hover({ force: true }); await settled(normal);
  assert.equal(await style(normal, 'color'), disabledBefore, 'disabled control never gains the hover highlight');
  await emitVisual(page, 'session', { ...song, cover: cover('#20c96e') });
  const gradient = await page.locator('.audio-progress linearGradient').evaluate(element => ({
    units: element.getAttribute('gradientUnits'), end: element.getAttribute('x2'),
    stops: [...element.querySelectorAll('stop')].map(stop => ({ color: getComputedStyle(stop).stopColor, offset: stop.getAttribute('offset') })),
    played: getComputedStyle(document.querySelector('.progress-played')).stroke,
  }));
  assert.deepEqual(gradient.stops, [{ color: rgb.light, offset: '0%' }, { color: rgb.deep, offset: '100%' }]);
  assert.equal(gradient.units, 'userSpaceOnUse'); assert.equal(gradient.end, '1000'); assert.match(gradient.played, /^url\(/);
  samples.push({ context: 'control-states', danger, gradient });
  checks.push('normal/hover/active/selected/disabled controls use semantic colours, danger remains red, and SVG progress uses both exact colours over the full track');

  const common = await openVisualSettings(page, 'common');
  const slider = common.getByRole('slider', { name: '整体透明度', exact: true });
  assert.equal(await style(slider, 'accentColor'), rgb.light, 'original settings sliders inherit the light blue accent');
  const selectedTab = visualDialog(page).getByRole('tab', { selected: true });
  await settled(selectedTab);
  assert.equal(await style(selectedTab, 'backgroundColor'), (await tokens(page))['--theme-active'], 'original settings selected tabs use the Ado emphasis');
  await noThemeSelector();
  const config = visualSurface(page).locator('[data-visual-config]'); await config.locator('summary').click();
  const text = config.getByRole('textbox', { name: '视觉配置内容', exact: true });
  await config.getByRole('button', { name: '复制 JSON', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="视觉配置内容"]')?.value.startsWith('{'));
  const json = await text.inputValue(); assert.equal(Object.hasOwn(JSON.parse(json), 'desktopThemePreset'), false,
    'visual configurations do not export the removed preset setting');
  await config.getByRole('button', { name: '复制配置短码', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="视觉配置内容"]')?.value.startsWith('folia-theme:'));
  const code = await text.inputValue();
  const apply = async value => { await text.fill(value); await config.getByRole('button', { name: '应用配置', exact: true }).click(); };
  for (const value of [json, code]) {
    await apply(value); await verifyFixed('visual-config-keeps-original-cover-preference');
  }
  await apply('{"lyricsFontStyle":"sans","desktopThemePreset":"cover"}'); await verifyFixed('legacy-preset-config-ignored');
  await common.getByRole('button', { name: '默认', exact: true }).click(); await verifyFixed('common-default-keeps-original-cover-preference');
  await closeVisualSettings(page);
  assert.equal(await page.evaluate(() => window.__foliaMockPreferences().coverTheme), false);
  checks.push('ordinary and visual settings expose no new theme selector; JSON/shortcode export omits the removed preset and legacy preset import never changes the native cover checkbox');

  // Observe genuine cover extraction and the host checkbox separately from the removed preset storage key.
  const waitCover = async (image, previous) => {
    await page.waitForFunction(({ image, previous }) => {
      const root = document.querySelector('.desktop-lyrics'), img = document.querySelector('.track-caption img');
      return img?.getAttribute('src') === image && img.complete && img.naturalWidth > 0 && root?.classList.contains('cover-theme')
        && root.style.getPropertyValue('--cover-background') !== previous;
    }, { image, previous });
    const props = await readVisual(page); assert.notEqual(props.theme.accentColor.toUpperCase(), '#66CCFF');
    const palette = await page.locator('.desktop-lyrics').evaluate(root => ({
      background: root.style.getPropertyValue('--cover-background'), accent: root.style.getPropertyValue('--cover-accent'),
    }));
    assert.equal(props.theme.backgroundColor, palette.background); assert.equal(props.theme.accentColor, palette.accent);
    samples.push({ context: 'original-checkbox-cover', palette, renderer: props.theme }); return palette;
  };
  const redCover = cover('#dd5234'), greenCover = cover('#20c96e');
  await emitVisual(page, 'session', { ...song, cover: redCover });
  await setDesktopCoverTheme(page, true); const red = await waitCover(redCover, '#0B0D17');
  assert.equal(await page.getByRole('button', { name: '刷新主题色', exact: true }).isDisabled(), false);
  await emitVisual(page, 'session', { ...song, cover: greenCover }); const green = await waitCover(greenCover, red.background);
  assert.notEqual(red.background, green.background);
  const envelope = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#eeeff1"/><rect x="20" y="15" width="60" height="65" fill="#e5c99c"/><circle cx="52" cy="48" r="2" fill="#223f8e"/></svg>')}`;
  await emitVisual(page, 'session', { ...song, cover: envelope }); await waitCover(envelope, green.background);
  const warmAccent = async () => {
    const props = await readVisual(page), hex = props.theme.accentColor;
    const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
    assert(r > g + 10 && g > b + 20, 'pale yellow artwork stays warm yellow rather than cyan or a tiny blue detail');
    return props.theme;
  };
  const envelopeTheme = await warmAccent();
  await page.getByRole('button', { name: '刷新主题色', exact: true }).click();
  await page.waitForFunction(previous => window.__foliaReadVisualizerProps()?.theme.accentColor !== previous, envelopeTheme.accentColor);
  await warmAccent(); await page.screenshot({ path: `${output}/theme-pale-yellow-cover.png` });
  checks.push('real pixel extraction of a pale yellow envelope with neutral background and tiny blue seals retains warm yellow accents, including after a real refresh click');
  assert(await page.evaluate(() => { const p = window.__foliaReadVisualizerProps(); return p.currentTime === window.__foliaThemeRefs.clock && p.lines === window.__foliaThemeRefs.lines; }));
  await page.screenshot({ path: `${output}/theme-cover-checkbox-enabled.png` });
  await setDesktopCoverTheme(page, false); await page.locator('.cover-theme').waitFor({ state: 'detached' }); await verifyFixed('checkbox-off-restores-default');
  assert.equal(await page.getByRole('button', { name: '刷新主题色', exact: true }).isDisabled(), true);
  const commands = await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'coverTheme').map(command => command.value));
  assert(commands.includes(true) && commands.includes(false), 'real checkbox clicks send both native cover-theme preference values');
  checks.push('the original cover checkbox directly enables real red/green artwork extraction and disables it back to the default, with native preference commands and stable lyric/clock references');

  await emitVisual(page, 'session', { ...song, cover: '' }); await setDesktopCoverTheme(page, true);
  await verifyFixed('enabled-without-cover');
  assert.equal(await page.getByRole('button', { name: '刷新主题色', exact: true }).isDisabled(), true);
  // A valid local image whose pixels cannot be read follows the real extractor failure path without console/network errors.
  await page.evaluate(() => {
    const original = CanvasRenderingContext2D.prototype.getImageData;
    window.__foliaThemeRestorePixels = () => { CanvasRenderingContext2D.prototype.getImageData = original; delete window.__foliaThemeRestorePixels; };
    CanvasRenderingContext2D.prototype.getImageData = function (...args) {
      if (this.canvas.width === 50 && this.canvas.height === 50) throw new DOMException('Unavailable cover pixels', 'SecurityError');
      return original.apply(this, args);
    };
  });
  const unreadableCover = cover('#9234dd');
  try {
    await emitVisual(page, 'session', { ...song, cover: unreadableCover });
    await page.waitForFunction(() => document.querySelector('[aria-label="刷新主题色"]')?.title.includes('无法读取'));
    await verifyFixed('enabled-unreadable-cover-fallback');
  } finally { await page.evaluate(() => window.__foliaThemeRestorePixels?.()); }
  checks.push('an enabled checkbox with missing or unreadable artwork uses the two-colour default and disables refresh instead of changing lyric rendering');

  // Mirror the native host's saved preferences on reload using the existing in-memory bridge fixture.
  const reloadWithPreferences = async image => {
    await page.evaluate(() => sessionStorage.setItem('folia.test.mockPreferences', JSON.stringify(window.__foliaMockPreferences())));
    await reloadVisualSong(page, { ...song, cover: image }, packet);
  };
  await setDesktopCoverTheme(page, false);
  await page.evaluate(key => localStorage.setItem(key, 'cover'), obsoletePresetKey);
  await reloadWithPreferences(greenCover); await verifyFixed('obsolete-cover-preset-ignored-when-checkbox-off');
  await settings.click(); await noThemeSelector(); assert.equal(await coverToggle.isChecked(), false); assert.equal(await coverToggle.isDisabled(), false);
  await page.locator('.desktop-topbar [data-settings-trigger]').click();
  await setDesktopCoverTheme(page, true);
  await page.evaluate(key => localStorage.setItem(key, 'luotianyi-ado'), obsoletePresetKey);
  await reloadWithPreferences(greenCover); await waitCover(greenCover, '#0B0D17');
  await settings.click(); await noThemeSelector(); assert.equal(await coverToggle.isChecked(), true); assert.equal(await coverToggle.isDisabled(), false);
  await page.locator('.desktop-topbar [data-settings-trigger]').click();
  await setDesktopCoverTheme(page, false); await verifyFixed('final-checkbox-off');
  await page.evaluate(key => localStorage.removeItem(key), obsoletePresetKey);
  checks.push('real reload obeys the host cover checkbox while obsolete cover/default preset storage values are ignored in both directions');

  await emitVisual(page, 'appearance', { acrylic: true, solid: false, highContrast: false });
  await page.locator('.native-acrylic').waitFor();
  assert.equal(await style(page.locator('.acrylic-backdrop'), 'backgroundColor'), 'rgba(0, 0, 0, 0)');
  await emitVisual(page, 'appearance', { acrylic: false, solid: true, highContrast: false });
  await page.locator('.solid-surfaces').waitFor();
  await settings.click(); assert.equal(await style(page.locator('.control-panel'), 'backgroundColor'), rgb.background);
  assert.equal(await style(page.locator('.control-panel'), 'backdropFilter'), 'none');
  await page.locator('.desktop-topbar [data-settings-trigger]').click();
  await emitVisual(page, 'appearance', { acrylic: false, solid: true, highContrast: true });
  await page.locator('.high-contrast').waitFor();
  assert.equal(await page.locator('.desktop-lyrics').evaluate(element => getComputedStyle(element).getPropertyValue('--glass-text').trim()), 'CanvasText');
  await emitVisual(page, 'appearance', { acrylic: false, solid: false, highContrast: false });
  await page.locator('.high-contrast').waitFor({ state: 'detached' });
  await page.emulateMedia({ forcedColors: 'active' }); const forced = await openDesktopMenu(page, '歌词样式');
  assert.equal(await style(forced.locator('[aria-selected=true]'), 'borderTopStyle'), 'double');
  assert.equal(await style(page.locator('.desktop-top-menu'), 'backdropFilter'), 'none');
  await page.keyboard.press('Escape'); await page.emulateMedia({ forcedColors: 'none' });
  checks.push(...await verifyTransparency(page, output));
  checks.push('native acrylic stays transparent; solid fallback uses blue black; high contrast and forced colours retain system selection and readable controls');
  const menu = await openDesktopMenu(page, '歌词样式'); await page.screenshot({ path: `${output}/theme-default-menu.png` });
  await page.keyboard.press('Escape'); await menu.waitFor({ state: 'detached' });
  await openVisualSettings(page, 'common'); await page.screenshot({ path: `${output}/theme-default-original-settings.png` }); await closeVisualSettings(page);
  await writeFile(`${output}/desktop-theme-results.json`, JSON.stringify({ checks, samples }, null, 2));
  return { checks, samples };
}
