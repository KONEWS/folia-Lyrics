import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { selectDesktopOption } from './desktop-select.mjs';
import { openVisualSettings, closeVisualSettings, openBackgroundSettings, closeBackgroundSettings, visualDialog, backgroundDialog,
  visualSurface, visualFrame, dragVisualRange, emitVisual, reloadVisualSong } from './desktop-visual-fixture.mjs';

// test/verify-settings-transparency.mjs — real slider input, shared materials, persistence and unchanged lyric renderer references.
const key = 'folia.desktop.settingsTransparency.v1';
const alpha = async locator => locator.evaluate(element => {
  const value = getComputedStyle(element).backgroundColor;
  const match = value.match(/\/\s*([\d.]+)\)/) ?? value.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/);
  return match ? Number(match[1]) : 1;
});
export async function verifySettingsTransparency(page, song, output) {
  const checks = [], samples = [];
  const root = page.locator('.desktop-lyrics'), main = page.locator('.control-panel[aria-label="歌词设置"]');
  const trigger = page.locator('[data-settings-trigger]');
  const saved = () => page.evaluate(key => localStorage.getItem(key), key);
  const material = async (locator, expected, context) => {
    await visualFrame(page);
    const actual = await alpha(locator); assert(Math.abs(actual - expected) < .015, `${context}: opacity ${actual}, expected ${expected}`);
    samples.push({ context, alpha: actual });
  };
  const stable = () => page.evaluate(() => {
    const props = window.__foliaReadVisualizerProps(), old = window.__foliaTransparencyRefs;
    return props.theme === old.theme && props.lines === old.lines && props.currentTime === old.clock;
  });
  await trigger.click(); await main.waitFor();
  const slider = main.getByRole('slider', { name: '设置透明度', exact: true });
  assert.equal(await slider.evaluate(element => element.closest('section').dataset.settingsSection), 'immersion');
  assert.equal(await main.locator('section').first().getByRole('slider').count(), 0, 'opacity is grouped with theme rather than placed first');
  assert.equal(await slider.inputValue(), '85'); await slider.scrollIntoViewIfNeeded(); await material(main, .85, 'default-main');
  await page.screenshot({ path: `${output}/settings-transparency-default.png` });
  await page.evaluate(() => { const props = window.__foliaReadVisualizerProps(); window.__foliaTransparencyRefs = { theme: props.theme, lines: props.lines, clock: props.currentTime }; });
  const before = await saved();
  const value = await dragVisualRange(page, slider, .65, async current => {
    await material(main, current / 100, 'live-pointer-preview');
    assert.equal(await saved(), before, 'dragging previews without repeated storage writes');
    assert(await stable(), 'dragging never changes the lyric theme, clock or line array');
  });
  assert.equal(await saved(), String(100 - value)); assert(await stable());
  await slider.focus(); await slider.press('Home'); assert.equal(await saved(), '100'); await material(main, 0, 'keyboard-transparent');
  await slider.press('End'); await material(main, 1, 'keyboard-opaque'); assert.equal(await saved(), '0');
  await page.screenshot({ path: `${output}/settings-transparency-opaque.png` });
  await slider.press('Home'); for (let index = 0; index < 30; index++) await slider.press('ArrowRight');
  assert.equal(await saved(), '70'); await material(main, .3, 'keyboard-thirty');
  await page.mouse.click(80, 400); await main.waitFor({ state: 'detached' });
  checks.push('theme settings contain opacity with 85% default; increasing the slider makes settings more opaque, dragging preserves renderer references and saves on release, and outside click still closes');

  const common = await openVisualSettings(page, 'common');
  assert.equal(await common.getByRole('slider', { name: '设置透明度', exact: true }).inputValue(), '30');
  await material(visualDialog(page), .3, 'visual-settings');
  const config = visualSurface(page).locator('[data-visual-config]'); await config.locator('summary').click();
  const text = config.getByRole('textbox', { name: '视觉配置内容', exact: true });
  await config.getByRole('button', { name: '复制 JSON', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="视觉配置内容"]')?.value.startsWith('{'));
  assert.equal(JSON.parse(await text.inputValue()).desktopSettingsTransparency, 70);
  await config.getByRole('button', { name: '复制配置短码', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="视觉配置内容"]')?.value.startsWith('folia-theme:'));
  const shortcode = await text.inputValue();
  assert.equal(JSON.parse(Buffer.from(shortcode.slice('folia-theme://'.length), 'base64').toString()).dst, 70);
  await text.fill('{"desktopSettingsTransparency":45}'); await config.getByRole('button', { name: '应用配置', exact: true }).click();
  await material(visualDialog(page), .55, 'json-import'); assert.equal(await saved(), '45');
  await text.fill(shortcode); await config.getByRole('button', { name: '应用配置', exact: true }).click();
  await material(visualDialog(page), .3, 'shortcode-import'); assert.equal(await saved(), '70');
  await closeVisualSettings(page); await openBackgroundSettings(page); await material(backgroundDialog(page), .3, 'background-settings'); await closeBackgroundSettings(page);
  checks.push('visual and background settings share the same transparency; JSON and shortcode export/import restore the value through the actual configuration controls');

  await selectDesktopOption(page, '歌词样式', { value: 'tempera' });
  const animation = await openVisualSettings(page, 'visualizer');
  await animation.locator('[data-visualizer-settings="tempera"]').getByRole('button', { name: '添加图片', exact: true }).click();
  const images = page.getByRole('dialog', { name: '画布图片', exact: true }); await images.waitFor();
  await material(images, .3, 'body-portal-assets'); await page.screenshot({ path: `${output}/settings-transparency-assets.png` });
  await emitVisual(page, 'appearance', { acrylic: false, solid: true, highContrast: false });
  await root.and(page.locator('.solid-surfaces')).waitFor(); await material(images, 1, 'solid-asset');
  await material(visualDialog(page), 1, 'solid-visual');
  await emitVisual(page, 'appearance', { acrylic: false, solid: true, highContrast: true }); await root.and(page.locator('.high-contrast')).waitFor();
  await material(images, 1, 'high-contrast-assets');
  await emitVisual(page, 'appearance', { acrylic: false, solid: false, highContrast: false });
  await page.keyboard.press('Escape'); await images.waitFor({ state: 'detached' }); await closeVisualSettings(page);
  checks.push('original body-portalled asset settings inherit the saved material; solid and high contrast surfaces remain opaque and readable');

  const packet = { key: song.key, title: song.title, artist: song.artist, content: '[00:01.000]设置透明度\n[00:33.000]保留原版动效', source: '透明度验证' };
  await reloadVisualSong(page, song, packet); await trigger.click(); await main.waitFor();
  assert.equal(await main.getByRole('slider', { name: '设置透明度', exact: true }).inputValue(), '30'); await material(main, .3, 'reload-persistence');
  await trigger.click(); await main.waitFor({ state: 'detached' });
  const reloadedCommon = await openVisualSettings(page, 'common'); await reloadedCommon.getByRole('button', { name: '默认', exact: true }).click();
  assert.equal(await saved(), '15'); await material(visualDialog(page), .85, 'reset-default');
  await closeVisualSettings(page);
  checks.push('reload keeps the choice, while the existing common-settings reset restores the more opaque 15% default');
  await writeFile(`${output}/settings-transparency-results.json`, JSON.stringify({ checks, samples }, null, 2));
  return { checks, samples };
}
