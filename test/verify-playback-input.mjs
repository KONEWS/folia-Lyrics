import assert from 'node:assert/strict';
import { desktopSelect, openDesktopMenu, selectDesktopOption } from './desktop-select.mjs';

// test/verify-playback-input.mjs — production desktop shortcuts, editing boundaries and listener stability.

// Observe add/remove pairs in the browser to catch duplicated listeners after session and mode changes.
export async function installPlaybackInputProbe(page) {
  await page.addInitScript(() => {
    const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
    const types = new Set(['keydown', 'wheel', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick']);
    const records = [];
    const relevant = (target, type) => types.has(type) && (target === window || target === document
      || target instanceof Element && target.classList.contains('desktop-lyrics'));
    const capture = options => typeof options === 'boolean' ? options : Boolean(options?.capture);
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (relevant(this, type) && listener && !records.some(record => record.target === this && record.type === type
        && record.listener === listener && record.capture === capture(options))) records.push({ target: this, type, listener, capture: capture(options) });
      return add.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function(type, listener, options) {
      const index = records.findIndex(record => record.target === this && record.type === type && record.listener === listener
        && record.capture === capture(options));
      if (index !== -1) records.splice(index, 1);
      return remove.call(this, type, listener, options);
    };
    window.__foliaInputListenerSnapshot = () => records.map(record => `${record.target === window ? 'window'
      : record.target === document ? 'document' : 'main'}:${record.type}:${record.capture}`).sort();
  });
}

export async function verifyPlaybackInput(page, song, output) {
  const checks = [];
  let expectedSession = song;
  const emit = (type, data) => page.evaluate(({ type, data }) => window.__foliaEmit(type, data), { type, data });
  const messages = type => page.evaluate(type => window.__foliaCommands.filter(command => command.type === type), type);
  const counts = async () => ({ media: (await messages('mediaControl')).length, volume: (await messages('systemVolume')).length });
  const flush = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const blur = () => page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  const quiet = async (action, context, mediaOnly = false) => {
    const before = await counts(); await action(); await flush(); const after = await counts();
    assert.equal(after.media, before.media, `${context}: must not send media commands`);
    if (!mediaOnly) assert.equal(after.volume, before.volume, `${context}: must not adjust system volume`);
  };
  const ready = async (overrides = {}) => {
    expectedSession = { ...song, playing: false, ...overrides };
    await emit('session', expectedSession); await flush();
    await page.waitForFunction(() => document.querySelector('.playback-controls')?.getAttribute('aria-busy') === 'false');
  };
  const request = async (action, input, context) => {
    const before = (await messages('mediaControl')).length; await input();
    await page.waitForFunction(before => window.__foliaCommands.filter(command => command.type === 'mediaControl').length > before, before);
    const sent = await messages('mediaControl'); assert.equal(sent.length, before + 1, `${context}: one input sends exactly one media request`);
    const value = sent.at(-1).value;
    assert.equal(value.action, action, context); assert.equal(value.sessionId, expectedSession.sessionId); assert.equal(value.songKey, expectedSession.key);
    assert.equal(typeof value.requestId, 'string'); assert(value.requestId.length > 0);
    await page.waitForFunction(() => document.querySelector('.playback-controls')?.getAttribute('aria-busy') === 'true');
    return value;
  };
  const ack = async value => {
    await emit('transport', { requestId: value.requestId, success: true, message: '快捷操作已发送' });
    await page.waitForFunction(() => document.querySelector('.playback-controls')?.getAttribute('aria-busy') === 'false');
  };
  const press = async key => { await blur(); await page.keyboard.press(key); };
  const keyEvent = (key, options = {}, selector = '.desktop-stage') => page.locator(selector).evaluate((target, { key, options }) => {
    const event = new KeyboardEvent('keydown', { key: key === 'Space' ? ' ' : key, code: key, bubbles: true, cancelable: true, ...options });
    target.dispatchEvent(event); return event.defaultPrevented;
  }, { key, options });
  const sideEvents = (button, options = {}, selector = '.desktop-stage') => page.locator(selector).evaluate((target, { button, options }) => {
    const results = [];
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'auxclick']) {
      const Event = type.startsWith('pointer') ? PointerEvent : MouseEvent;
      const event = new Event(type, { button, buttons: type.endsWith('down') ? button === 3 ? 8 : 16 : 0,
        pointerType: 'mouse', bubbles: true, cancelable: true, ...options });
      target.dispatchEvent(event); results.push({ type, prevented: event.defaultPrevented });
    }
    return results;
  }, { button, options });
  const wheelEvent = (deltaY, options = {}, selector = '.desktop-stage') => page.locator(selector).evaluate((target, { deltaY, options }) => {
    const event = new WheelEvent('wheel', { deltaY, deltaMode: 0, bubbles: true, cancelable: true, ...options });
    target.dispatchEvent(event); return event.defaultPrevented;
  }, { deltaY, options });
  // The host applies two percentage points per step; browser verification checks the actual IPC step count.
  const volume = async (delta, action, context) => {
    const before = (await messages('systemVolume')).length; await action();
    await page.waitForFunction(before => window.__foliaCommands.filter(command => command.type === 'systemVolume').length > before, before);
    const sent = (await messages('systemVolume')).slice(before);
    assert.equal(sent.reduce((sum, command) => sum + command.value.delta, 0), delta, context);
    assert(sent.every(command => Number.isInteger(command.value.delta) && Math.abs(command.value.delta) >= 1 && Math.abs(command.value.delta) <= 4),
      'one wheel event must send bounded, nonzero integer volume steps');
  };
  // Keep one wheel gesture inside the browser event loop; Playwright IPC latency is not user idle time.
  const wheelGesture = async (events, expected, context) => {
    const result = await page.locator('.desktop-stage').evaluate(async (target, events) => {
      const commands = () => window.__foliaCommands.filter(command => command.type === 'systemVolume');
      const before = commands().length, media = window.__foliaCommands.filter(command => command.type === 'mediaControl').length;
      const samples = [];
      for (const item of events) {
        if (typeof item === 'object') { await new Promise(resolve => setTimeout(resolve, item.wait)); continue; }
        const event = new WheelEvent('wheel', { deltaY: item, deltaMode: 0, bubbles: true, cancelable: true });
        target.dispatchEvent(event);
        samples.push({ prevented: event.defaultPrevented, delta: commands().slice(before).reduce((sum, command) => sum + command.value.delta, 0) });
      }
      return { samples, commands: commands().slice(before), mediaBefore: media,
        mediaAfter: window.__foliaCommands.filter(command => command.type === 'mediaControl').length };
    }, events);
    assert.deepEqual(result.samples.map(sample => sample.delta), expected, context);
    assert(result.samples.every(sample => sample.prevented), `${context}: accepted wheel events prevent page scrolling`);
    assert.equal(result.mediaAfter, result.mediaBefore, `${context}: wheel gestures must not control playback`);
    assert(result.commands.every(command => Number.isInteger(command.value.delta) && Math.abs(command.value.delta) >= 1 && Math.abs(command.value.delta) <= 4),
      `${context}: native volume steps remain bounded nonzero integers`);
  };
  const openSettings = () => page.getByRole('button', { name: '打开歌词设置', exact: true }).click();
  const closeSettings = () => page.locator('.desktop-topbar [data-settings-trigger]').click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await emit('windowState', { maximized: false, fullscreen: false, clickThrough: false }); await emit('restore', {});
  if (await page.locator('.control-panel').count()) await closeSettings();
  await ready();
  await emit('lyrics', { key: song.key, title: song.title, artist: song.artist, content: '[00:01.00]外部播放器快捷操作\n[00:20.00]保留原版歌词显示',
    source: '快捷操作验证', cover: '', embedded: false });
  await page.locator('.waiting-screen').waitFor({ state: 'detached' });
  const mode = desktopSelect(page, '歌词样式'), originalMode = await mode.getAttribute('data-value');
  await selectDesktopOption(page, '歌词样式', { value: 'classic' });
  await openSettings();
  const automatic = page.getByRole('checkbox', { name: '闲置时自动进入沉浸模式', exact: true }), originalAutomatic = await automatic.isChecked();
  await automatic.uncheck(); await closeSettings();

  for (const state of [
    { label: 'normal', maximized: false, fullscreen: false }, { label: 'maximized', maximized: true, fullscreen: false },
    { label: 'fullscreen', maximized: false, fullscreen: true },
  ]) {
    await emit('windowState', { ...state, clickThrough: false });
    for (const immersive of [false, true]) {
      await emit('restore', {});
      if (immersive) await page.getByRole('button', { name: '沉浸显示', exact: true }).click();
      const label = `${state.label}${immersive ? ' immersive' : ''}`;
      await ready({ playing: true }); await ack(await request('pause', () => press('Space'), `${label} Space pauses`));
      assert.equal(await page.locator('.transport-primary').getAttribute('aria-label'), '暂停音乐', 'ACK must not manufacture a paused session');
      await ready(); await ack(await request('play', () => press('Space'), `${label} Space resumes`));
      await ack(await request('previous', () => press('ArrowLeft'), `${label} Left`));
      await ack(await request('next', () => press('ArrowRight'), `${label} Right`));
      for (const [button, action] of [[3, 'previous'], [4, 'next']]) {
        let events; await ack(await request(action, async () => { events = await sideEvents(button); }, `${label} side ${button}`));
        assert(events.filter(event => ['mousedown', 'mouseup', 'auxclick'].includes(event.type)).every(event => event.prevented),
          'side buttons must cancel mouse-down, mouse-up and auxiliary-click browser navigation defaults');
      }
      await page.mouse.move(640, 400); await blur();
      await volume(1, () => page.mouse.wheel(0, -100), `${label} one upward notch`);
      await volume(-1, () => page.mouse.wheel(0, 100), `${label} one downward notch`);
      checks.push(`${label}: Space, Left, Right and mouse side buttons target the external player once`);
    }
  }
  await emit('windowState', { maximized: false, fullscreen: false, clickThrough: false }); await emit('restore', {}); await ready();
  await page.mouse.move(640, 400); await blur();
  const pending = await request('previous', () => keyEvent('ArrowLeft'), 'initial shortcut starts shared pending');
  await quiet(async () => {
    await keyEvent('ArrowRight'); await sideEvents(4); await press('Space');
    assert(await page.getByRole('button', { name: '下一首', exact: true }).isDisabled());
  }, 'keyboard, side buttons and UI share the pending transport gate', true);
  await ack(pending);
  await ack(await request('next', () => page.getByRole('button', { name: '下一首', exact: true }).click(), 'UI controls recover after shortcut ACK'));
  const uiPending = await request('previous', () => page.getByRole('button', { name: '上一首', exact: true }).click(), 'UI starts shared pending');
  await quiet(() => press('ArrowRight'), 'shortcuts do not bypass UI pending', true); await ack(uiPending);
  const burst = await request('previous', () => page.locator('.desktop-stage').evaluate(target => {
    for (const key of ['ArrowLeft', 'ArrowRight']) target.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }));
    target.dispatchEvent(new MouseEvent('mouseup', { button: 4, bubbles: true, cancelable: true }));
  }), 'a synchronous input burst cannot outrun the pending gate');
  await ack(burst);
  checks.push('shortcuts and playback buttons share pending requests and recover together after ACK',
    'a synchronous keyboard and side-button burst emits one request before React renders pending state');

  await ready({ playing: true });
  for (const name of ['暂停音乐', '上一首', '下一首']) {
    await page.getByRole('button', { name, exact: true }).focus();
    await ack(await request('pause', () => page.keyboard.press('Space'), `focused ${name} Space consistently pauses and suppresses native click`));
  }
  await page.getByRole('button', { name: '上一首', exact: true }).focus();
  const heldCount = (await messages('mediaControl')).length;
  await page.keyboard.down('Space'); await page.keyboard.down('Space'); await page.keyboard.down('Space'); await page.keyboard.up('Space');
  const held = await messages('mediaControl'); assert.equal(held.length, heldCount + 1, 'holding Space on a focused button must activate it once');
  assert.equal(held.at(-1).value.action, 'pause'); await ack(held.at(-1).value);
  await page.getByRole('button', { name: '上一首', exact: true }).focus();
  await ack(await request('previous', () => page.keyboard.press('Enter'), 'focused previous button preserves Enter activation'));
  await blur(); await quiet(async () => {
    for (const key of ['Space', 'ArrowLeft', 'ArrowRight']) await keyEvent(key, { repeat: true });
  }, 'held shortcut key repeats are ignored');
  checks.push('Space consistently toggles playback even on focused previous/next buttons and prevents native click',
    'Enter retains the focused button action', 'held buttons activate once and repeated shortcut keydowns do not enqueue commands');

  for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) await quiet(async () => {
    for (const key of ['Space', 'ArrowLeft', 'ArrowRight']) await keyEvent(key, { [modifier]: true });
    await sideEvents(3, { [modifier]: true }); await sideEvents(4, { [modifier]: true }); await wheelEvent(-100, { [modifier]: true });
  }, `${modifier} combinations preserve their normal behavior`);
  await quiet(async () => {
    await keyEvent('Space', { isComposing: true }); await keyEvent('ArrowLeft', { isComposing: true }); await keyEvent('ArrowRight', { keyCode: 229 });
  }, 'IME composition does not control playback');
  checks.push('modifier combinations and IME composition do not trigger playback shortcuts');

  await ready({ controls: { ...song.controls, previous: false } });
  await quiet(async () => { await press('ArrowLeft'); await sideEvents(3); }, 'unsupported previous action', true);
  await ack(await request('next', () => press('ArrowRight'), 'supported next stays available'));
  await ready({ controls: { ...song.controls, next: false } });
  await quiet(async () => { await press('ArrowRight'); await sideEvents(4); }, 'unsupported next action', true);
  await ack(await request('previous', () => press('ArrowLeft'), 'supported previous stays available'));
  for (const [playing, flag] of [[true, 'pause'], [false, 'play']]) {
    await ready({ playing, controls: { ...song.controls, [flag]: false, toggle: false } });
    await quiet(() => press('Space'), `unsupported ${flag}`, true);
  }
  await ready({ controls: null }); await quiet(async () => { await press('Space'); await press('ArrowLeft'); await sideEvents(4); }, 'missing media capabilities', true);
  await ready({ sessionId: '' }); await quiet(async () => { await press('Space'); await press('ArrowRight'); await sideEvents(3); }, 'missing media session', true);
  await ready(); await emit('connectionError', { text: '快捷操作验证：连接中断' }); await flush();
  await quiet(async () => { await press('Space'); await press('ArrowLeft'); await sideEvents(4); }, 'disconnected external player', true);
  await ready(); await emit('windowState', { maximized: false, fullscreen: false, clickThrough: true }); await flush();
  await quiet(async () => { await keyEvent('Space'); await sideEvents(3); await wheelEvent(-120); }, 'mouse click-through');
  await emit('windowState', { maximized: false, fullscreen: false, clickThrough: false }); await emit('restore', {}); await ready();
  await ack(await request('play', () => press('Space'), 'restoring connected interaction recovers shortcuts'));
  checks.push('individual media capabilities preserve supported actions and block unsupported ones', 'missing sessions, disconnect and click-through block media then recover');

  await openSettings();
  const panel = page.locator('.control-panel'), title = page.getByRole('textbox', { name: '在线搜索歌名', exact: true });
  await title.fill('AB'); await title.focus();
  await quiet(async () => { await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Space'); await page.keyboard.press('ArrowLeft'); }, 'editing search input');
  assert.equal(await title.inputValue(), 'A B', 'Space and cursor navigation must edit the input normally');
  await quiet(async () => { await keyEvent('Space'); await wheelEvent(-120); }, 'settings opened even when input targets the lyric stage');
  await quiet(() => sideEvents(4), 'outside side-button dismissal does not trigger playback or volume');
  await panel.waitFor({ state: 'detached' }); await openSettings();
  await panel.evaluate(el => { el.scrollTop = 0; }); await panel.hover(); const scrollBefore = await panel.evaluate(el => el.scrollTop);
  await quiet(async () => { await page.mouse.wheel(0, 120); await page.waitForFunction(before => document.querySelector('.control-panel')?.scrollTop > before, scrollBefore); }, 'settings wheel scrolls normally');
  const player = desktopSelect(page, '选择播放器'); await player.scrollIntoViewIfNeeded();
  let menu = await openDesktopMenu(page, '选择播放器');
  await quiet(async () => { await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight'); await wheelEvent(-120, {}, '[role="listbox"]'); }, 'player menu navigation');
  await page.keyboard.press('Escape'); await menu.waitFor({ state: 'detached' }); await closeSettings();
  checks.push('settings input preserves text editing and stage events cannot bypass the open panel', 'settings retain real wheel scrolling and player menus retain keyboard navigation');

  await mode.focus();
  await quiet(() => page.keyboard.press('Space'), 'focused collapsed style combobox');
  menu = page.getByRole('listbox', { name: '歌词样式', exact: true }); await menu.waitFor();
  await quiet(async () => { await keyEvent('ArrowLeft'); await sideEvents(4, {}, '[role="listbox"]'); await wheelEvent(-100, {}, '[role="listbox"]'); },
    'focused listbox keeps keyboard navigation and menu-targeted mouse input independent');
  const oldOption = await page.evaluate(() => document.activeElement?.getAttribute('data-value'));
  await quiet(() => page.keyboard.press('ArrowDown'), 'style menu arrow navigation');
  assert.notEqual(await page.evaluate(() => document.activeElement?.getAttribute('data-value')), oldOption);
  await quiet(async () => { await keyEvent('ArrowLeft'); await wheelEvent(-100); }, 'an open listbox gates keyboard and wheel over the lyric stage');
  await quiet(async () => {
    await page.locator('.desktop-stage').evaluate(target => target.dispatchEvent(new MouseEvent('mousedown', { button: 4, buttons: 16, bubbles: true, cancelable: true })));
    await menu.waitFor({ state: 'detached' }); await flush();
    await page.locator('.desktop-stage').evaluate(target => {
      target.dispatchEvent(new MouseEvent('mouseup', { button: 4, bubbles: true, cancelable: true }));
      target.dispatchEvent(new MouseEvent('auxclick', { button: 4, bubbles: true, cancelable: true }));
    });
  }, 'a side-button gesture that closes the menu must not resume as a track-change gesture');
  await blur();
  checks.push('focused combobox Space opens its menu and open listboxes keep global shortcuts inactive',
    'asynchronous side-button menu dismissal does not switch tracks after the outside mouse-down');

  await page.locator('.desktop-stage').evaluate(el => {
    const editor = document.createElement('div'); editor.dataset.foliaInputEditable = ''; editor.contentEditable = 'true'; editor.textContent = 'AB';
    editor.style.cssText = 'position:fixed;left:20px;top:190px;width:150px;height:30px;z-index:500;background:#222'; el.append(editor);
    const scroll = document.createElement('div'); scroll.dataset.foliaInputScroll = ''; scroll.style.cssText = 'position:fixed;left:20px;top:240px;width:150px;height:70px;overflow:auto;z-index:500;background:#222';
    const content = document.createElement('div'); content.style.height = '400px'; content.textContent = '测试内的可滚动区域'; scroll.append(content); el.append(scroll);
  });
  const editor = page.locator('[data-folia-input-editable]'), scroll = page.locator('[data-folia-input-scroll]');
  await editor.focus(); await quiet(async () => { await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Space'); await page.keyboard.press('ArrowLeft'); }, 'contenteditable text editing');
  assert.equal(await editor.innerText(), 'A B'); await blur();
  await scroll.hover(); await quiet(async () => { await page.mouse.wheel(0, 120); await page.waitForFunction(() => document.querySelector('[data-folia-input-scroll]')?.scrollTop > 0); }, 'a scrollable child keeps normal scrolling');
  await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; }); await quiet(() => page.mouse.wheel(0, 120), 'scrollable child at its lower edge');
  await editor.evaluate(el => el.remove()); await scroll.evaluate(el => el.remove());
  checks.push('contenteditable preserves text input and scrollable regions never change system volume');

  await page.mouse.move(640, 400); await blur();
  await volume(1, () => page.mouse.wheel(0, -100), 'one upward wheel notch sends one native two-point step');
  await volume(-1, () => page.mouse.wheel(0, 100), 'one downward wheel notch sends one native two-point step');
  await quiet(async () => { await wheelEvent(0); await wheelEvent(0, { deltaX: 120 }); await wheelEvent(5, { deltaX: 120 }); }, 'zero and predominantly horizontal wheel');
  await quiet(() => wheelEvent(-100, { ctrlKey: true }), 'Ctrl wheel preserves browser zoom');
  await quiet(() => wheelEvent(-1), 'one tiny trackpad event does not become a full notch');
  await page.waitForTimeout(270);
  await wheelGesture(Array(10).fill(-10), [...Array(9).fill(0), 1], 'ten small trackpad events accumulate into one notch without amplifying partial events');
  await wheelGesture([-60, 60, 40], [0, 0, -1], 'reversing direction discards the previous remainder and requires a complete new notch');
  await wheelGesture([-60, { wait: 270 }, -60, -40], [0, 0, 1], 'a 270ms pause expires old wheel remainder and new adjacent events complete the current notch');
  await volume(1, () => wheelEvent(-3, { deltaMode: 1 }), 'line-mode wheel converts forty pixels per line');
  await volume(-1, () => wheelEvent(1, { deltaMode: 2 }), 'page-mode wheel converts one page to one notch');
  await volume(4, () => wheelEvent(-10000), 'a large wheel event is capped at four steps');
  await page.waitForTimeout(270);
  checks.push('vertical wheel sends one native step per notch in normal, maximized, fullscreen and immersion',
    'horizontal, Ctrl and tiny trackpad wheel events do not become full volume steps',
    'trackpad remainder accumulates, resets on direction changes and expires after 250ms',
    'line and page wheel units normalize correctly and one event is capped at four steps');

  await quiet(() => wheelEvent(-60), 'partial wheel notch before opening settings');
  await openSettings(); await closeSettings();
  await wheelGesture([-60, -40], [0, 1], 'post-settings scrolling begins with a fresh remainder');
  await quiet(() => wheelEvent(-60), 'partial wheel notch before click-through');
  await emit('windowState', { maximized: false, fullscreen: false, clickThrough: true }); await flush();
  await emit('windowState', { maximized: false, fullscreen: false, clickThrough: false }); await emit('restore', {}); await flush();
  await wheelGesture([-60, -40], [0, 1], 'restored interaction begins with a fresh remainder');
  checks.push('opening settings and changing click-through clear incomplete wheel gestures');

  const feedback = page.locator('.system-volume-feedback');
  await emit('systemVolume', { percent: 48, muted: false }); await feedback.waitFor();
  assert.equal(await feedback.innerText(), '系统音量 48%'); assert.equal(await feedback.getAttribute('aria-live'), 'polite');
  assert.equal(await feedback.evaluate(el => getComputedStyle(el).pointerEvents), 'none');
  await page.waitForTimeout(1000); await emit('systemVolume', { percent: 46, muted: true });
  await page.waitForFunction(() => document.querySelector('.system-volume-feedback')?.textContent?.includes('46% · 静音'));
  await page.waitForTimeout(1000); assert(await feedback.isVisible(), 'a new native volume reply restarts the feedback timeout');
  await page.screenshot({ path: `${output}/playback-volume-feedback.png` });
  await feedback.waitFor({ state: 'detached', timeout: 3000 });
  checks.push('native volume replies show accessible feedback and the newest reply resets its timed dismissal');

  await ready({ key: 'input-awaiting-lyrics', title: '已连接歌曲，等待歌词' }); await page.locator('.waiting-screen').waitFor();
  await ack(await request('play', () => press('Space'), 'connected songs retain shortcuts while lyrics are loading'));
  await ready({ key: '', title: '' });
  await emit('lyrics', { key: '', title: '', artist: '', content: '', source: '', cover: '', embedded: false }); await flush();
  await quiet(async () => { await press('Space'); await press('ArrowRight'); await sideEvents(3); await wheelEvent(-100); }, 'no song and no lyrics');
  await emit('lyrics', { key: '', title: '导入歌词', artist: '', content: '[00:01.00]已有歌词的播放页面', source: '快捷操作验证', cover: '', embedded: false });
  await page.locator('.waiting-screen').waitFor({ state: 'detached' });
  await ack(await request('play', () => press('Space'), 'existing lyrics retain shortcuts with an available media session'));
  await wheelGesture([-60, -40], [0, 1], 'newly active lyric page starts a fresh volume gesture');
  await ready();
  await emit('lyrics', { key: song.key, title: song.title, artist: song.artist, content: '[00:01.00]外部播放器快捷操作\n[00:20.00]保留原版歌词显示',
    source: '快捷操作验证', cover: '', embedded: false });
  await page.locator('.waiting-screen').waitFor({ state: 'detached' });
  checks.push('connected songs or existing lyrics activate shortcuts, while an empty welcome page does not');

  const baseline = await page.evaluate(() => window.__foliaInputListenerSnapshot());
  for (let i = 0; i < 8; i++) { await ready({ playing: Boolean(i % 2) }); await emit('windowState', { maximized: Boolean(i % 2), fullscreen: false, clickThrough: false }); await flush(); }
  assert.deepEqual(await page.evaluate(() => window.__foliaInputListenerSnapshot()), baseline, 'state changes must remove superseded input listeners');
  await ready(); await ack(await request('next', () => press('ArrowRight'), 'state changes retain exactly one shortcut handler'));
  await page.screenshot({ path: `${output}/playback-input.png` });
  await selectDesktopOption(page, '歌词样式', { value: originalMode });
  await openSettings(); await automatic.setChecked(originalAutomatic); await closeSettings();
  await emit('windowState', { maximized: false, fullscreen: false, clickThrough: false }); await emit('restore', {});
  checks.push('session and window-state changes retain one handler and a stable listener count');

  console.log('PASS playback keyboard / side buttons / wheel / input boundaries / listener stability checks');
  return checks;
}
