import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { PNG } from 'pngjs';
import { emitVisual, visualFrame } from './desktop-visual-fixture.mjs';

// test/secondary-contrast-fixture.mjs — compare actual foreground and backdrop PNG pixels under extreme desktop backgrounds.
const colorsUrl = new URL('../src/utils/themeColorMath.ts', import.meta.url).href;
const colorLoader = registerHooks({ resolve(specifier, context, next) {
  return next(context.parentURL === colorsUrl && specifier === '../components/visualizer/colorMix'
    ? new URL('../src/components/visualizer/colorMix.ts', import.meta.url).href : specifier, context);
} });
let getContrastRatio;
try { ({ getContrastRatio } = await import(colorsUrl)); } finally { colorLoader.deregister(); }
const rgb = pixel => `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;

// Hide only glyph paint for a second real screenshot; backgrounds, selected fills, layout and blur remain unchanged.
async function textContrast(page, entries, context, output, samples) {
  const metadata = [];
  for (const [locator, role] of entries) {
    const value = await locator.evaluate(element => {
      const style = getComputedStyle(element), root = document.querySelector('.desktop-lyrics'), theme = getComputedStyle(root);
      const range = document.createRange(); range.selectNodeContents(element);
      const lines = Array.from(range.getClientRects(), bounds => bounds.toJSON()).filter(bounds => bounds.width > 1 && bounds.height > 0);
      return { bounds: element.getBoundingClientRect().toJSON(), lines, text: element.textContent.trim(), color: style.color,
        theme: { cover: root.classList.contains('cover-theme'), base: theme.getPropertyValue('--desktop-glass-base').trim(),
          text: style.getPropertyValue('--glass-text').trim(), muted: style.getPropertyValue('--glass-muted').trim() },
        opacity: style.opacity, previousColor: element.style.getPropertyValue('color'), colorPriority: element.style.getPropertyPriority('color'),
        previousShadow: element.style.getPropertyValue('text-shadow'), shadowPriority: element.style.getPropertyPriority('text-shadow') };
    });
    assert(value.bounds.width > 0 && value.bounds.height > 0, `${context}/${role}: real text has a visible rectangle`);
    metadata.push({ locator, role, ...value });
  }
  const before = PNG.sync.read(await page.screenshot({ path: `${output}/secondary-readable-${context}.png` }));
  let background;
  try {
    for (const { locator } of metadata) await locator.evaluate(element => {
      element.style.setProperty('color', 'transparent', 'important'); element.style.setProperty('text-shadow', 'none', 'important');
    });
    await visualFrame(page); background = PNG.sync.read(await page.screenshot({ path: `${output}/secondary-backdrop-${context}.png` }));
  } finally {
    for (const value of metadata) await value.locator.evaluate((element, previous) => {
      for (const [property, value, priority] of [['color', previous.previousColor, previous.colorPriority],
        ['text-shadow', previous.previousShadow, previous.shadowPriority]]) {
        if (value) element.style.setProperty(property, value, priority); else element.style.removeProperty(property);
      }
    }, { previousColor: value.previousColor, colorPriority: value.colorPriority,
      previousShadow: value.previousShadow, shadowPriority: value.shadowPriority });
  }
  assert.equal(before.width, background.width); assert.equal(before.height, background.height);
  for (const { role, bounds, lines, text, color, opacity, theme } of metadata) {
    const changed = [];
    for (let y = Math.max(0, Math.ceil(bounds.top)); y < Math.min(before.height, Math.floor(bounds.bottom)); y++) {
      for (let x = Math.max(0, Math.ceil(bounds.left)); x < Math.min(before.width, Math.floor(bounds.right)); x++) {
        const offset = (y * before.width + x) * 4, foreground = [...before.data.subarray(offset, offset + 3)], backdrop = [...background.data.subarray(offset, offset + 3)];
        if (Math.max(...foreground.map((value, index) => Math.abs(value - backdrop[index]))) < 24) continue;
        changed.push({ x, y, foreground, backdrop, ratio: getContrastRatio(rgb(foreground), rgb(backdrop)) });
      }
    }
    assert(changed.length >= 12, `${context}/${role}: the screenshots contain real glyph ink`);
    changed.sort((a, b) => a.ratio - b.ratio);
    // Antialiasing blends edge pixels with the backdrop; use the opaque stroke cores, not nearly transparent edges.
    const core = changed[Math.floor((changed.length - 1) * .95)];
    const lineCores = lines.map((bounds, index) => {
      const pixels = changed.filter(pixel => pixel.x >= Math.ceil(bounds.left) && pixel.x < Math.floor(bounds.right)
        && pixel.y >= Math.ceil(bounds.top) && pixel.y < Math.floor(bounds.bottom));
      assert(pixels.length >= 4, `${context}/${role}/line-${index}: the line contains real glyph ink`);
      return { bounds, glyphPixels: pixels.length, core: pixels[Math.floor((pixels.length - 1) * .95)] };
    });
    assert(lineCores.length > 0, `${context}/${role}: real text lines are present`);
    const sample = { context: `contrast-${context}-${role}`, text, color, opacity, theme, glyphPixels: changed.length,
      median: changed[Math.floor(changed.length / 2)].ratio, coreRatio: core.ratio, core, lines: lineCores,
      minLineCoreRatio: Math.min(...lineCores.map(line => line.core.ratio)) };
    samples.push(sample);
    assert(core.ratio >= 4.5, `${context}/${role}: actual glyph/background contrast must reach 4.5: ${JSON.stringify(sample)}`);
    assert(sample.minLineCoreRatio >= 4.5, `${context}/${role}: every real text line must reach 4.5 core contrast: ${JSON.stringify(sample)}`);
  }
}

// Exercise the production transparent-background path over actual white and black document paint.
export async function secondaryStrongBackground(page, entries, context, output, samples) {
  const saved = await page.evaluate(() => {
    const style = document.documentElement.style, root = document.querySelector('.desktop-lyrics');
    return { color: style.getPropertyValue('background-color'), colorPriority: style.getPropertyPriority('background-color'),
      image: style.getPropertyValue('background-image'), imagePriority: style.getPropertyPriority('background-image'),
      appearance: { acrylic: root.classList.contains('native-acrylic'), transparent: root.classList.contains('transparent-background'),
        solid: root.classList.contains('solid-surfaces'), highContrast: root.classList.contains('high-contrast') } };
  });
  try {
    await emitVisual(page, 'appearance', { acrylic: false, transparent: true, solid: false, highContrast: false });
    await page.waitForFunction(() => document.querySelector('.desktop-lyrics.transparent-background') && !document.querySelector('.acrylic-backdrop'));
    for (const [name, color] of [['white', '#ffffff'], ['black', '#000000']]) {
      await page.evaluate(color => {
        document.documentElement.style.setProperty('background-color', color, 'important');
        document.documentElement.style.setProperty('background-image', 'none', 'important');
      }, color);
      await visualFrame(page);
      const paint = await page.evaluate(() => { const style = getComputedStyle(document.documentElement);
        return { color: style.backgroundColor, image: style.backgroundImage }; });
      assert.equal(paint.color, name === 'white' ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)'); assert.equal(paint.image, 'none');
      await textContrast(page, entries, `${context}-${name}`, output, samples);
    }
  } finally {
    await page.evaluate(saved => {
      const style = document.documentElement.style;
      for (const [property, value, priority] of [['background-color', saved.color, saved.colorPriority],
        ['background-image', saved.image, saved.imagePriority]]) {
        if (value) style.setProperty(property, value, priority); else style.removeProperty(property);
      }
    }, saved);
    await emitVisual(page, 'appearance', saved.appearance); await visualFrame(page);
  }
}
