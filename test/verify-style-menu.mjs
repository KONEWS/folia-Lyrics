import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { selectDesktopOption } from './desktop-select.mjs';

// test/verify-style-menu.mjs — real pointer evidence for the fullscreen style menu and whole capsule.
const menuName = '歌词样式';
const emit = (page, type, data) => page.evaluate(({ type, data }) => window.__foliaEmit(type, data), { type, data });
const frame = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const menu = page => page.locator('.desktop-top-menu');
const trigger = (page, includeHidden = false) => page.getByRole('combobox', { name: menuName, exact: true, includeHidden });
const settle = page => page.waitForFunction(() => {
  const element = document.querySelector('.desktop-top-menu');
  const capsule = document.querySelector('.topbar-mode-picker');
  return element && capsule && getComputedStyle(element).opacity === '1'
    && Math.abs(element.getBoundingClientRect().width - capsule.getBoundingClientRect().width) <= 0.75;
});
const state = page => page.evaluate(() => ({ rootClass: document.querySelector('.desktop-lyrics')?.className,
  expanded: document.querySelector('[role="combobox"][aria-label="歌词样式"]')?.getAttribute('aria-expanded'),
  menuCount: document.querySelectorAll('.desktop-top-menu').length, active: document.activeElement?.outerHTML.slice(0, 600) }));

// Compare the displayed schematics with the original mode glyph source instead of copying its shapes into the fixture.
async function originalGlyphShapes() {
  const source = await readFile(new URL('../src/components/visualizer/modeGlyphs.tsx', import.meta.url), 'utf8');
  const definitions = source.split('const VISUALIZER_MODE_GLYPHS:')[1]?.split('const BACKGROUND_MODE_GLYPHS:')[0];
  assert(definitions, 'the original visualizer glyph table must remain available');
  return Object.fromEntries([...definitions.matchAll(/^\s{4}(\w+): \(([\s\S]*?)\n    \),/gm)].map(([, mode, fragment]) => [mode,
    [...fragment.matchAll(/<(path|circle|ellipse|rect)\b([^>]*?)\s*\/>/g)].map(([, tag, attributes]) => ({ tag,
      attributes: Object.fromEntries([...attributes.matchAll(/(\w+)="([^"]*)"/g)]
        .map(([, name, value]) => [name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`), value])) }))]));
}

// Keep the old build's failure as evidence instead of changing production behavior for the reproduction.
export async function reproduceStyleMenu(page, song, output) {
  await emit(page, 'windowState', { fullscreen: false, maximized: false, clickThrough: false });
  await emit(page, 'restore', {});
  await page.evaluate(() => window.__foliaSetMockPreferences({ autoImmersive: false, immersiveDelay: 30 }));
  await selectDesktopOption(page, menuName, { value: 'classic' });
  await emit(page, 'windowState', { fullscreen: true, maximized: false, clickThrough: false });
  await trigger(page).click(); await settle(page);
  const before = await state(page), option = await menu(page).getByRole('option').first().boundingBox();
  assert.equal(before.expanded, 'true'); assert(option);
  await page.screenshot({ path: `${output}/style-menu-baseline-open.png` });
  await page.mouse.move(option.x + option.width / 2, option.y + option.height / 2);
  await page.waitForFunction(() => document.querySelector('[role="combobox"][aria-label="歌词样式"]')?.getAttribute('aria-expanded') === 'false');
  await menu(page).waitFor({ state: 'detached' });
  const after = await state(page);
  await page.screenshot({ path: `${output}/style-menu-baseline-pointer-closed.png` });
  await writeFile(`${output}/style-menu-baseline-results.json`, JSON.stringify({ before, after, pointer: option,
    reproduced: before.expanded === 'true' && after.expanded === 'false' && after.menuCount === 0 }, null, 2));
  console.log('PASS baseline reproduces fullscreen style menu closing when real pointer enters its first option');
  return ['normal fullscreen style menu closes on real pointer movement into its first option'];
}

// Exercise actual pointer paths, wheel scrolling and keyboard selection before any virtual-clock suite.
export async function verifyStyleMenu(page, song, output) {
  const checks = [], samples = [], viewport = page.viewportSize();
  const glyphShapes = await originalGlyphShapes();
  const saved = await page.evaluate(() => ({ prefs: window.__foliaMockPreferences(),
    mode: localStorage.getItem('folia.desktop.mode.v1'), appearance: {
      acrylic: document.querySelector('.desktop-lyrics').classList.contains('native-acrylic'),
      transparent: document.querySelector('.desktop-lyrics').classList.contains('transparent-background'),
      solid: document.querySelector('.desktop-lyrics').classList.contains('solid-surfaces'),
      highContrast: document.querySelector('.desktop-lyrics').classList.contains('high-contrast') } }));
  const prefs = values => page.evaluate(values => window.__foliaSetMockPreferences(values), values);
  const windowState = (fullscreen = false, maximized = false, clickThrough = false) => emit(page, 'windowState', { fullscreen, maximized, clickThrough });
  const close = async () => { if (await menu(page).count()) { await page.keyboard.press('Escape'); await menu(page).waitFor({ state: 'detached' }); } };
  const open = async () => { await trigger(page).click(); await settle(page); return menu(page); };
  const counts = () => page.evaluate(() => ({ volume: window.__foliaCommands.filter(command => command.type === 'systemVolume').length,
    fullscreen: window.__foliaCommands.filter(command => command.type === 'exitFullscreen').length }));
  const record = async context => { const sample = { context, ...await state(page) }; samples.push(sample); return sample; };
  const retained = async context => {
    const sample = await record(context); assert.equal(sample.expanded, 'true', `${context}: the pointer must not blur the open selector`);
    assert.equal(sample.menuCount, 1); assert(await menu(page).isVisible());
  };
  // Use small pointer steps through the anchor/menu gap so the intervening hit targets are tested too.
  const enterMenu = async context => {
    const start = await trigger(page).boundingBox(), option = await menu(page).getByRole('option').first().boundingBox(); assert(start && option);
    const x = start.x + start.width / 2, from = start.y + start.height / 2, to = option.y + option.height / 2;
    for (let step = 0; step <= 16; step++) { await page.mouse.move(x, from + (to - from) * step / 16); await frame(page); await retained(`${context}-step-${step}`); }
  };
  const bounds = async context => {
    await settle(page);
    const sample = await page.evaluate(() => {
      const capsule = document.querySelector('.topbar-mode-picker').getBoundingClientRect(), element = document.querySelector('.desktop-top-menu');
      const scroll = element.querySelector('.custom-select-options-scroll[role="listbox"]');
      return { capsule: capsule.toJSON(), menu: element.getBoundingClientRect().toJSON(), width: innerWidth, height: innerHeight,
        count: scroll.querySelectorAll('[role="option"]').length, scrollHeight: scroll.scrollHeight, clientHeight: scroll.clientHeight,
        scrollbar: getComputedStyle(scroll).scrollbarWidth, webkitScrollbar: getComputedStyle(scroll, '::-webkit-scrollbar').display,
        overflow: getComputedStyle(scroll).overflowY, groupRole: element.getAttribute('role'), footerCount: element.querySelectorAll('[data-custom-select-footer]').length };
    });
    const expectedWidth = Math.min(sample.capsule.width, sample.width - 16), expectedLeft = Math.max(8, Math.min(sample.capsule.left, sample.width - expectedWidth - 8));
    assert(Math.abs(sample.menu.width - expectedWidth) <= 0.75 && Math.abs(sample.menu.left - expectedLeft) <= 0.75, `${context}: both menu edges follow the whole capsule`);
    assert(sample.menu.top >= 7.5 && sample.menu.bottom <= sample.height - 7.5, `${context}: menu stays within the viewport`);
    assert.equal(sample.count, 13); assert.equal(sample.groupRole, 'group'); assert.equal(sample.footerCount, 1);
    assert.equal(sample.scrollbar, 'none'); assert.equal(sample.webkitScrollbar, 'none');
    assert(['auto', 'scroll'].includes(sample.overflow)); assert(sample.scrollHeight > sample.clientHeight);
    samples.push({ context, geometry: sample });
  };
  // Inspect every row, including those below the scroll viewport, so both shape identity and column alignment are covered.
  const icons = async context => {
    const rows = await menu(page).getByRole('option').evaluateAll(elements => elements.map(element => {
      const icon = element.querySelector('.custom-select-option-icon'), svg = icon?.querySelector('svg');
      const label = element.querySelector('.custom-select-option-label'), selectedIndicator = element.querySelector(':scope > svg.lucide-check');
      return { value: element.getAttribute('data-value'), text: element.textContent.trim(), optionRole: element.getAttribute('role'),
        selected: element.getAttribute('aria-selected') === 'true', selectedIndicatorColor: selectedIndicator ? getComputedStyle(selectedIndicator).color : null,
        iconCount: element.querySelectorAll('.custom-select-option-icon svg').length, labelCount: element.querySelectorAll('.custom-select-option-label').length,
        wrapperHidden: icon?.getAttribute('aria-hidden'), hidden: svg?.getAttribute('aria-hidden'), focusable: svg?.getAttribute('focusable'),
        viewBox: svg?.getAttribute('viewBox'), fill: svg?.getAttribute('fill'), stroke: svg?.getAttribute('stroke'),
        color: getComputedStyle(element).color, renderedStroke: svg ? getComputedStyle(svg).stroke : null,
        icon: icon?.getBoundingClientRect().toJSON(), svg: svg?.getBoundingClientRect().toJSON(), label: label?.getBoundingClientRect().toJSON(),
        labelScrollWidth: label?.scrollWidth, labelClientWidth: label?.clientWidth,
        focusTargets: element.querySelectorAll('button, input, [tabindex]').length,
        shapes: svg ? [...svg.children].map(child => ({ tag: child.tagName.toLowerCase(),
          attributes: Object.fromEntries([...child.attributes].map(attribute => [attribute.name, attribute.value])) })) : [] };
    }));
    assert.equal(rows.length, 13); assert.equal(rows.some(row => row.value === 'still'), false);
    for (const row of rows) {
      assert.equal(row.iconCount, 1, `${context}/${row.value}: exactly one original schematic`); assert.equal(row.labelCount, 1);
      assert(glyphShapes[row.value]?.length, `${row.value}: original source has actual drawing commands`);
      assert.deepEqual(row.shapes, glyphShapes[row.value], `${context}/${row.value}: drawn paths must match the original player`);
      assert.equal(row.wrapperHidden, 'true'); assert.equal(row.hidden, 'true'); assert.equal(row.focusable, 'false'); assert.equal(row.focusTargets, 0);
      assert.equal(row.viewBox, '0 0 24 24'); assert.equal(row.fill, 'none'); assert.equal(row.stroke, 'currentColor');
      if (row.selected) assert(row.selectedIndicatorColor, `${context}/${row.value}: selected option retains its original indicator`);
      assert.equal(row.renderedStroke, row.selected ? row.selectedIndicatorColor : row.color,
        `${context}/${row.value}: schematic follows the existing selected accent or ordinary glass text color`);
      for (const rectangle of [row.icon, row.svg]) {
        assert(Math.abs(rectangle.width - 16) <= 0.75 && Math.abs(rectangle.height - 16) <= 0.75, `${context}/${row.value}: fixed 16px schematic`);
      }
      assert(Math.abs(row.icon.left - rows[0].icon.left) <= 0.75 && Math.abs(row.label.left - rows[0].label.left) <= 0.75,
        `${context}/${row.value}: every schematic and label must occupy the same columns`);
      assert(Math.abs(row.label.left - row.icon.right - 8) <= 0.75, `${context}/${row.value}: text remains separated from its schematic`);
      assert(row.labelScrollWidth <= row.labelClientWidth,
        `${context}/${row.value}: the complete style name must remain readable, including the selected row`);
    }
    samples.push({ context, glyphs: rows });
  };
  try {
    await windowState(); await emit(page, 'restore', {});
    if (await page.locator('.control-panel').count()) await page.locator('.desktop-topbar [data-settings-trigger]').click();
    await prefs({ autoImmersive: false, immersiveDelay: 30, bottomHoverControls: true });
    await emit(page, 'session', { ...song, playing: false, position: 36 });
    await emit(page, 'lyrics', { key: song.key, title: song.title, artist: song.artist, cover: '', format: 'lrc', embedded: false,
      content: '[00:01.00]保留原版渲染\n[00:33.00]完整胶囊与下拉菜单\n[01:30.00]下一行歌词', source: '样式菜单验证' });
    await page.locator('.waiting-screen').waitFor({ state: 'detached' });
    await selectDesktopOption(page, menuName, { value: 'classic' });
    await page.setViewportSize({ width: 1280, height: 800 });
    assert.equal(await page.locator('.topbar-mode-picker button').count(), 1);
    const capsule = page.locator('.topbar-mode-picker');
    const labelCleanup = await trigger(page).evaluate(button => ({ text: button.textContent.trim(), name: button.querySelector(':scope > span.truncate')?.textContent.trim(),
      role: button.getAttribute('role'), ariaLabel: button.getAttribute('aria-label'), title: button.closest('.topbar-mode-picker')?.getAttribute('title'),
      sparkles: button.querySelectorAll('.custom-select-prefix .lucide-sparkles').length, arrows: button.querySelectorAll(':scope > svg').length,
      oldLabels: button.querySelectorAll('.topbar-style-label').length }));
    assert.equal(labelCleanup.text.includes('样式'), false); assert.equal(labelCleanup.oldLabels, 0);
    assert.equal(labelCleanup.text, '流光'); assert.equal(labelCleanup.name, '流光');
    assert.equal(labelCleanup.role, 'combobox'); assert.equal(labelCleanup.ariaLabel, menuName); assert.equal(labelCleanup.title, menuName);
    assert.equal(labelCleanup.sparkles, 1); assert.equal(labelCleanup.arrows, 1); samples.push({ context: 'label-cleanup', ...labelCleanup });
    for (const part of ['.custom-select-prefix svg', ':scope > span.truncate', ':scope > svg']) {
      const point = await trigger(page).locator(part).boundingBox(); assert(point, `${part}: visible capsule content`);
      const x = point.x + point.width / 2, y = point.y + point.height / 2;
      assert(await trigger(page).evaluate((button, { x, y }) => document.elementFromPoint(x, y)?.closest('button') === button, { x, y }), `${part}: hit belongs to the one semantic button`);
      await page.mouse.click(x, y); await settle(page); assert.equal(await trigger(page).getAttribute('aria-expanded'), 'true');
      await page.mouse.click(x, y); await menu(page).waitFor({ state: 'detached' });
    }
    const edge = await capsule.boundingBox(); assert(edge);
    const paddingPoint = { x: edge.x + 3, y: edge.y + edge.height / 2 };
    assert(await trigger(page).evaluate((button, p) => document.elementFromPoint(p.x, p.y)?.closest('button') === button, paddingPoint));
    await page.mouse.click(paddingPoint.x, paddingPoint.y); await settle(page); await close();
    await page.screenshot({ path: `${output}/style-capsule-label-cleanup.png` });
    checks.push('no redundant style text; Sparkles, current name, chevron and outer padding open one semantic capsule with its accessible label and title intact');

    await open(); await icons('1280x800-original-icons'); await close();
    checks.push('all thirteen decorative 16px schematics match the original player SVG paths, preserve selected accent and ordinary glass text colors and share aligned icon and label columns');
    for (const [value, name] of [['sonnet', '商籁'], ['lumiere', '绘光'], ['diorama', '镜台']]) {
      await open(); const option = menu(page).getByRole('option', { name, exact: true });
      assert.equal(await option.getAttribute('data-value'), value);
      await option.locator('.custom-select-option-icon svg').click(); await menu(page).waitFor({ state: 'detached' });
      assert.equal(await trigger(page).getAttribute('data-value'), value);
      assert.equal(await page.evaluate(() => localStorage.getItem('folia.desktop.mode.v1')), value);
      await open(); assert.equal(await menu(page).getByRole('option', { name, exact: true }).getAttribute('aria-selected'), 'true'); await close();
    }
    await selectDesktopOption(page, menuName, { value: 'classic' });
    checks.push('clicking the actual 商籁, 绘光 and 镜台 schematic selects the intended mode, preserves its accessible name and persists the mocked selection');

    for (const [context, fullscreen, maximized] of [['window', false, false], ['maximized', false, true], ['fullscreen', true, false]]) {
      await windowState(fullscreen, maximized); await open(); await enterMenu(context); await bounds(context);
      await page.mouse.move(400, 400, { steps: 8 }); await frame(page); await retained(`${context}-pointer-away`);
      await page.screenshot({ path: `${output}/style-menu-${context}.png` });
      await page.mouse.click(400, 400); await menu(page).waitFor({ state: 'detached' });
      checks.push(`${context}: normal-mode menu survives the real anchor/gap/option path and pointer departure until outside click`);
    }
    await windowState(true); await open(); const beforeEscape = await counts();
    await page.keyboard.press('Escape'); await menu(page).waitFor({ state: 'detached' });
    assert.equal((await counts()).fullscreen, beforeEscape.fullscreen, 'the first Escape dismisses the selector without exiting fullscreen');
    await page.keyboard.press('Escape'); await page.locator('.native-fullscreen').waitFor({ state: 'detached' });
    assert.equal((await counts()).fullscreen, beforeEscape.fullscreen + 1);
    checks.push('Escape closes the focused menu before a second Escape exits native fullscreen');

    await page.setViewportSize({ width: 450, height: 300 }); await open(); await bounds('450x300'); await icons('450x300-window-icons'); await enterMenu('450x300');
    const last = menu(page).getByRole('option').last(), lastValue = await last.getAttribute('data-value'), beforeWheel = await counts();
    const menuBox = await menu(page).boundingBox(); assert(menuBox);
    await page.mouse.move(menuBox.x + menuBox.width / 2, menuBox.y + menuBox.height / 2); await page.mouse.wheel(0, 1200);
    await page.waitForFunction(() => { const el = document.querySelector('.desktop-top-menu .custom-select-options-scroll'); return el && el.scrollTop > 0; });
    assert.equal((await counts()).volume, beforeWheel.volume, 'selector wheel scroll must not adjust system volume');
    await last.click(); await menu(page).waitFor({ state: 'detached' }); assert.equal(await trigger(page).getAttribute('data-value'), lastValue);
    await selectDesktopOption(page, menuName, { value: 'classic' }); await trigger(page).focus(); await page.keyboard.press('End'); await settle(page);
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-option-index') === '12');
    await page.keyboard.press('Enter'); await menu(page).waitFor({ state: 'detached' }); assert.equal(await trigger(page).getAttribute('data-value'), lastValue);
    await selectDesktopOption(page, menuName, { value: 'classic' }); await open(); await bounds('450x300-after-selection');
    await page.screenshot({ path: `${output}/style-menu-narrow.png` }); await close();
    checks.push('450x300 menu hides its scrollbar while wheel and End/Enter can select the thirteenth original style without changing system volume');

    await windowState(true); await open(); await bounds('450x300-fullscreen'); await icons('450x300-fullscreen-icons'); await enterMenu('450x300-fullscreen');
    await page.screenshot({ path: `${output}/style-icons-narrow-fullscreen.png` }); await close(); await windowState();
    checks.push('450x300 native fullscreen retains all original icon and label columns, whole-capsule alignment and hidden scrollbars while the actual pointer enters the menu');

    await page.getByRole('button', { name: '沉浸显示', exact: true }).click(); await page.mouse.move(225, 150); await page.mouse.move(225, 18);
    await page.locator('.immersive.top-controls-revealed').waitFor(); await open(); await enterMenu('450x300-immersive');
    assert.equal(await page.locator('.immersive.top-controls-revealed').count(), 1);
    await page.screenshot({ path: `${output}/style-menu-narrow-immersive.png` });
    await page.mouse.move(100, 180, { steps: 8 }); await menu(page).waitFor({ state: 'detached' });
    await page.waitForFunction(() => !document.querySelector('.desktop-lyrics').classList.contains('top-controls-revealed'));
    assert.equal(await page.locator('.immersive').count(), 1);
    checks.push('windowed immersion keeps the 450x300 capsule-to-menu gap reachable, and leaving the menu retracts the top controls');

    await emit(page, 'restore', {}); await page.setViewportSize({ width: 1280, height: 800 }); await windowState(true);
    await emit(page, 'appearance', { transparent: true, acrylic: false, solid: false, highContrast: false }); await open(); await enterMenu('transparent-fullscreen');
    assert.equal(await page.locator('.transparent-background').count(), 1); await close(); await open();
    await windowState(true, false, true); await menu(page).waitFor({ state: 'detached' });
    assert.equal(await trigger(page, true).getAttribute('aria-expanded'), 'false');
    await windowState(); await emit(page, 'restore', {});
    checks.push('transparent fullscreen retains the menu and click-through activation clears its focus and popup');
    await prefs({ autoImmersive: true, immersiveDelay: 1 }); await open();
    await page.locator('.immersive.cursor-idle').waitFor({ timeout: 7000 }); await menu(page).waitFor({ state: 'detached' });
    assert.equal(await trigger(page, true).getAttribute('aria-expanded'), 'false');
    checks.push('the actual idle deadline clears an open popup and enters immersion without a fake browser clock');
    await writeFile(`${output}/style-menu-results.json`, JSON.stringify({ checks, samples }, null, 2));
    console.log('PASS whole capsule / real fullscreen pointer / hidden-scrollbar style menu checks'); return checks;
  } catch (error) {
    await writeFile(`${output}/style-menu-primary-failure.json`, JSON.stringify({ error: String(error), ...await state(page) }, null, 2));
    await page.screenshot({ path: `${output}/style-menu-primary-failure.png` }); throw error;
  } finally {
    await windowState(); await emit(page, 'restore', {}); await prefs(saved.prefs); await emit(page, 'appearance', saved.appearance);
    await page.setViewportSize(viewport);
    if (saved.mode && await trigger(page).getAttribute('data-value') !== saved.mode) await selectDesktopOption(page, menuName, { value: saved.mode });
  }
}
