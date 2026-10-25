import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { installDesktopBridgeMock } from './desktop-bridge-mock.mjs';
import { desktopSelect, selectDesktopOption } from './desktop-select.mjs';
import { closeVisualSettings, emitVisual } from './desktop-visual-fixture.mjs';

// Real controls cover random song handovers, the one-style minimum and saved quick tuning.
const url = process.env.FOLIA_TEST_URL;
if (!url) throw new Error('Set FOLIA_TEST_URL to the running desktop dev server.');
const output = resolve(process.env.FOLIA_UI_OUTPUT || 'test-results/desktop-random');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.FOLIA_CHROMIUM_PATH, headless: true });
const checks = [], errors = [];
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', error => errors.push(String(error)));
    await installDesktopBridgeMock(page);
    await page.addInitScript(() => {
        localStorage.setItem('folia.desktop.mode.v1', 'classic');
        localStorage.setItem('random_visualizer_modes', JSON.stringify(['classic', 'partita']));
        sessionStorage.setItem('folia.test.mockPreferences', JSON.stringify({ autoImmersive: false, audioReactive: false }));
    });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('.waiting-screen').waitFor();
    const song = { key: 'random-a', title: 'Random A', artist: 'Fixture', cover: '', source: 'fixture', sessionId: 'random-session',
        position: 5, duration: 120, rate: 1, playing: false, hasTimeline: true, sources: [] };
    await emitVisual(page, 'session', song);
    await emitVisual(page, 'lyrics', { key: song.key, title: song.title, artist: song.artist, source: 'fixture', format: 'lrc', content: '[00:00.00]Random test\n[01:00.00]Next lyric' });
    await page.locator('.waiting-screen').waitFor({ state: 'detached' });
    await selectDesktopOption(page, '歌词样式', { label: '随机' });
    const mode = () => page.evaluate(() => localStorage.getItem('folia.desktop.mode.v1'));
    const first = await mode();
    await emitVisual(page, 'session', { ...song, key: 'random-b', title: 'Random B' });
    await page.waitForFunction(first => localStorage.getItem('folia.desktop.mode.v1') !== first, first);
    const second = await mode();
    await emitVisual(page, 'session', { ...song, key: 'random-b', title: 'Random B', position: 6 });
    await page.waitForTimeout(200);
    assert.equal(await mode(), second);
    checks.push('a new song draws the other pool style; repeated updates to the same song preserve it');

    await page.getByRole('button', { name: '快捷参数', exact: true }).click();
    const quick = page.getByRole('dialog', { name: '快捷参数', exact: true });
    await quick.getByRole('button', { name: '从随机池里换一种', exact: true }).click();
    await page.waitForFunction(second => localStorage.getItem('folia.desktop.mode.v1') !== second, second);
    assert.equal(await page.evaluate(() => localStorage.getItem('random_visualizer_mode_per_song')), 'true');
    assert.equal(await desktopSelect(page, '歌词样式').getAttribute('data-value'), '__random__');
    await quick.getByRole('button', { name: '选择随机池', exact: true }).click();
    const pool = page.locator('[data-desktop-random-controls]');
    const selected = pool.locator('[role="checkbox"][aria-checked="true"]');
    assert.equal(await selected.count(), 2);
    await selected.last().click();
    assert.equal(await selected.count(), 1);
    await selected.click();
    assert.equal(await selected.count(), 1);
    assert(await pool.getByRole('button', { name: '从随机池里换一种', exact: true }).isDisabled());
    checks.push('reroll preserves random mode, and the pool retains at least one style');
    await closeVisualSettings(page);

    await selectDesktopOption(page, '歌词样式', { value: 'classic' });
    assert.equal(await page.evaluate(() => localStorage.getItem('random_visualizer_mode_per_song')), 'false');
    await page.getByRole('button', { name: '快捷参数', exact: true }).click();
    const control = quick.locator('[data-desktop-style-quick-controls="classic"] button');
    const previous = await control.getAttribute('aria-pressed');
    await control.click();
    assert.notEqual(await control.getAttribute('aria-pressed'), previous);
    const tuning = await page.evaluate(async () => {
        const { useVisualizerSettingsStore } = await import('/src/stores/useVisualizerSettingsStore.ts');
        return useVisualizerSettingsStore.getState().classicTuning.enableWordRotation;
    });
    assert.equal(tuning, previous !== 'true');
    await page.keyboard.press('Escape');
    await quick.waitFor({ state: 'detached' });
    assert(await page.getByRole('button', { name: '快捷参数', exact: true }).evaluate(button => button === document.activeElement));
    checks.push('manual style selection exits random mode; quick tuning updates the original store and Escape restores focus');
    await page.screenshot({ path: resolve(output, 'random-controls.png') });
    assert.deepEqual(errors, []);
    await writeFile(resolve(output, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
    console.log(`PASS desktop random and quick controls: ${checks.length} groups`);
} finally { await browser.close(); }
