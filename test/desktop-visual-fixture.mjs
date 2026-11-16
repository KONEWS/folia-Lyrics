import assert from 'node:assert/strict';
import { openDesktopMenu } from './desktop-select.mjs';

// test/desktop-visual-fixture.mjs — isolated UI helpers and read-only production renderer/storage observations.
export const visualDialog = page => page.locator('[data-desktop-visual-studio]').getByRole('dialog', { name: '歌词样式', exact: true });
export const backgroundDialog = visualDialog;
export const visualSurface = page => page.locator('[data-desktop-visual-studio]');
export const visualFrame = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
export const emitVisual = (page, type, data) => page.evaluate(({ type, data }) => window.__foliaEmit(type, data), { type, data });

export async function openVisualSettings(page, section = 'visualizer') {
  if (!await visualDialog(page).count()) {
    if (section === 'background') await page.locator('[data-background-settings-trigger]').click();
    else {
      await openDesktopMenu(page, '歌词样式');
      await page.locator('.desktop-top-menu [data-custom-select-footer]').click();
    }
    await visualDialog(page).waitFor();
    await page.locator('.desktop-top-menu').waitFor({ state: 'detached' });
  }
  const name = { common: '字体', visualizer: '歌词动画', subtitle: '字幕', background: '背景', global: '全局' }[section];
  await visualDialog(page).getByRole('tab', { name, exact: true }).click();
  const panel = visualDialog(page).locator(`[data-visual-section="${section}"]`);
  await panel.waitFor(); return panel;
}
export async function closeVisualSettings(page) {
  if (await visualDialog(page).count()) {
    await visualDialog(page).getByRole('button', { name: '返回', exact: true }).click();
    await visualDialog(page).waitFor({ state: 'detached' });
  }
}

// The topbar background opener lands on the same studio's background tab.
export async function openBackgroundSettings(page) {
  return openVisualSettings(page, 'background');
}

export async function closeBackgroundSettings(page) {
  await closeVisualSettings(page);
}

// Read the original renderer's committed props rather than a second implementation or settings draft.
export const readVisual = page => page.evaluate(() => {
  const props = window.__foliaReadVisualizerProps?.();
  if (!props) return null;
  const font = theme => ({ fontStyle: theme?.fontStyle, fontFamily: theme?.fontFamily ?? null,
    fontWeight: theme?.fontWeight ?? null, fontFamilyStack: theme?.fontFamilyStack ?? [], animationIntensity: theme?.animationIntensity,
    backgroundColor: theme?.backgroundColor, accentColor: theme?.accentColor });
  return { mode: props.mode, isPreviewMode: props.isPreviewMode, theme: font(props.theme), subtitleTheme: font(props.subtitleTheme),
    clock: props.currentTime.get(), paused: props.paused, lines: structuredClone(props.lines),
    visualizerTunings: structuredClone(props.visualizerTunings), background: structuredClone(props.background),
    lyricsFontScale: props.lyricsFontScale, subtitleFontScale: props.subtitleFontScale,
    visualizerOpacity: props.visualizerOpacity, subtitleOverlayOpacity: props.subtitleOverlayOpacity,
    subtitleOverlayBackground: props.subtitleOverlayBackground, subtitleUpcomingLyricsBlur: props.subtitleUpcomingLyricsBlur,
    showHarmonySubtitle: props.showHarmonySubtitle, harmonySubtitleBackground: props.harmonySubtitleBackground,
    showSubtitleTranslation: props.showSubtitleTranslation, hideTranslationSubtitle: props.hideTranslationSubtitle,
    subtitleContentMode: props.subtitleContentMode, staticMode: props.staticMode };
});
export async function waitVisual(page, expected) {
  await page.waitForFunction(expected => {
    const props = window.__foliaReadVisualizerProps?.();
    return props && Object.entries(expected).every(([path, value]) => {
      const actual = path.split('.').reduce((part, key) => part?.[key], props);
      return JSON.stringify(actual) === JSON.stringify(value);
    });
  }, expected, { timeout: 15000 });
  return readVisual(page);
}

// Use genuine pointer input and keep the pointer held while the settings draft changes.
export async function dragVisualRange(page, range, fraction, whileHeld) {
  await range.scrollIntoViewIfNeeded();
  const bounds = await range.boundingBox(); assert(bounds && bounds.width > 20);
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(bounds.x + 8, y); await page.mouse.down();
  try {
    await page.mouse.move(bounds.x + 8 + (bounds.width - 16) * fraction, y, { steps: 8 });
    await visualFrame(page);
    const value = Number(await range.inputValue());
    if (whileHeld) await whileHeld(value);
    await page.mouse.up(); await visualFrame(page); return value;
  } finally { await page.mouse.up(); }
}

export async function readVisualCache(page, prefix) {
  return page.evaluate(async prefix => {
    const databases = await indexedDB.databases();
    if (!databases.some(database => database.name === 'KineticPlayerDB')) return [];
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('KineticPlayerDB'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const table = prefix.startsWith('lyric_') ? 'metadata_cache' : 'api_cache';
      const rows = await new Promise((resolve, reject) => {
        const request = db.transaction(table, 'readonly').objectStore(table).getAll();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      return rows.filter(row => row.key.startsWith(prefix)).map(row => ({ key: row.key, data: row.data.blob instanceof Blob
        ? { id: row.data.id, name: row.data.name, mimeType: row.data.mimeType, blobSize: row.data.blob.size,
          isBlob: true, thumbnailSize: row.data.thumbnail?.size ?? 0 } : row.data }));
    } finally { db.close(); }
  }, prefix);
}

export async function reloadVisualSong(page, song, packet) {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__foliaReadyAt !== null);
  await emitVisual(page, 'session', song); await emitVisual(page, 'lyrics', packet);
  await page.locator('.waiting-screen').waitFor({ state: 'detached' });
  await page.waitForFunction(() => window.__foliaReadVisualizerProps?.()?.lines.length > 0);
}
