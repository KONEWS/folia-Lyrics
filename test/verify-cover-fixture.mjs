import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { emitVisual, readVisual, visualFrame } from './desktop-visual-fixture.mjs';
import { setDesktopCoverTheme } from './desktop-select.mjs';

// test/verify-cover-fixture.mjs — optional external SMTC bytes, browser decode and same-song late cover propagation.
const syntheticCover = () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#df5638"/><rect x="48" width="48" height="96" fill="#246edc"/></svg>';
  return { source: 'synthetic SVG', bytes: Buffer.byteLength(svg), dataUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    originalDataUrl: 'data:image/jpeg,image/jpg;base64,bm90LWFuLWltYWdl' };
};
// PowerShell fixtures may contain a BOM; keep malformed JSON diagnostics from printing image payloads.
const parseFixture = text => {
  try { return JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('The external cover fixture must contain valid JSON.'); }
};
// Check decoding separately, then observe the application's real late-cover and refresh paths.
export async function verifyCoverFixture(page, song, output, { onPalette } = {}) {
  const previousCoverTheme = await setDesktopCoverTheme(page);
  const checks = [], fixture = process.env.FOLIA_COVER_FIXTURE
    ? parseFixture(await readFile(process.env.FOLIA_COVER_FIXTURE, 'utf8')) : syntheticCover();
  let sha256;
  assert.match(fixture.dataUrl, /^data:image\//, 'the optional cover fixture must stay local');
  assert.match(fixture.originalDataUrl, /^data:/, 'the broken original fixture must stay local');
  assert.notEqual(fixture.dataUrl, fixture.originalDataUrl);
  // Decode the original and repaired URLs directly: no player, remote host or second extraction implementation.
  const decodeContext = await page.context().browser().newContext(), decodePage = await decodeContext.newPage();
  let decoded;
  try { decoded = await decodePage.evaluate(async fixture => {
    const decode = async src => { const image = new Image(); image.src = src;
      try { await image.decode(); return { loaded: true, width: image.naturalWidth, height: image.naturalHeight }; }
      catch { return { loaded: false, width: image.naturalWidth, height: image.naturalHeight }; } };
    return { original: await decode(fixture.originalDataUrl), normalized: await decode(fixture.dataUrl) };
  }, { dataUrl: fixture.dataUrl, originalDataUrl: fixture.originalDataUrl }); }
  finally { await decodeContext.close(); }
  assert.equal(decoded.original.loaded, false, 'the original SMTC header reproduces image decode failure');
  assert.equal(decoded.normalized.loaded, true); assert(decoded.normalized.width > 0 && decoded.normalized.height > 0);
  if (process.env.FOLIA_COVER_FIXTURE) {
    const bytes = Buffer.from(fixture.dataUrl.slice(fixture.dataUrl.indexOf(',') + 1), 'base64');
    assert.equal(bytes.length, fixture.bytes, 'the native fixture byte count survives URL normalization');
    assert.equal(fixture.originalDataUrl.slice(fixture.originalDataUrl.indexOf('base64,') + 7), bytes.toString('base64'), 'normalization retains the original image bytes');
    sha256 = createHash('sha256').update(bytes).digest('hex');
    if (fixture.sha256) assert.equal(sha256, fixture.sha256.toLowerCase());
  }
  checks.push(process.env.FOLIA_COVER_FIXTURE
    ? 'the real SMTC cover decodes in Chromium, its original malformed URL fails, and normalization preserves every image byte'
    : 'the synthetic cover decodes in Chromium while a malformed local image URL fails');
  await emitVisual(page, 'session', { ...song, cover: '' }); await page.locator('.cover-theme').waitFor({ state: 'detached' });
  await page.waitForFunction(() => window.__foliaReadVisualizerProps?.()?.lines.length > 0);
  const before = await readVisual(page);
  await page.evaluate(() => { const props = window.__foliaReadVisualizerProps(); window.__foliaCoverBefore = {
    clock: props.currentTime, lines: props.lines, commands: window.__foliaCommands.length,
    palette: document.querySelector('.desktop-lyrics').style.getPropertyValue('--cover-accent') }; });
  await emitVisual(page, 'session', { ...song, cover: fixture.dataUrl });
  await page.waitForFunction(url => {
    const image = document.querySelector('.track-caption img'), root = document.querySelector('.desktop-lyrics');
    return image?.getAttribute('src') === url && image.complete && image.naturalWidth > 0 && root.classList.contains('cover-theme')
      && root.style.getPropertyValue('--cover-accent') !== window.__foliaCoverBefore.palette;
  }, fixture.dataUrl, { timeout: 15000 });
  const after = await readVisual(page), stable = await page.evaluate(() => {
    const props = window.__foliaReadVisualizerProps(), previous = window.__foliaCoverBefore;
    return { clock: props.currentTime === previous.clock, lines: props.lines === previous.lines,
      commands: window.__foliaCommands.length === previous.commands, title: document.querySelector('.track-caption strong').textContent,
      palette: document.querySelector('.desktop-lyrics').style.getPropertyValue('--cover-accent') };
  });
  assert(stable.clock && stable.lines && stable.commands, 'a late cover does not rebuild the lyric clock/lines or issue player actions');
  assert.equal(stable.title, song.title); assert.equal(after.clock, before.clock); assert.equal(after.paused, before.paused);
  assert.deepEqual(after.lines, before.lines); assert.notEqual(after.theme.accentColor, before.theme.accentColor);
  assert.equal(await page.locator('.transport-caption').count(), 0); assert.equal(await page.locator('.waiting-screen').count(), 0);
  await page.screenshot({ path: `${output}/cover-fixture-late.png` });
  checks.push('a cover arriving for the current song refreshes the real header and renderer theme while retaining the same paused clock, lyric lines and silent transport');
  // Let focused UI checks observe this real, decoded cover palette without a second cover fixture or theme mock.
  const palette = onPalette ? await onPalette() : { checks: [], samples: [] };
  checks.push(...palette.checks);
  await emitVisual(page, 'session', { ...song, cover: fixture.dataUrl }); await visualFrame(page);
  assert.equal((await readVisual(page)).theme.accentColor, after.theme.accentColor);
  checks.push('a repeated cover event for the same song retains the completed palette');
  const refresh = page.getByRole('button', { name: '刷新主题色', exact: true });
  await page.waitForFunction(() => document.querySelector('[aria-label="刷新主题色"]')?.disabled === false);
  await refresh.click(); await page.waitForFunction(accent => window.__foliaReadVisualizerProps?.()?.theme.accentColor !== accent, after.theme.accentColor);
  const refreshed = await readVisual(page); assert.equal(refreshed.clock, before.clock); assert.deepEqual(refreshed.lines, before.lines);
  assert.equal(await page.locator('.track-caption img').getAttribute('src'), fixture.dataUrl);
  assert(await page.evaluate(() => window.__foliaCommands.length === window.__foliaCoverBefore.commands));
  checks.push('the repaired cover enables the existing theme refresh action, which changes its palette without changing the artwork, lyrics or player state');
  await emitVisual(page, 'session', { ...song, cover: '' }); await page.locator('.cover-theme').waitFor({ state: 'detached' });
  await page.evaluate(() => delete window.__foliaCoverBefore);
  await setDesktopCoverTheme(page, previousCoverTheme);
  return { checks, samples: [{ source: fixture.source, bytes: fixture.bytes, sha256, decoded, lateCover: stable }, ...palette.samples] };
}
