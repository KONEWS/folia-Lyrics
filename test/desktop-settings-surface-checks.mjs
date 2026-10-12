import assert from 'node:assert/strict';
import { installDesktopBridgeMock } from './desktop-bridge-mock.mjs';
import { backgroundDialog, visualFrame, openBackgroundSettings, closeBackgroundSettings } from './desktop-visual-fixture.mjs';

// test/desktop-settings-surface-checks.mjs — cold module opening and real inset scrollport/material regressions.

// Hold the lazy module in a fresh context so even idle preloading cannot hide a first-click placeholder or late opening.
export async function verifyColdSettingsOpen(page, checks, samples) {
  for (const cancel of ['escape', 'main-settings']) {
    const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 } });
    const cold = await context.newPage(); const errors = [];
    cold.on('pageerror', error => errors.push(String(error)));
    let release; const held = new Promise(resolve => { release = resolve; });
    let moduleRequested = false;
    try {
      await cold.addInitScript(() => {
        localStorage.setItem('folia.desktop.mode.v1', 'classic');
        sessionStorage.setItem('folia.test.mockPreferences', JSON.stringify({ autoImmersive: false, audioReactive: false }));
        window.__foliaSettingsLoadTrace = [];
        const inspect = node => {
          const text = node.textContent || '';
          if (/读取本机设置/.test(text)) window.__foliaSettingsLoadTrace.push(text.trim());
          if (node instanceof Element && (node.matches('.control-panel[role="status"]') || node.querySelector('.control-panel[role="status"]')))
            window.__foliaSettingsLoadTrace.push('settings status placeholder');
        };
        new MutationObserver(records => { for (const record of records) {
          for (const node of record.addedNodes) inspect(node);
          if (record.type === 'characterData') inspect(record.target);
        } }).observe(document, { childList: true, subtree: true, characterData: true });
      });
      await installDesktopBridgeMock(cold);
      await cold.route('**/DesktopVisualSettings-*.js', async route => { moduleRequested = true; await held; await route.fallback(); });
      await cold.goto(page.url(), { waitUntil: 'domcontentloaded' });
      const opener = cold.getByRole('button', { name: '背景设置', exact: true });
      await opener.waitFor(); await opener.click(); await visualFrame(cold);
      assert(moduleRequested, 'the first background click must really request the held lazy module');
      assert.deepEqual(await cold.evaluate(() => window.__foliaSettingsLoadTrace), [], 'a delayed first click never paints a local-settings loading placeholder');
      assert.equal(await backgroundDialog(cold).count(), 0, 'the complete background shell waits for its controls');
      if (cancel === 'escape') await cold.keyboard.press('Escape');
      else { await cold.locator('[data-settings-trigger]').click(); await cold.locator('.desktop-main-settings').waitFor(); }
      release(); await cold.waitForLoadState('networkidle'); await visualFrame(cold);
      assert.equal(await backgroundDialog(cold).count(), 0, `${cancel}: releasing the module cannot reopen the canceled panel`);
      if (cancel === 'main-settings') { assert(await cold.locator('.desktop-main-settings').isVisible()); await cold.locator('[data-settings-trigger]').click(); }
      await opener.click(); await backgroundDialog(cold).waitFor(); await visualFrame(cold);
      assert.deepEqual(await cold.evaluate(() => window.__foliaSettingsLoadTrace), [], 'the later completed opening still has no loading placeholder');
      assert(await backgroundDialog(cold).locator('[data-visual-section="background"] [role="switch"]').count() > 0);
      assert.deepEqual(errors, []);
      samples.push({ context: `cold-settings-${cancel}`, moduleRequested, loadingTrace: await cold.evaluate(() => window.__foliaSettingsLoadTrace) });
      checks.push(`a fresh delayed settings module paints no placeholder; ${cancel} cancels the pending opening and the next click mounts complete background controls`);
    } finally { release(); await context.close(); }
  }
}

// Measure the real scrollport and rounded shell, including a genuine scroll to the bottom rather than CSS-only checks.
async function measureSurface(page, panel, label, samples) {
  await panel.evaluate(async element => { await Promise.allSettled(element.getAnimations({ subtree: true })
    .filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished)); });
  const scroll = panel.locator(':scope > .desktop-settings-scroll');
  assert.equal(await scroll.count(), 1, `${label}: exactly one separate scrollport`);
  await scroll.evaluate(element => { element.scrollTop = 0; }); await visualFrame(page);
  const sample = await panel.evaluate(element => {
    const scroll = element.querySelector(':scope > .desktop-settings-scroll');
    const css = getComputedStyle(element), scrolling = getComputedStyle(scroll), control = getComputedStyle(element.querySelector('[role="combobox"]'));
    const material = ['backgroundColor', 'borderTopColor', 'borderRadius', 'boxShadow', 'backdropFilter'];
    const controls = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'minHeight', 'borderRadius', 'fontSize', 'lineHeight', 'backgroundColor', 'borderTopColor'];
    const tokens = ['--desktop-settings-inline', '--desktop-settings-group-gap', '--desktop-settings-item-gap', '--desktop-settings-label-gap', '--desktop-settings-scroll-inset'];
    const original = element.querySelector('.desktop-visual-original-panel');
    const matchedRules = [];
    const inspectRules = (rules, sheet, conditions = []) => { for (const rule of rules) {
      if (rule.selectorText && rule.style && ['overflow', 'overflowX', 'overflowY', 'padding', 'paddingTop', 'paddingLeft', 'display'].some(key => rule.style[key])) for (const [target, node] of [['outer', element], ['scrollport', scroll]]) {
        try { if (node.matches(rule.selectorText)) matchedRules.push({ target, sheet, conditions, selector: rule.selectorText, css: rule.style.cssText }); }
        catch { /* Unsupported pseudo-selectors cannot match these two ordinary elements. */ }
      }
      if (rule.cssRules?.length) inspectRules(rule.cssRules, sheet, rule.conditionText ? [...conditions, rule.conditionText] : conditions);
    } };
    for (const sheet of document.styleSheets) { try { inspectRules(sheet.cssRules, sheet.href); } catch { /* Ignore inaccessible external sheets. */ } }
    return { bounds: element.getBoundingClientRect().toJSON(), scroll: scroll.getBoundingClientRect().toJSON(),
      overflowX: css.overflowX, overflowY: css.overflowY, scrolling: scrolling.overflowY, radius: parseFloat(css.borderBottomRightRadius),
      scrollHeight: scroll.scrollHeight, clientHeight: scroll.clientHeight, horizontalOverflow: scroll.scrollWidth > scroll.clientWidth,
      padding: [scrolling.paddingLeft, scrolling.paddingRight], material: Object.fromEntries(material.map(key => [key, css[key]])),
      control: Object.fromEntries(controls.map(key => [key, control[key]])), tokens: Object.fromEntries(tokens.map(key => [key, css.getPropertyValue(key).trim()])),
      visualGaps: [css.getPropertyValue('--visual-card-gap').trim(), css.getPropertyValue('--visual-item-gap').trim()],
      original: original ? { paddingTop: getComputedStyle(original).paddingTop, borderTopWidth: getComputedStyle(original).borderTopWidth } : null,
      className: element.className, inlineStyle: element.getAttribute('style'), scrollClassName: scroll.className, matchedRules,
      stylesheets: [...document.styleSheets].map(sheet => sheet.href), links: [...document.querySelectorAll('link[rel="stylesheet"]')].map(link => link.href) };
  });
  samples.push({ context: `measured-${label}`, surface: sample });
  assert.equal(sample.overflowX, 'hidden', `${label}: horizontal shell clipping`); assert.equal(sample.overflowY, 'hidden', `${label}: vertical shell clipping`);
  assert(['auto', 'scroll'].includes(sample.scrolling)); assert.equal(sample.horizontalOverflow, false);
  const inset = Number.parseFloat(sample.tokens['--desktop-settings-scroll-inset']); assert(inset > 0);
  assert(sample.scroll.left >= sample.bounds.left + inset - .75 && sample.scroll.right <= sample.bounds.right - inset + .75
    && sample.scroll.bottom <= sample.bounds.bottom - inset + .75, `${label}: the scrollbar track is inset from the glass edges`);
  const dx = Math.max(0, sample.scroll.right - 1 - (sample.bounds.right - sample.radius));
  const dy = Math.max(0, sample.scroll.bottom - 1 - (sample.bounds.bottom - sample.radius));
  assert(dx * dx + dy * dy <= sample.radius * sample.radius + 1, `${label}: the scrollport corner stays inside the rounded shell`);
  assert(sample.scrollHeight > sample.clientHeight, `${label}: the settings content really overflows vertically`);
  await scroll.evaluate(element => { element.scrollTop = element.scrollHeight; }); await visualFrame(page);
  assert(await scroll.evaluate(element => element.scrollTop > 0), `${label}: the actual inner scrollport reaches its lower controls`);
  assert.equal(await panel.evaluate(element => element.scrollTop), 0, `${label}: the outer shell never scrolls`);
  await scroll.evaluate(element => { element.scrollTop = 0; }); await scroll.hover(); await visualFrame(page);
  return sample;
}

// Compare real shell bounds, glass/control materials, shared spacing and inset scrolling across normal and narrow windows.
export async function verifySettingsSurfaceParity(page, output, checks, samples) {
  for (const [width, height] of [[1280, 800], [450, 800], [450, 300]]) {
    await page.setViewportSize({ width, height });
    const main = page.locator('.desktop-main-settings'); await page.locator('[data-settings-trigger]').click(); await main.waitFor();
    const normal = await measureSurface(page, main, `${width}x${height} main`, samples);
    const suffix = width === 1280 ? '' : `-${width}x${height}`;
    await main.screenshot({ path: `${output}/settings-surface-main${suffix}.png` });
    await page.locator('[data-settings-trigger]').click(); await main.waitFor({ state: 'detached' });
    await openBackgroundSettings(page);
    const config = backgroundDialog(page).locator('[data-visual-config]'); const wasOpen = await config.getAttribute('open') !== null;
    if (!wasOpen) await config.locator('summary').click();
    const background = await measureSurface(page, backgroundDialog(page), `${width}x${height} background`, samples);
    if (!wasOpen) await config.locator('summary').click();
    await backgroundDialog(page).locator(':scope > .desktop-settings-scroll').evaluate(element => { element.scrollTop = 0; });
    await backgroundDialog(page).locator(':scope > .desktop-settings-scroll').hover(); await visualFrame(page);
    await backgroundDialog(page).screenshot({ path: `${output}/settings-surface-background${suffix}.png` });
    for (const key of ['x', 'y', 'width', 'height']) assert(Math.abs(normal.bounds[key] - background.bounds[key]) <= .75, `${width}x${height}: ${key} matches the main settings`);
    assert.deepEqual(background.material, normal.material, 'background and main settings use the same computed glass material');
    assert.deepEqual(background.control, normal.control, 'the real shared selectors use the same control dimensions and fill');
    assert.deepEqual(background.tokens, normal.tokens); assert(Object.values(normal.tokens).every(Boolean));
    assert.deepEqual(background.visualGaps, [background.tokens['--desktop-settings-group-gap'], background.tokens['--desktop-settings-item-gap']], 'narrow background aliases keep the shared spacing instead of generic visual-page overrides');
    assert.deepEqual(background.original, { paddingTop: '0px', borderTopWidth: '0px' }, 'the original background wrapper introduces neither a duplicate divider nor duplicate top padding');
    assert.deepEqual(background.padding, normal.padding, 'both scrollports use the same content padding');
    samples.push({ context: `settings-surface-${width}x${height}`, main: normal, background });
    checks.push(`${width}x${height}: main and background shells share actual bounds, material, controls and spacing; both inset scrollports stay inside the corners and really scroll`);
    await closeBackgroundSettings(page);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}
