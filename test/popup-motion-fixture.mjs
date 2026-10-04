import assert from 'node:assert/strict';
import { visualFrame } from './desktop-visual-fixture.mjs';

// test/popup-motion-fixture.mjs — record actual CSS entrances before short animations finish and inspect settled geometry.
export async function installPopupMotionProbe(page) {
  await page.addInitScript(() => {
    window.__foliaPopupMotion = new WeakMap();
    window.__foliaPopupMotionEvents = [];
    const effects = new WeakMap(), selector = '.desktop-glass-menu,.control-panel,.desktop-notice,.transport-caption.error,.desktop-visual-asset-dialog>[role=dialog]';
    // Keep the real effect before a busy frame finishes a brief animation and removes it from getAnimations().
    const captureEffects = node => {
      if (!(node instanceof Element)) return;
      for (const element of [node, ...node.querySelectorAll(selector)]) {
        if (!element.matches(selector)) continue;
        const animations = element.getAnimations().filter(animation => animation instanceof CSSAnimation);
        if (animations.length) effects.set(element, animations);
      }
    };
    new MutationObserver(records => records.forEach(record => {
      if (record.type === 'attributes') captureEffects(record.target);
      else record.addedNodes.forEach(captureEffects);
    })).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'role'] });
    document.addEventListener('animationstart', event => {
      const element = event.target;
      if (!(element instanceof Element) || !element.matches(selector)) return;
      const live = element.getAnimations().find(value => value instanceof CSSAnimation && value.animationName === event.animationName);
      const animation = live ?? effects.get(element)?.find(value => value.animationName === event.animationName);
      window.__foliaPopupMotionEvents.push({ name: event.animationName, className: element.className, hasEffect: Boolean(animation), time: performance.now() });
      if (!animation) return;
      const timing = animation.effect.getTiming(), style = getComputedStyle(element);
      const record = { name: event.animationName, duration: timing.duration, easing: style.animationTimingFunction,
        frames: animation.effect.getKeyframes().map(frame => ({ opacity: frame.opacity, translate: frame.translate, transform: frame.transform })),
        inline: { opacity: element.style.opacity, transform: element.style.transform }, origin: style.transformOrigin };
      window.__foliaPopupMotion.set(element, [...(window.__foliaPopupMotion.get(element) || []), record]);
    }, true);
  });
}

// Observe the production animation, then wait for its actual completion rather than a fixed sleep.
export async function popupMotion(page, surface, context, reduced, samples, expected) {
  await surface.waitFor({ state: 'attached' }); await visualFrame(page);
  const handle = await surface.elementHandle(); let record;
  try {
    if (!reduced) {
      await page.waitForFunction(element => window.__foliaPopupMotion.get(element)?.length > 0, handle, { timeout: 5000 });
      record = await surface.evaluate(element => window.__foliaPopupMotion.get(element).at(-1));
      assert.notEqual(record.name, 'none', context); assert.equal(record.duration, 160, `${context}: the shared entrance lasts exactly 160ms`);
      assert.equal(record.easing, 'cubic-bezier(0.2, 0.8, 0.2, 1)', `${context}: the shared entrance uses the requested easing`);
      const frames = record.frames; assert(Number(frames[0].opacity) < Number(frames.at(-1).opacity), `${context}: the surface fades in`);
      assert.equal(Number(frames.at(-1).opacity), 1, context);
      assert(frames.some(frame => frame.translate && !/^(none|0(?:px)?(?: 0(?:px)?)?)$/.test(frame.translate)), `${context}: the entrance includes a small translation`);
      if (expected) for (const key of ['name', 'duration', 'easing']) assert.equal(record[key], expected[key], `${context}: shared ${key}`);
    }
    await page.waitForFunction(element => element.getAnimations().every(animation =>
      !(animation instanceof CSSAnimation) || (!animation.pending && animation.playState !== 'running')), handle, { timeout: 5000 });
    const settled = await surface.evaluate(element => {
      const style = getComputedStyle(element); return { animation: style.animationName, opacity: style.opacity,
        translate: style.translate, transform: style.transform, bounds: element.getBoundingClientRect().toJSON(),
        inline: { opacity: element.style.opacity, transform: element.style.transform } };
    });
    assert.equal(settled.opacity, '1', `${context}: the final surface is opaque`);
    assert(/^(none|0(?:px)?(?: 0(?:px)?)?)$/.test(settled.translate), `${context}: the final surface has no translation drift`);
    assert.equal(settled.transform, 'none', `${context}: a legacy transform does not displace the settled surface`);
    assert(['', '1'].includes(settled.inline.opacity), `${context}: inline motion does not retain an intermediate opacity`);
    assert(['', 'none'].includes(settled.inline.transform), `${context}: inline motion does not retain a legacy transform`);
    if (reduced) {
      assert.equal(settled.animation, 'none', `${context}: reduced motion disables the entrance`);
      assert.equal(await surface.evaluate(element => window.__foliaPopupMotion.get(element)?.length ?? 0), 0,
        `${context}: reduced motion never starts an entrance`);
    }
    samples.push({ context, reduced, record, settled }); return record;
  } finally { await handle.dispose(); }
}

export async function popupItemVisible(item, viewport, context) {
  const handle = await viewport.elementHandle(); let result;
  try { result = await item.evaluate((element, viewport) => {
    const label = element.querySelector('.custom-select-option-label,:scope>span.truncate') ?? element;
    const bounds = element.getBoundingClientRect(), clip = viewport.getBoundingClientRect();
    return { text: label.textContent.trim(), width: label.clientWidth, scrollWidth: label.scrollWidth,
      visible: bounds.top >= clip.top - 1 && bounds.bottom <= clip.bottom + 1, bounds: bounds.toJSON() };
  }, handle); } finally { await handle.dispose(); }
  assert(result.visible, `${context}: the full option stays inside its scroll viewport`);
  assert(result.width > 0 && result.scrollWidth <= result.width + 1, `${context}: complete option text is visible: ${JSON.stringify(result)}`);
}

export async function popupStyleAligned(page, menu, context) {
  const geometry = await page.evaluate(() => {
    const anchor = document.querySelector('.topbar-mode-picker').getBoundingClientRect(), menu = document.querySelector('.desktop-top-menu').getBoundingClientRect();
    const width = Math.min(anchor.width, innerWidth - 16), left = Math.max(8, Math.min(anchor.left, innerWidth - width - 8));
    return { left, width, menu: menu.toJSON() };
  });
  assert(Math.abs(geometry.menu.left - geometry.left) <= .75 && Math.abs(geometry.menu.width - geometry.width) <= .75,
    `${context}: both settled menu edges align with the complete style trigger: ${JSON.stringify(geometry)}`);
  assert(await menu.isVisible());
}

// All registry labels must fit their rows, even when those rows are outside the current scroll viewport.
export async function popupStyleLabels(menu, context) {
  const rows = await menu.getByRole('option').evaluateAll(elements => elements.map(element => {
    const label = element.querySelector('.custom-select-option-label'), icon = element.querySelector('.custom-select-option-icon');
    return { value: element.getAttribute('data-value'), text: label?.textContent.trim(), width: label?.clientWidth,
      scrollWidth: label?.scrollWidth, left: label?.getBoundingClientRect().left, iconRight: icon?.getBoundingClientRect().right };
  }));
  assert.equal(rows.length, 13, `${context}: all thirteen registered styles remain available`);
  assert.equal(new Set(rows.map(row => row.value)).size, 13, `${context}: every style appears exactly once`);
  for (const row of rows) {
    assert(row.text && row.width > 0 && row.scrollWidth <= row.width, `${context}/${row.value}: complete style text remains readable`);
    assert(Math.abs(row.left - rows[0].left) <= .75, `${context}/${row.value}: style names share the same column`);
    assert(Math.abs(row.left - row.iconRight - 8) <= .75, `${context}/${row.value}: the icon retains its 8px text gap`);
  }
}
