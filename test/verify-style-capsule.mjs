import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { desktopSelect, openDesktopMenu } from './desktop-select.mjs';

// test/verify-style-capsule.mjs — the compound style selector owns one complete glass highlight surface.
export async function verifyStyleCapsule(page, output) {
  const checks = [], samples = [];
  const capsule = page.locator('.topbar-mode-picker'), trigger = desktopSelect(page, '歌词样式');
  const ordinary = page.getByRole('button', { name: '显示译文', exact: true });
  const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const snapshot = async context => {
    const sample = await capsule.evaluate(element => {
      const button = element.querySelector('[role="combobox"]'), bounds = element.getBoundingClientRect();
      const outer = getComputedStyle(element), glow = getComputedStyle(element, '::before');
      const inner = getComputedStyle(button), innerGlow = getComputedStyle(button, '::before');
      return { bounds: bounds.toJSON(), opacity: element.style.getPropertyValue('--light-opacity'),
        light: { x: parseFloat(element.style.getPropertyValue('--light-x')), y: parseFloat(element.style.getPropertyValue('--light-y')) },
        outer: { background: outer.backgroundColor, transform: outer.transform, transition: outer.transitionDuration,
          outline: outer.outlineStyle, outlineWidth: outer.outlineWidth, color: outer.color },
        glow: { display: glow.display, width: parseFloat(glow.width), height: parseFloat(glow.height),
          inset: [glow.top, glow.right, glow.bottom, glow.left], background: glow.backgroundImage },
        inner: { opacity: button.style.getPropertyValue('--light-opacity'), background: inner.backgroundColor,
          image: inner.backgroundImage, shadow: inner.boxShadow, borderWidth: inner.borderTopWidth,
          transform: inner.transform, glowDisplay: innerGlow.display } };
    });
    samples.push({ context, ...sample }); return sample;
  };
  const transparentInner = (sample, context) => {
    assert.equal(sample.inner.opacity, '', `${context}: the inner button must not own a second highlight`);
    assert.equal(sample.inner.glowDisplay, 'none'); assert.equal(sample.inner.background, 'rgba(0, 0, 0, 0)');
    assert.equal(sample.inner.image, 'none'); assert.equal(sample.inner.shadow, 'none');
    assert.equal(sample.inner.borderWidth, '0px'); assert.equal(sample.inner.transform, 'none');
  };
  // Point at the actual icon, label and arrow instead of treating the inner button as the whole capsule.
  for (const [name, locator] of [['icon', capsule.locator(':scope > svg')], ['label', trigger.locator('span')], ['arrow', trigger.locator('svg')]]) {
    const bounds = await locator.boundingBox(); assert(bounds, `${name}: rendered target has geometry`);
    const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    await page.mouse.move(point.x, point.y);
    await page.waitForFunction(() => document.querySelector('.topbar-mode-picker')?.style.getPropertyValue('--light-opacity') === '1');
    await frame(); const sample = await snapshot(`hover-${name}`);
    assert(Math.abs(sample.light.x - (point.x - sample.bounds.x)) <= 1 && Math.abs(sample.light.y - (point.y - sample.bounds.y)) <= 1,
      `${name}: highlight coordinates must belong to the complete outer capsule`);
    assert.deepEqual(sample.glow.inset, ['0px', '0px', '0px', '0px']);
    assert(Math.abs(sample.glow.width - sample.bounds.width) <= 2.5 && Math.abs(sample.glow.height - sample.bounds.height) <= 2.5,
      `${name}: the glow must cover the whole capsule, including its icon and padding`);
    assert.notEqual(sample.glow.background, 'none'); transparentInner(sample, name);
    await capsule.screenshot({ path: `${output}/glass-style-capsule-hover-${name}.png` });
    if (name === 'label') await page.screenshot({ path: `${output}/glass-style-capsule-hover-full.png` });
  }
  checks.push('style icon, label and arrow light the entire capsule with outer-surface coordinates and no inner light block');
  const collapsed = await snapshot('collapsed');
  let menu = await openDesktopMenu(page, '歌词样式'); await frame();
  await page.waitForFunction(() => document.querySelector('[role="combobox"][aria-label="歌词样式"]')?.getAttribute('aria-expanded') === 'true');
  await page.waitForFunction(() => {
    const surface = document.querySelector('.topbar-mode-picker');
    if (!surface) return false;
    const reference = document.createElement('span');
    reference.style.cssText = 'display:none;background-color:var(--desktop-glass-selected)'; surface.append(reference);
    const expected = getComputedStyle(reference).backgroundColor; reference.remove();
    return getComputedStyle(surface).backgroundColor === expected;
  }, null, { timeout: 5000 });
  const expanded = await snapshot('expanded'); transparentInner(expanded, 'expanded');
  assert.notEqual(expanded.outer.background, collapsed.outer.background, 'the expanded state belongs to the outer capsule');
  assert(Math.abs(expanded.bounds.width - collapsed.bounds.width) <= 0.75, 'opening the menu preserves the anchor width');
  await capsule.screenshot({ path: `${output}/glass-style-capsule-expanded.png` });
  await menu.getByRole('option').first().hover(); await frame();
  assert.equal(await capsule.evaluate(element => element.style.getPropertyValue('--light-opacity')), '', 'moving into the menu clears the capsule highlight');
  await page.keyboard.press('Escape'); await menu.waitFor({ state: 'detached' });
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  await trigger.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab'); await frame();
  const focused = await snapshot('keyboard-focus');
  assert.equal(focused.outer.outline, 'solid'); assert.equal(focused.outer.outlineWidth, '2px');
  transparentInner(focused, 'keyboard focus');
  checks.push('expanded selection and keyboard focus apply to the complete capsule without changing its menu anchor');

  await ordinary.hover(); await frame();
  assert.equal(await ordinary.evaluate(element => element.style.getPropertyValue('--light-opacity')), '1');
  assert.equal(await capsule.evaluate(element => element.style.getPropertyValue('--light-opacity')), '');
  await trigger.locator('span').hover(); await frame();
  assert.equal(await ordinary.evaluate(element => element.style.getPropertyValue('--light-opacity')), '');
  assert.equal(await capsule.evaluate(element => element.style.getPropertyValue('--light-opacity')), '1');
  await page.mouse.move(450, 400); await frame();
  assert.equal(await capsule.evaluate(element => element.style.getPropertyValue('--light-opacity')), '');
  checks.push('switching between the capsule and ordinary buttons clears the old highlight, and leaving controls clears it');

  try {
    await trigger.locator('span').hover(); await frame();
    await page.emulateMedia({ reducedMotion: 'reduce' }); await frame();
    const reduced = await snapshot('reduced-motion');
    assert.equal(reduced.opacity, ''); assert.equal(reduced.glow.display, 'none'); assert.equal(reduced.outer.transition, '0s');
    await trigger.locator('svg').hover(); await frame();
    assert.equal(await capsule.evaluate(element => element.style.getPropertyValue('--light-opacity')), '');
    menu = await openDesktopMenu(page, '歌词样式'); await page.keyboard.press('Escape'); await menu.waitFor({ state: 'detached' });
    await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'active' });
    await trigger.locator('span').hover(); await frame();
    const forced = await snapshot('forced-colors'); assert.equal(forced.glow.display, 'none');
    assert.notEqual(forced.outer.background, forced.outer.color, 'forced-colors keeps text distinguishable without decorative glow');
    menu = await openDesktopMenu(page, '歌词样式'); await page.keyboard.press('Escape'); await menu.waitFor({ state: 'detached' });
    await page.emulateMedia({ forcedColors: 'none' });
    await page.evaluate(() => window.__foliaEmit('appearance', { acrylic: false, solid: true, highContrast: true }));
    await page.locator('.desktop-lyrics.high-contrast').waitFor(); await trigger.locator('span').hover(); await frame();
    const contrast = await snapshot('high-contrast'); assert.equal(contrast.glow.display, 'none');
    assert.notEqual(contrast.outer.background, contrast.outer.color);
    checks.push('reduced motion clears and suppresses the capsule glow while keeping its menu usable',
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
