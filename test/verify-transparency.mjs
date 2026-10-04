import assert from 'node:assert/strict';

// test/verify-transparency.mjs: validate transparency UI independently of the native compositor.
export async function verifyTransparency(page, output) {
  const emit = (type,data)=>page.evaluate(({type,data})=>window.__foliaEmit(type,data),{type,data});
  await page.getByRole('button',{name:'打开歌词设置'}).click();
  const toggle=page.getByRole('checkbox',{name:'播放页面透明背景'});
  await toggle.check(); await page.locator('.transparent-background').waitFor();
  assert.equal(await page.locator('.acrylic-backdrop').count(),0,'remove all desktop backdrop layers');
  const veil = await page.locator('.transparent-veil').evaluate(el => {
    const reference = document.createElement('span'); reference.style.background = 'color-mix(in srgb,var(--theme-bg) 20%,transparent)';
    el.append(reference); const expected = getComputedStyle(reference).backgroundColor; reference.remove();
    return { actual: getComputedStyle(el).backgroundColor, expected };
  });
  assert.equal(veil.actual, veil.expected, 'the readability veil follows the active theme background');
  assert.match(veil.actual, /(?:,\s*0\.2\)|\/\s*0\.2\))$/, 'the readability veil retains exactly 20% alpha');
  assert.equal(await page.locator('.desktop-stage').evaluate(el=>getComputedStyle(el).opacity),'1','do not fade the lyric foreground');
  await page.locator('.desktop-topbar [data-settings-trigger]').click();
  await emit('windowState',{maximized:false,fullscreen:true,clickThrough:false});
  await page.locator('.window-buttons').waitFor({state:'detached'});
  assert.equal(await page.locator('.transparent-background').count(),1);
  await emit('windowState',{maximized:false,fullscreen:true,clickThrough:true});
  await page.locator('.desktop-lyrics.immersive').waitFor();
  assert.equal(await page.locator('.control-panel').count(),0);
  await page.screenshot({path:`${output}/transparent-immersive.png`});
  await emit('windowState',{maximized:false,fullscreen:false,clickThrough:false}); await emit('restore',{});
  await page.locator('.desktop-lyrics.immersive').waitFor({state:'detached'});
  assert.equal(await page.locator('.transparent-background').count(),1,'restore interaction keeps chosen transparency');
  await page.getByRole('button',{name:'打开歌词设置'}).click();
  assert(await toggle.isChecked()); await toggle.uncheck();
  await page.locator('.transparent-background').waitFor({state:'detached'});
  assert.equal(await page.locator('.acrylic-backdrop').count(),1);
  await page.locator('.desktop-topbar [data-settings-trigger]').click();
  const commands=await page.evaluate(()=>window.__foliaCommands);
  assert(commands.some(m=>m.type==='transparentBackground'&&m.value===true));
  assert(commands.some(m=>m.type==='transparentBackground'&&m.value===false));
  await emit('appearance',{acrylic:false,transparent:false,solid:true,highContrast:true});
  assert.equal(await page.locator('.transparent-veil').count(),0,'honor native high-contrast fallback');
  await emit('appearance',{acrylic:false,solid:false,highContrast:false});
  console.log('PASS transparent background / interaction restoration checks');
  return ['transparent setting commands','desktop backdrop removed','readability veil without lyric fading','fullscreen stays transparent','click-through hides chrome','restore retains setting','acrylic restored when off','high-contrast fallback'];
}
