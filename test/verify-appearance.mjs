import assert from 'node:assert/strict';

// test/verify-appearance.mjs
export async function verifyAppearance(page, output) {
  const emit = data => page.evaluate(data => window.__foliaEmit('appearance', data), data);
  const style = (selector, property) => page.locator(selector).evaluate((el, property) => getComputedStyle(el)[property], property);
  for (const selector of ['html','body','#root']) assert.equal(await style(selector,'backgroundColor'),'rgba(0, 0, 0, 0)');
  await emit({acrylic:true,solid:false,highContrast:false}); await page.locator('.native-acrylic').waitFor();
  assert.equal(await style('.acrylic-backdrop','backgroundImage'),'none');
  assert.equal(await style('.acrylic-backdrop','backgroundColor'),'rgba(0, 0, 0, 0)');
  await emit({acrylic:false,solid:true,highContrast:false}); await page.locator('.solid-surfaces').waitFor();
  for (const selector of ['.desktop-topbar', '.desktop-statusbar']) {
    assert.equal(await style(selector,'backdropFilter'),'none');
    assert.equal(await style(selector,'backgroundColor'),'rgba(0, 0, 0, 0)', 'everyday toolbar stays transparent on the opaque backdrop');
  }
  await page.getByRole('button',{name:'打开歌词设置',exact:true}).click();
  const solid = await page.locator('.desktop-lyrics').evaluate(el => {
    const probe = document.createElement('i'); probe.style.backgroundColor = 'var(--desktop-glass-base)'; el.append(probe);
    const expected = getComputedStyle(probe).backgroundColor; probe.remove();
    const actual = getComputedStyle(el.querySelector('.control-panel')).backgroundColor;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d'); context.fillStyle = actual; context.fillRect(0, 0, 1, 1);
    return { actual, expected, alpha: context.getImageData(0, 0, 1, 1).data[3] };
  });
  assert.equal(solid.actual, solid.expected, 'solid floating settings follow the cover theme or default background');
  assert.equal(solid.alpha, 255, 'solid floating settings must stay opaque');
  assert.equal(await style('.control-panel','backdropFilter'),'none');
  await page.locator('.desktop-topbar [data-settings-trigger]').click();
  await emit({acrylic:false,solid:true,highContrast:true}); await page.locator('.high-contrast').waitFor();
  await emit({acrylic:false,solid:false,highContrast:false}); await page.locator('.solid-surfaces').waitFor({state:'detached'});
  assert.equal(await style('.window-chrome','backgroundColor'),'rgba(0, 0, 0, 0)');
  assert(await page.getByText('Folia 桌面歌词',{exact:true}).isVisible());
  const start=await page.evaluate(()=>window.__foliaCommands.length);
  await page.getByRole('button',{name:'最小化窗口',exact:true}).click();
  await page.getByRole('button',{name:'最大化窗口',exact:true}).click();
  await page.evaluate(()=>window.__foliaEmit('windowState',{maximized:true,fullscreen:false}));
  await page.getByRole('button',{name:'还原窗口',exact:true}).click();
  await page.evaluate(()=>window.__foliaEmit('windowState',{maximized:false,fullscreen:false}));
  await page.locator('.window-drag').click();
  await page.locator('.edge-e').click();
  const chrome=await page.evaluate(start=>window.__foliaCommands.slice(start).filter(m=>m.type==='window').map(m=>m.value),start);
  assert.deepEqual(chrome,[{action:'minimize'},{action:'maximize'},{action:'maximize'},{action:'drag'},{action:'resize',edge:11}]);
  await page.evaluate(()=>window.__foliaEmit('windowState',{maximized:true,fullscreen:false}));
  await page.locator('.window-edge').first().waitFor({state:'detached'});
  assert.equal(await page.locator('.window-edge').count(),0);
  await page.evaluate(()=>window.__foliaEmit('windowState',{maximized:false,fullscreen:true}));
  await page.locator('.window-buttons').waitFor({state:'detached'});
  assert.equal(await page.locator('.window-buttons').count(),0);
  await page.evaluate(()=>window.__foliaEmit('windowState',{maximized:false,fullscreen:false}));
  const button=page.locator('.waiting-primary-action');
  await button.hover(); await page.waitForFunction(()=>document.querySelector('.waiting-primary-action')?.style.getPropertyValue('--light-opacity')==='1');
  await page.mouse.move(5,5); assert.equal(await button.evaluate(el=>el.style.getPropertyValue('--light-opacity')),'');
  await page.emulateMedia({reducedMotion:'reduce'}); await button.hover();
  assert.equal(await button.evaluate(el=>el.style.getPropertyValue('--light-opacity')),'');
  assert.equal(await button.evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
  await page.emulateMedia({reducedMotion:'no-preference'}); await page.mouse.move(5,5);
  await page.setViewportSize({width:664,height:411}); await page.screenshot({path:`${output}/welcome-small.png`});
  await page.getByRole('button',{name:'打开歌词设置'}).click(); await page.waitForTimeout(280);
  const panel=page.locator('.control-panel');
  const [a,b]=await Promise.all([panel.boundingBox(),page.locator('.desktop-statusbar').boundingBox()]);
  assert(a&&b&&a.y+a.height<b.y,`Settings must not cover transport at minimum client size: ${JSON.stringify({panel:a,transport:b})}`);
  assert(await panel.evaluate(el=>el.scrollHeight>el.clientHeight));
  const last=page.getByRole('button',{name:'启用鼠标穿透',exact:true}); await last.scrollIntoViewIfNeeded();
  const c=await last.boundingBox(); assert(c&&c.y>=a.y&&c.y+c.height<=a.y+a.height);
  await page.screenshot({path:`${output}/settings-small.png`});
  await page.locator('.desktop-topbar [data-settings-trigger]').click(); await page.setViewportSize({width:1280,height:800});
  console.log('PASS acrylic / glass / minimum-window checks');
  return ['transparent document','native acrylic handshake','solid fallback','high contrast handshake','pointer cleanup','reduced motion','664x411 layout','settings scroll without covering transport','transparent title and icon','native caption and resize commands','fullscreen hides window buttons'];
}
