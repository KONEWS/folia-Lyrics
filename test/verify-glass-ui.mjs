import assert from 'node:assert/strict';
import { desktopSelect, openDesktopMenu, readDesktopOptions, selectDesktopOption } from './desktop-select.mjs';
import { verifyClosePreference } from './verify-close-preference.mjs';
import { verifyStyleCapsule } from './verify-style-capsule.mjs';

// test/verify-glass-ui.mjs — unified desktop glass, nested selectors, focus, themes and small-window behavior.
export async function verifyGlassUi(page, song, output) {
  const checks = [];
  const emit = (type, data) => page.evaluate(({ type, data }) => window.__foliaEmit(type, data), { type, data });
  const openSettings = () => page.getByRole('button', { name: '打开歌词设置', exact: true }).click();
  const closeSettings = () => page.getByRole('button', { name: '关闭设置', exact: true }).click();
  const mode = desktopSelect(page, '歌词样式'), player = desktopSelect(page, '选择播放器');
  const style = (locator, property) => locator.evaluate((el, property) => getComputedStyle(el)[property], property);
  const fullscreenCommands = () => page.evaluate(() => window.__foliaCommands.filter(m => ['fullscreen', 'exitFullscreen'].includes(m.type)).length);
  const settle = name => page.waitForFunction(name => [...document.querySelectorAll('[role="listbox"]')].some(el =>
    el.getAttribute('aria-label') === name && getComputedStyle(el).opacity === '1'), name);
  const menuFor = async name => { const menu = await openDesktopMenu(page, name); await settle(name); return menu; };
  const dismiss = async menu => { await page.keyboard.press('Escape'); await menu.waitFor({ state: 'detached' }); };
  // Match both menu edges to the whole style capsule, allowing only viewport-edge clamping.
  const topbarAlignment = async (menu, context) => {
    const diagnostics = () => page.evaluate(() => {
      const picker = document.querySelector('.topbar-mode-picker'), menu = document.querySelector('.desktop-top-menu');
      const anchor = picker?.getBoundingClientRect(), bounds = menu?.getBoundingClientRect();
      const width = anchor && Math.min(anchor.width, innerWidth - 16);
      return { anchor: anchor?.toJSON(), bounds: bounds?.toJSON(),
        expected: anchor && { left: Math.max(8, Math.min(anchor.left, innerWidth - width - 8)), width },
        transform: menu && getComputedStyle(menu).transform, viewport: { width: innerWidth, height: innerHeight } };
    });
    try {
      await page.waitForFunction(() => {
        const picker = document.querySelector('.topbar-mode-picker'), menu = document.querySelector('.desktop-top-menu');
        if (!picker || !menu) return false;
        const anchor = picker.getBoundingClientRect(), bounds = menu.getBoundingClientRect();
        const width = Math.min(anchor.width, innerWidth - 16), left = Math.max(8, Math.min(anchor.left, innerWidth - width - 8));
        return getComputedStyle(menu).opacity === '1' && Math.abs(bounds.left - left) <= 0.75 && Math.abs(bounds.width - width) <= 0.75;
      }, undefined, { timeout: 5000 });
    } catch {
      assert.fail(`${context}: style menu must align with the complete capsule: ${JSON.stringify(await diagnostics())}`);
    }
    const actual = await menu.boundingBox(), { anchor, expected } = await diagnostics();
    assert(actual && anchor && Math.abs(actual.x - expected.left) <= 0.75 && Math.abs(actual.width - expected.width) <= 0.75
      && Math.abs(actual.x + actual.width - expected.left - expected.width) <= 0.75,
    `${context}: both style-menu edges must match the capsule: ${JSON.stringify(await diagnostics())}`);
  };
  // Check the actual rendered label, including the longest names, rather than only its accessible name.
  const readableModeLabel = async (expected, context, control = mode) => {
    const label = await control.evaluate(el => {
      const label = el.querySelector('span'), box = label?.getBoundingClientRect();
      return { text: label?.textContent?.trim(), width: label?.clientWidth, scrollWidth: label?.scrollWidth,
        bounds: box?.toJSON(), font: label && getComputedStyle(label).font };
    });
    assert.equal(label.text, expected, `${context}: the selected style name must remain complete`);
    const readable = label.bounds?.width > 0 && label.bounds?.height > 0 && label.scrollWidth <= label.width + 1;
    if (!readable) {
      const { width, height } = page.viewportSize(), value = await control.getAttribute('data-value');
      await page.screenshot({ path: `${output}/glass-label-failed-${width}x${height}-${value}.png` });
    }
    assert(readable,
      `${context}: the visible style name must not be clipped or replaced by ellipsis: ${JSON.stringify(label)}`);
  };
  // Wait for placement animation before checking the actual clipped viewport, rather than its initial scale.
  const containment = async (menu, width, height) => {
    const name = await menu.getAttribute('aria-label');
    const diagnostics = () => page.evaluate(name => {
      const el = [...document.querySelectorAll('[role="listbox"]')].find(el => el.getAttribute('aria-label') === name);
      if (!el) return { menuAbsent: true, rootClass: document.querySelector('.desktop-lyrics')?.className,
        focus: { tag: document.activeElement?.tagName, role: document.activeElement?.getAttribute('role'), name: document.activeElement?.getAttribute('aria-label') } };
      const box = el.getBoundingClientRect(), css = getComputedStyle(el);
      const trigger = [...document.querySelectorAll('[role="combobox"]')].find(trigger => trigger.getAttribute('aria-label') === el.getAttribute('aria-label'))?.getBoundingClientRect();
      return { bounds: { x: box.x, y: box.y, width: box.width, height: box.height }, trigger: trigger && { x: trigger.x, y: trigger.y, width: trigger.width, height: trigger.height },
        transform: css.transform, height: css.height, maxHeight: css.maxHeight, overflow: css.overflowY, font: css.font, viewport: { width: innerWidth, height: innerHeight } };
    }, name);
    const initial = await diagnostics();
    if (initial.menuAbsent || initial.bounds.x < 7.5 || initial.bounds.y < 7.5 || initial.bounds.x + initial.bounds.width > width - 7.5 || initial.bounds.y + initial.bounds.height > height - 7.5)
      console.log('WAIT menu placement after viewport change:', JSON.stringify(initial));
    // An existing menu is already opaque when resize schedules its next animation-frame measurement.
    try {
      await page.waitForFunction(({ name, width, height }) => {
        const menu = [...document.querySelectorAll('[role="listbox"]')].find(el => el.getAttribute('aria-label') === name);
        const box = menu?.getBoundingClientRect();
        return box && box.x >= 7.5 && box.y >= 7.5 && box.x + box.width <= width - 7.5 && box.y + box.height <= height - 7.5;
      }, { name, width, height }, { timeout: 5000 });
    } catch {
      const failure = await diagnostics();
      await page.screenshot({ path: `${output}/glass-menu-failed-${name === '歌词样式' ? 'style' : 'player'}-${width}x${height}.png` });
      assert.fail(`menu placement did not settle inside ${width}x${height}: ${JSON.stringify(failure)}`);
    }
    const bounds = await menu.boundingBox();
    assert(bounds && bounds.x >= 7.5 && bounds.y >= 7.5 && bounds.x + bounds.width <= width - 7.5
      && bounds.y + bounds.height <= height - 7.5, `menu must stay inside ${width}x${height} with a usable edge gutter: ${JSON.stringify(await diagnostics())}`);
    assert(await menu.evaluate(el => el.scrollHeight > el.clientHeight), 'long selector menus must scroll instead of overflowing');
    assert(await menu.evaluate(el => ['auto', 'scroll'].includes(getComputedStyle(el).overflowY)));
  };
  await emit('windowState', { maximized: false, fullscreen: false, clickThrough: false }); await emit('restore', {});
  await page.locator('.immersive').waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 1280, height: 800 });
  checks.push(...await verifyClosePreference(page, song, output));
  await openSettings();
  const automatic = page.getByRole('checkbox', { name: '闲置时自动进入沉浸模式', exact: true });
  const delay = page.getByRole('spinbutton', { name: '无操作等待时间', exact: true });
  const originalAutomatic = await automatic.isChecked(), originalDelay = await delay.inputValue();
  const originalSource = await player.getAttribute('data-value');
  const transparent = page.getByRole('checkbox', { name: '播放页面透明背景', exact: true });
  const originalTransparent = await transparent.isChecked();
  await automatic.uncheck(); await transparent.uncheck();
  await page.getByRole('checkbox', { name: '主题跟随歌曲封面', exact: true }).check();
  await closeSettings();
  await emit('appearance', { acrylic: false, solid: false, highContrast: false });
  const sources = [
    ...song.sources, { id: 'glass-salt', label: '椒盐音乐' },
    ...Array.from({ length: 7 }, (_, i) => ({ id: `glass-player-${i}`, label: `测试播放器 ${i + 1}` })),
    { id: 'glass-long', label: '播放器名称与歌曲来源较长时仍需保持菜单在窗口内'.repeat(8) },
  ];
  const setCover = async color => {
    const cover = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="${color}"/></svg>`)}`;
    const previous = await page.locator('.desktop-lyrics').evaluate(el => el.style.getPropertyValue('--cover-background'));
    await emit('session', { ...song, sources, cover });
    await page.waitForFunction(previous => {
      const root = document.querySelector('.desktop-lyrics');
      return root?.classList.contains('cover-theme') && root.style.getPropertyValue('--cover-background') !== previous;
    }, previous);
  };
  await selectDesktopOption(page, '歌词样式', { label: 'Luminous' });
  const choices = await readDesktopOptions(page, '歌词样式');
  assert.equal(choices.length, 13); assert(!choices.some(choice => choice.value === 'still'));
  assert.equal(await page.locator('.topbar-mode-picker select, .control-panel select').count(), 0);
  await setCover('#dc5432');
  let menu = await menuFor('歌词样式');
  await topbarAlignment(menu, '1280x800 window');
  assert(await menu.evaluate(el => el.classList.contains('desktop-glass-menu') && el.classList.contains('desktop-top-menu')));
  assert(await menu.evaluate(el => Boolean(el.closest('main.desktop-lyrics'))), 'nested menus must inherit the active cover theme');
  assert.equal(await mode.getAttribute('aria-haspopup'), 'listbox');
  assert.equal(await mode.getAttribute('aria-controls'), await menu.getAttribute('id'));
  const selected = menu.locator('[role="option"][aria-selected="true"]');
  assert.equal(await selected.count(), 1); assert.equal(await selected.getAttribute('data-value'), 'classic');
  assert.notEqual(await style(selected, 'backgroundColor'), await style(menu.locator('[role="option"][aria-selected="false"]').first(), 'backgroundColor'));
  assert(await selected.locator('svg').isVisible(), 'chosen items retain a visible check indicator');
  assert.equal(await style(menu, 'color'), await style(page.locator('.track-caption strong'), 'color'));
  const red = await style(menu, 'backgroundColor');
  await page.screenshot({ path: `${output}/glass-menu-red.png` });
  await dismiss(menu);
  await setCover('#246edc'); menu = await menuFor('歌词样式');
  await topbarAlignment(menu, '1280x800 next-cover window');
  assert.notEqual(await style(menu, 'backgroundColor'), red, 'portaled menus must change color with the next cover');
  await page.screenshot({ path: `${output}/glass-menu-blue.png` }); await dismiss(menu);
  checks.push('desktop selectors expose 13 dynamic styles through accessible themed listboxes', 'nested menus inherit each cover theme and preserve selected-item indication');
  checks.push(...await verifyStyleCapsule(page, output));

  await openSettings();
  const panel = page.locator('.control-panel');
  const controls = [page.getByRole('button', { name: '最小化窗口', exact: true }), page.getByRole('button', { name: '沉浸显示', exact: true }),
    page.getByRole('button', { name: '关闭设置', exact: true })];
  const fills = await Promise.all(controls.map(control => style(control, 'backgroundImage')));
  assert(fills.every(fill => fill !== 'none' && fill === fills[0]), 'caption, topbar and settings controls share the same glass material');
  const transport = page.getByRole('button', { name: '下一首', exact: true });
  assert.equal(await style(transport, 'color'), await style(controls[0], 'color'), 'reference playback icons share the current theme foreground');
  assert.equal(await style(transport, 'backgroundImage'), 'none');
  assert.equal(await style(transport, 'backgroundColor'), 'rgba(0, 0, 0, 0)', 'playback icons remain transparent inside the glass bar');
  assert.notEqual(await transport.evaluate(el => getComputedStyle(el, '::before').backgroundImage), 'none');
  await transport.hover();
  await page.waitForFunction(() => document.querySelector('.transport-buttons button:last-child')?.style.getPropertyValue('--light-opacity') === '1');
  assert.notEqual(await style(transport, 'backgroundColor'), 'rgba(0, 0, 0, 0)', 'the transparent playback icon retains its hover highlight');
  await page.mouse.move(450, 400);
  menu = await menuFor('选择播放器');
  assert.equal(await style(menu, 'backgroundColor'), await style(panel, 'backgroundColor'));
  const blurs = await Promise.all([menu, panel, page.locator('.desktop-topbar'), page.locator('.desktop-statusbar')].map(surface => style(surface, 'backdropFilter')));
  assert(blurs.every(blur => blur !== 'none' && blur === blurs[0]), 'all glass surfaces and second-level menus use the same backdrop treatment');
  await dismiss(menu);
  await selectDesktopOption(page, '选择播放器', { label: '椒盐音乐' });
  assert.equal(await player.getAttribute('data-value'), 'glass-salt');
  assert.equal(await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'source').at(-1).value), 'glass-salt');
  await player.scrollIntoViewIfNeeded();
  menu = await menuFor('选择播放器');
  assert.equal(await menu.locator('[aria-selected="true"]').getAttribute('data-value'), 'glass-salt');
  const beforeTrigger = await player.boundingBox(), beforeMenu = await menu.boundingBox();
  await panel.evaluate(el => { el.scrollTop += el.scrollTop > 20 ? -12 : 12; });
  await page.waitForFunction(({ beforeTrigger, beforeMenu }) => {
    const trigger = document.querySelector('[role="combobox"][aria-label="选择播放器"]')?.getBoundingClientRect();
    const menu = document.querySelector('[role="listbox"][aria-label="选择播放器"]')?.getBoundingClientRect();
    return trigger && menu && Math.abs(trigger.y - beforeTrigger.y) > 1
      && Math.abs((trigger.y - beforeTrigger.y) - (menu.y - beforeMenu.y)) < 2;
  }, { beforeTrigger, beforeMenu });
  await panel.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await menu.waitFor({ state: 'detached' });
  await player.scrollIntoViewIfNeeded(); await selectDesktopOption(page, '选择播放器', { value: originalSource });
  await closeSettings();
  checks.push('utility controls and nested menus share glass while transparent playback icons retain themed highlights', 'player selection sends native preferences and selected state follows the reply', 'settings scroll repositions the menu and closes it when its trigger is clipped');

  await mode.focus(); await page.keyboard.press('ArrowDown');
  menu = page.getByRole('listbox', { name: '歌词样式', exact: true }); await menu.waitFor();
  await page.keyboard.press('End');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-value')), choices.at(-1).value);
  await page.keyboard.press('Home');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-value')), choices[0].value);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-value')), choices[0].value);
  for (let i = 0; i < choices.findIndex(choice => choice.value === 'classic'); i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter'); await menu.waitFor({ state: 'detached' });
  assert.equal(await mode.getAttribute('data-value'), 'classic'); assert(await mode.evaluate(el => el === document.activeElement));
  menu = await menuFor('歌词样式'); await page.keyboard.press('Tab'); await menu.waitFor({ state: 'detached' });
  assert(await mode.evaluate(el => el !== document.activeElement), 'Tab closes the dropdown and continues normal focus navigation');
  menu = await menuFor('歌词样式'); await page.mouse.click(450, 400); await menu.waitFor({ state: 'detached' });
  assert.equal(await mode.getAttribute('aria-expanded'), 'false');
  checks.push('arrow keys, Home, End and Enter navigate and select with focus restoration', 'Tab moves focus and an outside click dismisses the menu');

  const currentCover = await page.getByRole('img', { name: '专辑封面', exact: true }).getAttribute('src');
  const virtualSources = [...song.sources, ...Array.from({ length: 32 }, (_, index) => ({ id: `glass-virtual-${index}`, label: `长列表播放器 ${index + 1}` }))];
  if (originalSource && !virtualSources.some(source => source.id === originalSource)) virtualSources.unshift({ id: originalSource, label: '原播放器' });
  const virtualSize = virtualSources.length + 1, lastSource = virtualSources.at(-1).id;
  const activeChoice = value => page.waitForFunction(value => document.activeElement?.getAttribute('role') === 'option'
    && document.activeElement.getAttribute('data-value') === value, value);
  await emit('session', { ...song, sources: virtualSources, cover: currentCover });
  await openSettings(); await player.scrollIntoViewIfNeeded(); menu = await menuFor('选择播放器');
  assert(await menu.getByRole('option').count() < virtualSize, 'large menus preserve virtualized rendering');
  await page.keyboard.press('End'); await activeChoice(lastSource);
  let focusedOption = menu.locator('[role="option"]:focus');
  assert.equal(await focusedOption.getAttribute('aria-posinset'), String(virtualSize));
  assert.equal(await focusedOption.getAttribute('aria-setsize'), String(virtualSize));
  await page.keyboard.press('ArrowUp'); await activeChoice(virtualSources.at(-2).id);
  await page.keyboard.press('ArrowDown'); await activeChoice(lastSource);
  await page.keyboard.press('Enter'); await menu.waitFor({ state: 'detached' });
  assert.equal(await player.getAttribute('data-value'), lastSource);
  assert.equal(await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'source').at(-1).value), lastSource);
  menu = await menuFor('选择播放器'); await page.keyboard.press('Home'); await activeChoice('');
  focusedOption = menu.locator('[role="option"]:focus');
  assert.equal(await focusedOption.getAttribute('aria-posinset'), '1'); assert.equal(await focusedOption.getAttribute('aria-setsize'), String(virtualSize));
  await page.keyboard.press('ArrowDown'); await activeChoice(virtualSources[0].id);
  await page.keyboard.press('Tab'); await menu.waitFor({ state: 'detached' });
  assert(await player.evaluate(el => el !== document.activeElement));
  await emit('session', { ...song, sources, cover: currentCover });
  await selectDesktopOption(page, '选择播放器', { value: originalSource }); await closeSettings();
  checks.push('30-plus player lists retain virtualized rendering with full aria position and size', 'virtualized End, Home and arrow navigation reach the complete source list', 'virtualized selection sends native preferences and Tab continues focus navigation');

  const beforeEscape = await fullscreenCommands();
  await emit('windowState', { maximized: false, fullscreen: true, clickThrough: false });
  menu = await menuFor('歌词样式'); await topbarAlignment(menu, 'native fullscreen'); await dismiss(menu);
  assert.equal(await fullscreenCommands(), beforeEscape, 'Escape first closes a menu without leaving native fullscreen');
  assert.equal(await page.locator('.native-fullscreen').count(), 1); assert(await mode.evaluate(el => el === document.activeElement));
  await page.keyboard.press('Escape'); await page.locator('.native-fullscreen').waitFor({ state: 'detached' });
  assert.equal(await fullscreenCommands(), beforeEscape + 1);
  assert.equal(await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'exitFullscreen').at(-1).type), 'exitFullscreen');
  checks.push('Escape dismisses a focused menu before a second Escape exits native fullscreen');

  await emit('appearance', { acrylic: false, solid: true, highContrast: false }); menu = await menuFor('歌词样式');
  assert.equal(await style(menu, 'backdropFilter'), 'none');
  assert.equal(await style(menu, 'backgroundColor'), await style(page.locator('.desktop-topbar'), 'backgroundColor'));
  await dismiss(menu);
  await emit('appearance', { acrylic: false, solid: true, highContrast: true }); menu = await menuFor('歌词样式');
  assert.equal(await style(menu, 'backdropFilter'), 'none'); assert.equal(await style(menu, 'boxShadow'), 'none');
  assert.equal(await style(menu.locator('[aria-selected="true"]'), 'borderTopStyle'), 'double');
  assert.equal(await style(menu.locator('[aria-selected="false"]').first(), 'borderTopStyle'), 'solid');
  assert.notEqual(await style(menu, 'backgroundColor'), await style(menu, 'color')); await dismiss(menu);
  await emit('appearance', { acrylic: false, solid: false, highContrast: false });
  await page.emulateMedia({ forcedColors: 'active' }); menu = await menuFor('歌词样式');
  assert.equal(await style(menu, 'backdropFilter'), 'none'); assert.equal(await style(menu.locator('[aria-selected="true"]'), 'borderTopStyle'), 'double');
  assert.equal(await style(menu.locator('[aria-selected="false"]').first(), 'borderTopStyle'), 'solid');
  await dismiss(menu); await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'reduce' });
  menu = await menuFor('歌词样式');
  assert.equal(await style(menu, 'transform'), 'none'); assert.equal(await style(menu, 'transitionDuration'), '0s');
  assert.equal(await style(menu.getByRole('option').first(), 'transitionDuration'), '0s');
  await dismiss(menu); await page.emulateMedia({ reducedMotion: 'no-preference' });
  checks.push('solid fallback removes translucency and blur consistently', 'high contrast keeps menu text and selection distinguishable', 'forced colors preserves selected-state feedback', 'reduced motion disables menu movement and control transitions');

  await openSettings(); await transparent.check(); await closeSettings();
  await page.locator('.transparent-background').waitFor(); menu = await menuFor('歌词样式');
  assert.equal(await page.locator('.acrylic-backdrop').count(), 0);
  assert(await menu.getByRole('option', { name: 'Luminous', exact: true }).isVisible());
  await page.screenshot({ path: `${output}/glass-menu-transparent.png` }); await dismiss(menu);
  await openSettings(); await transparent.uncheck(); await automatic.check(); await delay.fill('2'); await delay.press('Enter'); await automatic.uncheck(); await closeSettings();
  await page.getByRole('button', { name: '沉浸显示', exact: true }).click();
  await page.mouse.move(450, 400); await page.mouse.move(450, 18); await page.locator('.top-controls-revealed').waitFor();
  menu = await menuFor('歌词样式');
  await topbarAlignment(menu, '1280x800 windowed immersion');
  const deepChoice = menu.getByRole('option', { name: 'Luminous', exact: true }); await deepChoice.hover();
  const deepBounds = await deepChoice.boundingBox(); assert(deepBounds && deepBounds.y + deepBounds.height / 2 > 128);
  assert.equal(await page.locator('.immersive.top-controls-revealed').count(), 1, 'moving into the second-level menu must keep the immersive topbar usable');
  await deepChoice.click(); await menu.waitFor({ state: 'detached' }); assert.equal(await mode.getAttribute('data-value'), 'classic');
  menu = await menuFor('歌词样式'); await dismiss(menu);
  assert.equal(await page.locator('.immersive').count(), 1, 'menu Escape preserves manual immersion');
  menu = await menuFor('歌词样式'); await page.locator('.immersive.cursor-idle').waitFor(); await menu.waitFor({ state: 'detached' });
  await page.locator('.top-controls-revealed').waitFor({ state: 'detached' });
  assert(await page.locator('.desktop-lyrics').evaluate(el => !el.querySelector('.desktop-glass-menu') && !el.querySelector('.desktop-topbar')?.contains(document.activeElement)));
  await page.mouse.move(451, 18); await page.locator('.top-controls-revealed').waitFor(); menu = await menuFor('歌词样式');
  await emit('windowState', { maximized: false, fullscreen: false, clickThrough: true }); await menu.waitFor({ state: 'detached' });
  assert.equal(await page.locator('.top-controls-revealed').count(), 0);
  await emit('windowState', { maximized: false, fullscreen: false, clickThrough: false }); await emit('restore', {});
  await page.locator('.immersive').waitFor({ state: 'detached' });
  checks.push('transparent playback retains readable and usable glass menus', 'windowed immersive top hover keeps deeply nested menu choices usable', 'menu Escape preserves immersion and idle releases menu focus and chrome', 'click-through closes nested menus before restoring interaction');

  for (const { width, height } of [{ width: 600, height: 450 }, { width: 450, height: 300 }]) {
    await page.setViewportSize({ width, height });
    for (const choice of choices) {
      await selectDesktopOption(page, '歌词样式', { value: choice.value });
      await readableModeLabel(choice.label, `${width}x${height} ${choice.label}`);
      menu = await menuFor('歌词样式');
      await readableModeLabel(choice.label, `${width}x${height} selected menu option ${choice.label}`, menu.locator('[aria-selected="true"]'));
      await dismiss(menu);
    }
    await selectDesktopOption(page, '歌词样式', { value: 'classic' });
    menu = await menuFor('歌词样式');
    await containment(menu, width, height); await topbarAlignment(menu, `${width}x${height} window`);
    await page.keyboard.press('End');
    const lastBounds = await menu.getByRole('option').last().boundingBox(), menuBounds = await menu.boundingBox();
    assert(lastBounds && menuBounds && lastBounds.y >= menuBounds.y && lastBounds.y + lastBounds.height <= menuBounds.y + menuBounds.height);
    await page.screenshot({ path: `${output}/glass-style-menu-${width}x${height}.png` }); await dismiss(menu);
    if (height === 300) {
      await page.getByRole('button', { name: '沉浸显示', exact: true }).click();
      await page.mouse.move(width / 2, height / 2); await page.mouse.move(width / 2, 18);
      await page.locator('.top-controls-revealed').waitFor(); menu = await menuFor('歌词样式');
      await topbarAlignment(menu, `${width}x${height} windowed immersion`);
      const choice = menu.getByRole('option', { name: 'Luminous', exact: true }); await choice.hover();
      const choiceBounds = await choice.boundingBox();
      assert(choiceBounds && choiceBounds.y + choiceBounds.height / 2 >= 200, 'a small-window menu must exercise the same screen area as bottom hover');
      assert.equal(await page.locator('.immersive.top-controls-revealed').count(), 1);
      assert.equal(await page.locator('.controls-revealed').count(), 0, 'a top menu extending into the bottom zone must not reveal playback controls');
      await page.screenshot({ path: `${output}/glass-immersive-menu-${width}x${height}.png` });
      await choice.click(); await menu.waitFor({ state: 'detached' });
      await page.keyboard.press('Escape'); await page.locator('.immersive').waitFor({ state: 'detached' });
      checks.push('small-window top menus entering the bottom hover area keep playback controls hidden');
    }
    await openSettings();
    if (height === 300) {
      const panelBounds = await panel.boundingBox(), closeButton = page.getByRole('button', { name: '关闭设置', exact: true });
      const closeBounds = await closeButton.boundingBox();
      assert(panelBounds && panelBounds.height >= 120, 'minimum-window settings must remain tall enough to use');
      assert(closeBounds && closeBounds.y >= panelBounds.y && closeBounds.y + closeBounds.height <= panelBounds.y + panelBounds.height,
        'settings close must be visible immediately without scrolling');
      assert(await closeButton.evaluate(el => {
        const box = el.getBoundingClientRect(), target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return target === el || el.contains(target);
      }), 'the initial close button must be reachable at the native minimum size');
      checks.push('minimum-window settings remain at least 120px tall with an immediately usable close button');
    }
    await player.scrollIntoViewIfNeeded(); menu = await menuFor('选择播放器'); await containment(menu, width, height);
    await page.keyboard.press('End'); await page.keyboard.press('Enter'); await menu.waitFor({ state: 'detached' });
    assert.equal(await player.getAttribute('data-value'), 'glass-long');
    assert.equal(await page.evaluate(() => window.__foliaCommands.filter(command => command.type === 'source').at(-1).value), 'glass-long');
    menu = await menuFor('选择播放器'); await containment(menu, width, height);
    const overflow = await page.evaluate(() => ({ width: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    assert(overflow.html <= overflow.width && overflow.body <= overflow.width, 'long player names must not widen the document');
    await page.screenshot({ path: `${output}/glass-player-menu-${width}x${height}.png` }); await dismiss(menu);
    await selectDesktopOption(page, '选择播放器', { value: originalSource }); await closeSettings();
    checks.push(`${width}x${height} style menus align with the complete capsule and scroll inside the viewport`,
      `${width}x${height} all 13 style names remain complete in the trigger and selected menu option`, `${width}x${height} player menus support long labels and native selection without overflow`);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  menu = await menuFor('歌词样式');
  await topbarAlignment(menu, '1280x800 before resize');
  // Keep the pointer inside both viewports: an actual window exit intentionally blurs and closes its menu.
  await page.mouse.move(225, 18);
  await page.setViewportSize({ width: 450, height: 300 }); await settle('歌词样式'); await containment(menu, 450, 300);
  await topbarAlignment(menu, '450x300 open-menu resize'); await dismiss(menu);
  await page.setViewportSize({ width: 1280, height: 800 });
  checks.push('an already open menu stays aligned with the complete capsule after viewport resize',
    'style menus align both edges to their complete capsule in windows, native fullscreen and immersion');
  await openSettings(); await automatic.check(); await delay.fill(originalDelay); await delay.press('Enter'); await automatic.setChecked(originalAutomatic);
  await transparent.setChecked(originalTransparent); await closeSettings();
  await emit('session', song);
  console.log('PASS unified desktop glass / nested menus / keyboard / viewport checks');
  return checks;
}
