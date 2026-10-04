import assert from 'node:assert/strict';
// test/secondary-scrollbar-fixture.mjs — observe desktop scrollbar CSS and verify scrolling with genuine wheel input.

// Keep visible scrollbar parts separate from the style menu's deliberately hidden scrollbar contract.
export async function secondaryScrollbars(page, locator, context, samples, { hidden = false, scroll = false } = {}) {
  const stats = await locator.evaluate(element => {
    const css = getComputedStyle(element);
    const part = pseudo => {
      const style = getComputedStyle(element, pseudo);
      return { display: style.display, width: style.width, height: style.height,
        background: style.backgroundColor, radius: style.borderRadius, border: style.borderTopWidth,
        clip: style.backgroundClip };
    };
    const thumb = part('::-webkit-scrollbar-thumb');
    // A canvas normalizes rgba(), color(srgb) and other browser-computed color formats to one alpha value.
    const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
    const paint = canvas.getContext('2d'); paint.fillStyle = thumb.background; paint.fillRect(0, 0, 1, 1);
    thumb.alpha = CSS.supports('color', thumb.background) ? paint.getImageData(0, 0, 1, 1).data[3] / 255 : 0;
    return { overflow: css.overflowY, clientWidth: element.clientWidth, clientHeight: element.clientHeight,
      scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop,
      width: css.scrollbarWidth, color: css.scrollbarColor,
      gutter: element.offsetWidth - element.clientWidth - parseFloat(css.borderLeftWidth) - parseFloat(css.borderRightWidth),
      scrollbar: part('::-webkit-scrollbar'), button: part('::-webkit-scrollbar-button'),
      thumb, track: part('::-webkit-scrollbar-track') };
  });
  samples.push({ context, scrollbars: stats });
  assert(['auto', 'scroll'].includes(stats.overflow), `${context}: the viewport retains vertical scrolling`);
  if (hidden) {
    assert.equal(stats.width, 'none', `${context}: the style menu keeps its hidden standard scrollbar`);
    assert.equal(stats.scrollbar.display, 'none', `${context}: the style menu keeps its hidden WebKit scrollbar`);
    assert.equal(stats.scrollbar.width, '0px', `${context}: the hidden scrollbar occupies no width`);
  } else {
    assert.equal(stats.width, 'auto', `${context}: standard scrollbar width must allow WebKit styling`);
    assert.equal(stats.color, 'auto', `${context}: standard scrollbar color must allow WebKit styling`);
    assert.equal(stats.button.display, 'none', `${context}: scrollbar arrow buttons are hidden`);
    assert.equal(stats.button.width, '0px', `${context}: scrollbar arrow buttons occupy no width`);
    assert.equal(stats.button.height, '0px', `${context}: scrollbar arrow buttons occupy no height`);
    assert.notEqual(stats.scrollbar.display, 'none', `${context}: the scrollbar remains visible`);
    assert.equal(stats.scrollbar.width, '7px', `${context}: the visible scrollbar retains its width`);
    assert.notEqual(stats.thumb.display, 'none', `${context}: the scrollbar thumb remains available`);
    assert(stats.thumb.alpha > 0, `${context}: the scrollbar thumb retains a visible fill`);
    assert.equal(stats.thumb.radius, '99px', `${context}: the scrollbar thumb retains its rounded shape`);
    assert.equal(stats.thumb.border, '2px', `${context}: the scrollbar thumb retains its transparent inset`);
    assert.equal(stats.thumb.clip, 'padding-box', `${context}: the scrollbar thumb paints inside its inset`);
    assert.notEqual(stats.track.display, 'none', `${context}: the scrollbar track remains available`);
  }
  if (!scroll) return stats;
  assert(stats.scrollHeight > stats.clientHeight, `${context}: the wheel check requires overflowing content`);
  const bounds = await locator.boundingBox();
  assert(bounds && bounds.width > 0 && bounds.height > 0, `${context}: the scroll viewport is reachable`);
  const element = await locator.elementHandle();
  assert(element, `${context}: the scroll viewport remains attached`);
  try {
    // Re-enter the resized window before wheel input, and start at the top so an initially selected last row can still scroll.
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await element.evaluate(element => { element.scrollTop = 0; });
    await page.waitForFunction(element => element.scrollTop === 0, element, { timeout: 5000 });
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    await page.mouse.wheel(0, Math.min(400, stats.scrollHeight - stats.clientHeight));
    await page.waitForFunction(element => element.scrollTop > 0, element, { timeout: 5000 });
    stats.wheel = { before: 0, after: await element.evaluate(element => element.scrollTop) };
  } finally {
    try { await element.evaluate((element, top) => { if (element.isConnected) element.scrollTop = top; }, stats.scrollTop); }
    finally { await element.dispose(); await page.mouse.move(15, 110); }
  }
  return stats;
}
