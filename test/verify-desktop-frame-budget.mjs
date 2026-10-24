import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';
import { installDesktopBridgeMock } from './desktop-bridge-mock.mjs';
import { selectDesktopOption, desktopSelect } from './desktop-select.mjs';
import { openVisualSettings, closeVisualSettings } from './desktop-visual-fixture.mjs';

// test/verify-desktop-frame-budget.mjs — production Motion/Pixi frame budgets, paired main-thread samples and actual canvas backing-store resize observations.
const output = resolve(process.env.FOLIA_UI_OUTPUT || 'test-results/desktop-frame-budget');
await mkdir(output, { recursive: true });
const servers = [];
const mimes = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.otf':'font/otf', '.woff2':'font/woff2' };
// Serve only compiled assets from this test run; no app profile or external server is involved.
async function serve(folder) {
  const root = resolve(folder);
  const server = createServer(async (req,res) => {
    try {
      const file = resolve(root, '.' + new URL(req.url,'http://localhost').pathname);
      if (!file.startsWith(root + sep)) throw Error('path');
      const bytes = await readFile(file); res.writeHead(200,{'Content-Type':mimes[extname(file)]||'application/octet-stream'});res.end(bytes);
    } catch { res.writeHead(404);res.end(); }
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));servers.push(server);
  return 'http://127.0.0.1:'+server.address().port+'/desktop.html';
}
const currentUrl = await serve('dist-desktop');
const beforeUrl = process.env.FOLIA_BASELINE_DIST ? await serve(process.env.FOLIA_BASELINE_DIST) : null;
const browser = await chromium.launch({headless:true,executablePath:process.env.FOLIA_CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']});
const errors=[], samples=[], checks=[], budgets=[], resizes=[];
const song={key:'fps-fixture',title:'帧率与缩放验证',artist:'模拟播放器',source:'fixture',cover:'',playing:true,hasTimeline:true,position:36,duration:180,rate:1,sessionId:'fixture',sources:[],controls:{play:true,pause:true,toggle:true,previous:true,next:true}};
const packet={key:song.key,title:song.title,artist:song.artist,cover:'',source:'fixture',embedded:false,format:'lrc',content:'[00:01.000]窗口性能验证\n[00:33.000]持续播放保持同步\n[01:20.000]缩放后继续显示'};
const emit=async page=>page.evaluate(({song,packet})=>{window.__foliaEmit('session',song);window.__foliaEmit('lyrics',packet);},{song,packet});
// Each sample gets an independent browser context and the production desktop bridge fixture.
async function fixture(url) {
  const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await installDesktopBridgeMock(page);
  await page.addInitScript(()=>{
    window.__physicalRaf=requestAnimationFrame.bind(window);window.__physicalCancel=cancelAnimationFrame.bind(window);
    localStorage.setItem('folia.desktop.mode.v1','classic');
    sessionStorage.setItem('folia.test.mockPreferences',JSON.stringify({autoImmersive:false,audioReactive:false,coverTheme:false}));
  });
  await page.goto(url,{waitUntil:'networkidle'});await page.locator('.waiting-screen h1').waitFor();
  await emit(page);await page.locator('.waiting-screen').waitFor({state:'detached'});await page.waitForTimeout(800);
  return {context,page};
}
// Probe the real public RAF gate alongside the physical refresh clock; both get the browser's actual timestamps.
async function budget(page,ms=1000) {
  return page.evaluate(ms=>new Promise(done=>{
    let gated=0,physical=0,gatedHandle,physicalHandle;
    const start=performance.now();
    const draw=()=>{gated++;gatedHandle=requestAnimationFrame(draw);};
    const raw=()=>{physical++;physicalHandle=window.__physicalRaf(raw);};
    gatedHandle=requestAnimationFrame(draw);physicalHandle=window.__physicalRaf(raw);
    setTimeout(()=>{cancelAnimationFrame(gatedHandle);window.__physicalCancel(physicalHandle);const elapsed=performance.now()-start;done({gatedFps:gated*1000/elapsed,physicalFps:physical*1000/elapsed});},ms);
  }),ms);
}
const metrics=async cdp=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(row=>[row.name,row.value]));
try {
  if(beforeUrl) for(let trial=0;trial<5;trial++) for(const label of trial%2?['after','before']:['before','after']) {
    const {page,context}=await fixture(label==='before'?beforeUrl:currentUrl),cdp=await context.newCDPSession(page);
    await cdp.send('Performance.enable');const first=await metrics(cdp),rate=await budget(page,1500),last=await metrics(cdp);
    samples.push({trial:trial+1,label,...rate,scriptMs:1000*(last.ScriptDuration-first.ScriptDuration),taskMs:1000*(last.TaskDuration-first.TaskDuration)});
    console.log('PASS paired',JSON.stringify(samples.at(-1)));await context.close();
  }
  const {page,context}=await fixture(currentUrl);
  assert.equal(await page.evaluate(()=>localStorage.getItem('visualizer_frame_rate')),'60');
  await openVisualSettings(page,'common');
  for(const value of ['60','90','120','off','60']) {
    await selectDesktopOption(page,'动画帧率上限',{value});
    const sample=await budget(page,800),limit=value==='off'?sample.physicalFps:Number(value);
    assert(sample.gatedFps<=Math.min(limit,sample.physicalFps)+5,JSON.stringify({value,...sample}));
    assert(sample.gatedFps>=Math.min(limit,sample.physicalFps)*.7,JSON.stringify({value,...sample}));
    budgets.push({value,...sample});
  }
  assert.equal(await desktopSelect(page,'动画帧率上限').getAttribute('data-value'),'60');
  await closeVisualSettings(page);checks.push('default 60 FPS, live 60/90/120/display switching and callback cancellation');
  await page.evaluate(song=>window.__foliaEmit('session',{...song,playing:false,position:50}),song);
  await page.waitForTimeout(3000);
  await page.evaluate(song=>window.__foliaEmit('clock',{...song,playing:false,position:51}),song);
  await page.waitForFunction(()=>document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')==='51');
  await page.evaluate(song=>window.__foliaEmit('session',{...song,playing:true,position:51}),song);
  await page.waitForFunction(()=>Number(document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow'))>=52);
  checks.push('pause/idle, synchronous seek and resume still follow host time');
  for(const mode of ['lumiere','sonnet','tempera']) {
    await selectDesktopOption(page,'歌词样式',{value:mode});
    await page.locator('.desktop-stage canvas').waitFor({timeout:60000});await page.waitForTimeout(1000);
    await page.evaluate(()=>{
      const canvas=document.querySelector('.desktop-stage canvas');window.__canvasProbe=canvas;window.__canvasResizes=[];
      window.__canvasObserver=new MutationObserver(records=>{for(const record of records)if(record.attributeName==='width')window.__canvasResizes.push({width:canvas.width,height:canvas.height,at:performance.now()});});
      window.__canvasObserver.observe(canvas,{attributes:true,attributeFilter:['width','height']});
    });
    for(let step=0;step<24;step++) {
      await page.setViewportSize({width:1000+step*10,height:620+step*5});
      const fit=await page.locator('.desktop-stage canvas').evaluate(canvas=>{
        const rect=canvas.getBoundingClientRect(),host=canvas.parentElement.getBoundingClientRect();
        return Math.abs(rect.width-host.width)<1 && Math.abs(rect.height-host.height)<1;
      });
      assert(fit,mode+' canvas fills its host throughout the drag');
    }
    await page.waitForTimeout(450);
    const result=await page.evaluate(()=>{
      const canvas=document.querySelector('.desktop-stage canvas'),rect=canvas.getBoundingClientRect();
      window.__canvasObserver.disconnect();
      return {sameCanvas:canvas===window.__canvasProbe,allocations:window.__canvasResizes.length,backingWidth:canvas.width,backingHeight:canvas.height,width:rect.width,height:rect.height,records:window.__canvasResizes};
    });
    assert(result.sameCanvas,mode+' kept its runtime/canvas');assert(result.allocations<12,mode+': '+JSON.stringify(result));
    assert(Math.abs(result.backingWidth/result.backingHeight-result.width/result.height)<.02,mode+' backing surface matches final aspect');
    assert.equal(await page.getByText('这个动效暂时无法显示',{exact:false}).count(),0);
    await page.screenshot({path:resolve(output,mode+'-resized.png')});
    resizes.push({mode,...result});await page.setViewportSize({width:1280,height:800});
  }
  checks.push('Lumiere/Sonnet/Tempera keep their canvas while edge dragging and allocate a settled backing surface');
  await page.reload({waitUntil:'networkidle'});assert.equal(await page.evaluate(()=>localStorage.getItem('visualizer_frame_rate')),'60');
  checks.push('frame-rate choice persists through reload');await context.close();
  assert.equal(errors.length,0,errors.join('\n'));
  const summary={};
  for(const label of ['before','after'])summary[label]=Object.fromEntries(['scriptMs','taskMs','gatedFps','physicalFps'].map(key=>{
    const rows=samples.filter(row=>row.label===label).map(row=>row[key]).sort((a,b)=>a-b);return [key,rows.length?{median:rows[Math.floor(rows.length/2)],min:rows[0],max:rows.at(-1)}:null];
  }));
  await writeFile(resolve(output,'results.json'),JSON.stringify({scope:'Isolated real Chromium production pages. Paired classic playback main-thread work and RAF budget; not whole-process CPU/memory or native DWM drag/restore.',checks,budgets,resizes,samples,summary,errors},null,2));
  console.log('PASS frame-budget integration',JSON.stringify({checks,budgets,resizes:resizes.map(({records,...result})=>result),summary}));
} finally {await browser.close();await Promise.all(servers.map(server=>new Promise(done=>server.close(done))));}
