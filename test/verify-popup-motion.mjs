import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { desktopSelect, openDesktopMenu, selectDesktopOption } from './desktop-select.mjs';
import { visualDialog, backgroundDialog, openVisualSettings, closeVisualSettings, openBackgroundSettings, emitVisual, waitVisual, visualFrame } from './desktop-visual-fixture.mjs';
import { popupMotion, popupItemVisible, popupStyleAligned, popupStyleLabels } from './popup-motion-fixture.mjs';

// test/verify-popup-motion.mjs — uniform desktop entrances, settled positioning, genuine keyboard access and reduced motion.
export async function verifyPopupMotion(page, song, output) {
  const checks = [], samples = [], viewport = page.viewportSize();
  const originalMode = await desktopSelect(page, '歌词样式').getAttribute('data-value'); let expected, stage = 'fixture', attemptedMode;
  const motion = async (surface, context, reduced) => {
    stage = context; const result = await popupMotion(page, surface, context, reduced, samples, expected);
    if (!reduced && !expected) expected = result;
  };
  const escape = async surface => { await page.keyboard.press('Escape'); await surface.waitFor({ state: 'detached' }); };
  // Opening from the keyboard also verifies that the new animation does not delay or displace option focus.
  const selectMenu = async (name, reduced, opened) => {
    const trigger = desktopSelect(page, name); await trigger.focus(); await trigger.press('ArrowDown');
    const menu = page.getByRole('listbox', { name, exact: true }); await menu.waitFor();
    const surface = menu.locator('xpath=ancestor-or-self::*[contains(concat(" ",normalize-space(@class)," ")," desktop-glass-menu ")][1]');
    await motion(surface, `${name}-menu`, reduced);
    if (opened) await opened(surface);
    for (const [key, index] of [['Home', 0], ['End', -1]]) {
      await page.keyboard.press(key); const option = index === 0 ? menu.getByRole('option').first() : menu.getByRole('option').last();
      await page.waitForFunction(element => element === document.activeElement, await option.elementHandle());
      await popupItemVisible(option, menu, `${name}-${key}`);
    }
    await escape(menu); assert(await trigger.evaluate(element => element === document.activeElement)); return surface;
  };
  const packet = { key: song.key, title: song.title, artist: song.artist, source: '弹出动效验证', format: 'fia', cover: '',
    content: JSON.stringify({ format: 'folia-lyricdata', version: 1, exportedAt: '2026-10-03T00:00:00.000Z', song: {},
      lyrics: { isWordByWord: true, lines: [{ startTime: 1, endTime: 60, fullText: '保留原版动效', words: [
        { text: '保留', startTime: 1, endTime: 20 }, { text: '原版', startTime: 20, endTime: 40 }, { text: '动效', startTime: 40, endTime: 60 }] }] } }) };
  try {
    await emitVisual(page, 'lyrics', packet); await page.waitForFunction(() => window.__foliaReadVisualizerProps?.()?.lines[0]?.words?.length === 3);
    for (const reduced of [false, true]) {
      await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
      await page.setViewportSize(viewport); await selectDesktopOption(page, '歌词样式', { value: 'classic' });
      await page.getByRole('button', { name: '打开歌词设置', exact: true }).click();
      const settings = page.locator('.control-panel');
      if (!reduced) assert(await settings.evaluate(element => element.getAnimations().some(animation =>
        animation instanceof CSSAnimation && animation.animationName === 'desktop-popup-enter' && animation.playState === 'running')),
        'the player selector is opened while the settings entrance is still running');
      await selectMenu('选择播放器', reduced, async surface => {
        await motion(settings, 'lyric-settings-panel', reduced); await visualFrame(page);
        const anchor = await desktopSelect(page, '选择播放器').boundingBox(), popup = await surface.boundingBox();
        assert(anchor && popup); assert(Math.abs(anchor.x - popup.x) <= .75 && Math.abs(anchor.width - popup.width) <= .75,
          'a selector opened during panel entry settles at both trigger edges');
        const placement = await surface.getAttribute('data-menu-placement');
        if (placement === 'bottom') assert(Math.abs(popup.y - anchor.y - anchor.height - 4) <= .75,
          'a selector opened during panel entry follows the final bottom anchor');
        else if (placement === 'top') assert(Math.abs(popup.y + popup.height - anchor.y + 4) <= .75,
          'a selector opened during panel entry follows the final top anchor');
      });
      await page.getByRole('button', { name: '关闭设置', exact: true }).click();
      for (const size of [{ width: 600, height: 450 }, { width: 450, height: 300 }]) {
        await page.setViewportSize(size);
        for (const edge of ['first', 'last']) {
          const list = await openDesktopMenu(page, '歌词样式'), surface = page.locator('.desktop-top-menu');
          await motion(surface, `style-${size.width}-${edge}-before-select`, reduced);
          await popupStyleAligned(page, surface, `${size.width} style entrance`);
          await popupStyleLabels(list, `${size.width} style entrance`);
          await page.keyboard.press(edge === 'first' ? 'Home' : 'End'); const option = list.getByRole('option')[edge]();
          await popupItemVisible(option, list, `${size.width} ${edge} option`); const value = await option.getAttribute('data-value');
          attemptedMode = value; stage = `style-${size.width}-${edge}-commit-${value}`;
          await option.press('Enter'); await list.waitFor({ state: 'detached' }); await waitVisual(page, { mode: value });
          const selectedList = await openDesktopMenu(page, '歌词样式'), selectedSurface = page.locator('.desktop-top-menu');
          await motion(selectedSurface, `style-${size.width}-${edge}-selected`, reduced);
          await popupStyleAligned(page, selectedSurface, `${size.width} selected entrance`);
          await popupStyleLabels(selectedList, `${size.width} selected entrance`);
          assert.equal(await selectedList.getByRole('option', { selected: true }).getAttribute('data-value'), value,
            `${size.width} selected ${edge}: reopening retains the genuinely selected style`);
          await popupItemVisible(selectedList.getByRole('option', { selected: true }), selectedList, `${size.width} selected ${edge}`);
          if (!reduced) await page.screenshot({ path: `${output}/popup-motion-style-${size.width}-${edge}-selected.png` });
          await escape(selectedList); assert(await desktopSelect(page, '歌词样式').evaluate(element => element === document.activeElement));
        }
        const more = page.getByRole('button', { name: '更多操作', exact: true }); await more.focus(); await more.press('ArrowDown');
        const menu = page.getByRole('menu', { name: '更多操作', exact: true }); await motion(menu, `more-${size.width}`, reduced);
        await page.keyboard.press('End'); await popupItemVisible(menu.getByRole('menuitem').last(), menu, 'last More action');
        await escape(menu); assert(await more.evaluate(element => element === document.activeElement));
      }
      checks.push(`${reduced ? 'reduced' : 'normal'} motion: player/style/More menus retain keyboard focus, complete first/last selections and both aligned edges in small windows`);
      await page.setViewportSize(viewport); await selectDesktopOption(page, '歌词样式', { value: 'classic' });
      await openVisualSettings(page, 'common'); await motion(visualDialog(page), 'visual-settings-panel', reduced);
      await selectMenu('字体', reduced); await selectMenu('动画强度', reduced);
      await openVisualSettings(page, 'subtitle'); await selectMenu('副字幕内容', reduced); await closeVisualSettings(page);
      await openBackgroundSettings(page); await motion(backgroundDialog(page), 'background-settings-panel', reduced);
      await selectMenu('背景类型', reduced); await closeVisualSettings(page);
      checks.push(`${reduced ? 'reduced' : 'normal'} motion: visual/background panels and font/intensity/subtitle/background selectors share the same entrance contract`);
      const section = await openVisualSettings(page, 'visualizer'); await section.locator('[data-visual-mode="tempera"]').click(); await waitVisual(page, { mode: 'tempera' });
      await section.locator('[data-visualizer-settings="tempera"]').getByRole('button', { name: '添加图片', exact: true }).click();
      const images = page.getByRole('dialog', { name: '画布图片', exact: true }); await motion(images, 'body-asset-dialog', reduced);
      assert(await images.evaluate(element => !element.closest('.desktop-lyrics')));
      const imported = images.getByRole('button', { name: '导入备份', exact: true }); await imported.focus(); await imported.press('Enter');
      const menu = images.getByRole('menu'); await motion(menu, 'body-import-menu', reduced);
      await page.keyboard.press('Tab'); assert(await menu.evaluate(element => element.contains(document.activeElement)));
      await popupItemVisible(menu.getByRole('menuitem').first(), menu, 'body first import option');
      if (!reduced) await page.screenshot({ path: `${output}/popup-motion-body-menu.png` });
      await escape(menu); assert(await images.isVisible()); assert(await visualDialog(page).isVisible());
      await escape(images); assert(await visualDialog(page).isVisible()); await closeVisualSettings(page);
      const segmentation = page.locator('.segmentation-shortcut'); await segmentation.focus(); await segmentation.press('Enter');
      const dialog = page.getByRole('dialog', { name: '本曲歌词分词', exact: true }); await motion(dialog, 'segmentation-panel', reduced);
      await page.keyboard.press('Shift+Tab'); assert(await dialog.evaluate(element => element.contains(document.activeElement)));
      await escape(dialog); assert(await segmentation.evaluate(element => element === document.activeElement));
      checks.push(`${reduced ? 'reduced' : 'normal'} motion: the original body asset/import layers and segmentation panel animate consistently and Escape closes only the current layer`);
      await page.setViewportSize({ width: 600, height: 450 });
      const tailList = await openDesktopMenu(page, '歌词样式'); await page.keyboard.press('End');
      const tail = tailList.getByRole('option').last(), tailValue = await tail.getAttribute('data-value');
      await tail.press('Enter'); await tailList.waitFor({ state: 'detached' }); await waitVisual(page, { mode: tailValue });
      const resizedList = await openDesktopMenu(page, '歌词样式'), resizedSurface = page.locator('.desktop-top-menu');
      await motion(resizedSurface, 'style-open-resize', reduced);
      await page.setViewportSize({ width: 450, height: 300 }); await visualFrame(page);
      await popupStyleAligned(page, resizedSurface, 'open style menu after resize');
      await popupStyleLabels(resizedList, 'open style menu after resize');
      const selected = resizedList.getByRole('option', { selected: true }), footer = resizedSurface.locator('[data-custom-select-footer]');
      await popupItemVisible(selected, resizedList, 'selected option after open-menu resize');
      await page.keyboard.press('Tab'); assert(await footer.evaluate(element => element === document.activeElement));
      await page.keyboard.press('Shift+Tab'); assert(await selected.evaluate(element => element === document.activeElement));
      await popupItemVisible(selected, resizedList, 'selected option after footer Shift+Tab');
      await page.keyboard.press('Tab'); assert(await footer.evaluate(element => element === document.activeElement));
      await escape(resizedList); assert(await desktopSelect(page, '歌词样式').evaluate(element => element === document.activeElement));
      checks.push(`${reduced ? 'reduced' : 'normal'} motion: opening during panel entrance, resizing an open menu and footer Tab/Shift+Tab retain final positioning and focus`);
    }
    return { checks, samples };
  } catch (error) {
    const selection = await page.evaluate(() => {
      const stack = [window.__foliaParserCommittedRoot], nodes = [];
      while (stack.length) {
        const node = stack.pop(); if (!node) continue;
        const props = node.memoizedProps;
        if (typeof props?.mode === 'string') nodes.push({ mode: props.mode, lines: Array.isArray(props.lines), clock: Boolean(props.currentTime), theme: Boolean(props.theme) });
        if (node.sibling) stack.push(node.sibling); if (node.child) stack.push(node.child);
      }
      return { trigger: document.querySelector('[role=combobox][aria-label="歌词样式"]')?.getAttribute('data-value'),
        stored: localStorage.getItem('folia.desktop.mode.v1'), renderer: window.__foliaReadVisualizerProps?.()?.mode,
        root: document.querySelector('.desktop-lyrics')?.className, nodes, events: window.__foliaPopupMotionEvents,
        menus: [...document.querySelectorAll('.desktop-glass-menu')].map(element => ({ label: element.getAttribute('aria-label'),
          animation: getComputedStyle(element).animation, classes: element.className, records: window.__foliaPopupMotion.get(element)?.length ?? 0 })),
        active: document.activeElement?.outerHTML.slice(0, 500) };
    });
    await writeFile(`${output}/popup-motion-failure.json`, JSON.stringify({ stage, attemptedMode, selection, checks, samples, error: String(error) }, null, 2));
    await page.screenshot({ path: `${output}/popup-motion-failure.png` }); throw error;
  } finally {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const assetClose = page.locator('.desktop-visual-asset-dialog>[role=dialog]>button');
    if (await assetClose.count()) { await assetClose.first().click(); await page.locator('.desktop-visual-asset-dialog').waitFor({ state: 'detached' }); }
    await closeVisualSettings(page);
    if (await page.locator('.desktop-segmentation-settings').count()) await page.getByRole('button', { name: '关闭分词设置', exact: true }).click();
    if (await page.getByRole('button', { name: '关闭设置', exact: true }).count()) await page.getByRole('button', { name: '关闭设置', exact: true }).click();
    await page.setViewportSize(viewport); await selectDesktopOption(page, '歌词样式', { value: originalMode });
  }
}
