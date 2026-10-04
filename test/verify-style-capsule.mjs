import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { desktopSelect, openDesktopMenu } from './desktop-select.mjs';

// test/verify-style-capsule.mjs — the complete style trigger stays quiet until hover, expansion or keyboard focus.
export async function verifyStyleCapsule(page, output) {
  const checks = [], samples = [];
  const capsule = page.locator('.topbar-mode-picker'), trigger = desktopSelect(page, '歌词样式');
  const ordinary = page.getByRole('button', { name: '显示译文', exact: true });
  const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  // Wait for the real local-fill transition rather than sampling an intermediate animation color.
  const settleBackground = value => page.waitForFunction(value => {
    const surface = document.querySelector('.topbar-mode-picker');
    if (!surface) return false;
    const reference = document.createElement('span'); reference.style.cssText = `display:none;background-color:${value}`;
    surface.append(reference); const expected = getComputedStyle(reference).backgroundColor; reference.remove();
    return getComputedStyle(surface).backgroundColor === expected;
  }, value, { timeout: 5000 });
  const snapshot = async context => {
    const sample = await capsule.evaluate(element => {
      const button = element.querySelector('[role="combobox"]'), bounds = element.getBoundingClientRect();
      const outer = getComputedStyle(element), glow = getComputedStyle(element, '::before');
      const inner = getComputedStyle(button), innerGlow = getComputedStyle(button, '::before');
      return { bounds: bounds.toJSON(),
        outer: { background: outer.backgroundColor, image: outer.backgroundImage, shadow: outer.boxShadow,
          blur: outer.backdropFilter, radius: outer.borderTopLeftRadius, border: outer.borderTopColor,
          transform: outer.transform, transition: outer.transitionDuration,
          outline: outer.outlineStyle, outlineWidth: outer.outlineWidth, color: outer.color },
        glow: { display: glow.display },
        inner: { background: inner.backgroundColor,
          image: inner.backgroundImage, shadow: inner.boxShadow, borderWidth: inner.borderTopWidth,
          transform: inner.transform, glowDisplay: innerGlow.display } };
    });
    samples.push({ context, ...sample }); return sample;
  };
  const quietOuter = (sample, context) => {
    assert.equal(sample.glow.display, 'none', `${context}: the trigger has no pointer reflection`);
    assert.equal(sample.outer.image, 'none'); assert.equal(sample.outer.shadow, 'none'); assert.equal(sample.outer.blur, 'none');
    assert.equal(sample.outer.border, 'rgba(0, 0, 0, 0)', `${context}: local feedback has no enclosing rim`);
    assert(parseFloat(sample.outer.radius) <= 10, `${context}: the trigger keeps a small corner radius`);
  };
  const transparentInner = (sample, context) => {
    assert.equal(sample.inner.glowDisplay, 'none', `${context}: the inner button has no second reflection`);
    assert.equal(sample.inner.background, 'rgba(0, 0, 0, 0)');
    assert.equal(sample.inner.image, 'none'); assert.equal(sample.inner.shadow, 'none');
    assert.equal(sample.inner.borderWidth, '0px'); assert.equal(sample.inner.transform, 'none');
  };
  await page.mouse.move(450, 400); await settleBackground('transparent');
  const idle = await snapshot('idle'); quietOuter(idle, 'idle'); transparentInner(idle, 'idle');
  assert.equal(idle.outer.background, 'rgba(0, 0, 0, 0)', 'the style trigger leaves the lyric canvas visible at rest');
  // Every visible part of the compound selector must activate the same local fill and reachable trigger.
  for (const [name, locator] of [['icon', trigger.locator('.custom-select-prefix svg')], ['label', trigger.locator(':scope > span.truncate')], ['arrow', trigger.locator(':scope > svg')]]) {
    const bounds = await locator.boundingBox(); assert(bounds, `${name}: rendered target has geometry`);
    const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    await page.mouse.move(point.x, point.y);
    await settleBackground('var(--desktop-glass-hover)');
    assert(await trigger.evaluate((element, point) => {
      const hit = document.elementFromPoint(point.x, point.y); return hit === element || element.contains(hit);
    }, point), `${name}: the visible target belongs to the complete clickable trigger`);
    const sample = await snapshot(`hover-${name}`); quietOuter(sample, name); transparentInner(sample, name);
    assert.notEqual(sample.outer.background, idle.outer.background, `${name}: hover has a local fill`);
    await capsule.screenshot({ path: `${output}/glass-style-capsule-hover-${name}.png` });
    if (name === 'label') await page.screenshot({ path: `${output}/glass-style-capsule-hover-full.png` });
  }
  checks.push('style icon, label and arrow activate one flat local fill without reflection, shadow or a second inner surface');
  const collapsed = await snapshot('collapsed');
  let menu = await openDesktopMenu(page, '歌词样式'); await frame();
  await page.waitForFunction(() => document.querySelector('[role="combobox"][aria-label="歌词样式"]')?.getAttribute('aria-expanded') === 'true');
  await settleBackground('var(--desktop-glass-selected)');
  const expanded = await snapshot('expanded'); quietOuter(expanded, 'expanded'); transparentInner(expanded, 'expanded');
  assert.notEqual(expanded.outer.background, collapsed.outer.background, 'the expanded state belongs to the outer capsule');
  assert(Math.abs(expanded.bounds.width - collapsed.bounds.width) <= 0.75, 'opening the menu preserves the anchor width');
  await capsule.screenshot({ path: `${output}/glass-style-capsule-expanded.png` });
  await menu.getByRole('option').first().hover(); await frame();
  await settleBackground('var(--desktop-glass-selected)');
  quietOuter(await snapshot('expanded-menu-hover'), 'menu hover');
  await page.keyboard.press('Escape'); await menu.waitFor({ state: 'detached' });
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  await settleBackground('transparent');
  await trigger.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab'); await frame();
  const focused = await snapshot('keyboard-focus');
  assert.equal(focused.outer.outline, 'solid'); assert.equal(focused.outer.outlineWidth, '2px');
  quietOuter(focused, 'keyboard focus'); transparentInner(focused, 'keyboard focus');
  checks.push('expanded selection and keyboard focus apply to the complete capsule without changing its menu anchor');

  await ordinary.hover(); await frame();
  assert.equal(await ordinary.evaluate(element => getComputedStyle(element, '::before').display), 'none', 'ordinary toolbar buttons also omit pointer reflection');
  assert.equal(await ordinary.evaluate(element => getComputedStyle(element).backgroundImage), 'none');
  assert.equal(await ordinary.evaluate(element => getComputedStyle(element).boxShadow), 'none');
  await settleBackground('transparent');
  await trigger.locator(':scope > span.truncate').hover(); await settleBackground('var(--desktop-glass-hover)');
  await page.mouse.move(450, 400); await settleBackground('transparent');
  quietOuter(await snapshot('pointer-left'), 'pointer left');
  checks.push('moving between toolbar controls and leaving them restores the transparent style trigger without decorative reflection');

  try {
    await trigger.locator(':scope > span.truncate').hover(); await frame();
    await page.emulateMedia({ reducedMotion: 'reduce' }); await frame();
    const reduced = await snapshot('reduced-motion');
    quietOuter(reduced, 'reduced motion'); assert.equal(reduced.outer.transition, '0s');
    await trigger.locator(':scope > svg').hover(); await frame();
    quietOuter(await snapshot('reduced-motion-arrow'), 'reduced motion arrow');
    menu = await openDesktopMenu(page, '歌词样式'); await page.keyboard.press('Escape'); await menu.waitFor({ state: 'detached' });
    await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'active' });
    await trigger.locator(':scope > span.truncate').hover(); await frame();
    const forced = await snapshot('forced-colors'); assert.equal(forced.glow.display, 'none');
    assert.notEqual(forced.outer.background, forced.outer.color, 'forced-colors keeps text distinguishable without decorative glow');
    menu = await openDesktopMenu(page, '歌词样式'); await page.keyboard.press('Escape'); await menu.waitFor({ state: 'detached' });
    await page.emulateMedia({ forcedColors: 'none' });
    await page.evaluate(() => window.__foliaEmit('appearance', { acrylic: false, solid: true, highContrast: true }));
    await page.locator('.desktop-lyrics.high-contrast').waitFor(); await trigger.locator(':scope > span.truncate').hover(); await frame();
    const contrast = await snapshot('high-contrast'); assert.equal(contrast.glow.display, 'none');
    assert.notEqual(contrast.outer.background, contrast.outer.color);
    checks.push('reduced motion suppresses trigger transitions while keeping its menu usable',
      'forced colors and high contrast suppress decorative glow while retaining readable capsule text and menus');
  } finally {
    await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
    await page.evaluate(() => window.__foliaEmit('appearance', { acrylic: false, solid: false, highContrast: false }));
    await page.locator('.desktop-lyrics.high-contrast').waitFor({ state: 'detached' });
    await page.mouse.move(450, 400); await frame();
  }
  await writeFile(`${output}/glass-style-capsule-geometry.json`, JSON.stringify(samples, null, 2));
  return checks;
}
