import assert from 'node:assert/strict';

// test/verify-audio-progress.mjs: exercise live audio, progress, settings, and cleanup through the mocked host.
export async function verifyAudioProgress(page, song, output) {
  const emit = (type, data) => page.evaluate(({type,data}) => window.__foliaEmit(type,data), {type,data});
  const bar = page.getByRole('progressbar', {name:'音频可视化与播放进度'});
  await emit('session', {...song, playing:false, position:36});
  await emit('clock', {...song, playing:false, position:36});
  await bar.waitFor();
  await page.waitForFunction(()=>document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')==='36');
  assert.equal(await page.locator('.waveform-progress').count(),0);
  await page.getByRole('button',{name:'打开歌词设置'}).click();
  await page.getByRole('button',{name:'歌词提前 0.2 秒'}).click();
  assert.equal(await bar.getAttribute('aria-valuenow'),'36');
  await page.getByRole('button',{name:'重置歌词偏移'}).click();
  await page.getByRole('checkbox',{name:'跟随系统声音变化'}).check();
  const toggle=page.getByRole('checkbox',{name:'沉浸模式显示进度条'});
  await toggle.uncheck(); await page.getByRole('button',{name:'关闭设置'}).click();
  await page.getByRole('button',{name:'沉浸显示'}).click();
  assert.equal(await page.getByRole('progressbar').count(),0);
  await page.getByRole('button',{name:'显示控制栏'}).click();
  await page.getByRole('button',{name:'打开歌词设置'}).click(); await toggle.check();
  assert.equal(await page.evaluate(()=>localStorage.getItem('folia.desktop.immersiveProgress.v1')),'true');
  await page.getByRole('button',{name:'关闭设置'}).click();
  await emit('session',{...song,playing:true,position:36});
  await page.evaluate(()=>{
    const bins=Uint8Array.from({length:1024},(_,i)=> Math.round(240*Math.exp(-i/430)));
    const data={bins:btoa(String.fromCharCode(...bins)),sampleRate:48000};
    window.__foliaSpectrumTimer=setInterval(()=>window.__foliaEmit('spectrum',data),50);
  });
  const raised=()=>page.waitForFunction(()=>Number(document.querySelector('.audio-progress')?.dataset.energy)>.4);
  const flat=()=>page.waitForFunction(()=>Number(document.querySelector('.audio-progress')?.dataset.energy)<.01);
  await raised(); await page.screenshot({path:`${output}/audio-glass.png`});
  await emit('session',{...song,playing:false,position:36}); await flat();
  await emit('session',{...song,playing:true,position:36}); await raised();
  await page.getByRole('button',{name:'打开歌词设置'}).click();
  await page.getByRole('checkbox',{name:'跟随系统声音变化'}).uncheck(); await flat();
  await page.getByRole('checkbox',{name:'跟随系统声音变化'}).check(); await raised();
  await page.getByRole('button',{name:'关闭设置'}).click();
  await page.getByRole('button',{name:'沉浸显示'}).click(); await raised();
  await page.screenshot({path:`${output}/immersive-audio-progress.png`});
  await page.evaluate(()=>clearInterval(window.__foliaSpectrumTimer)); await flat();
  await emit('session',{...song,playing:false,position:15});
  await emit('clock',{...song,playing:false,position:15});
  await page.waitForFunction(()=>document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')==='15');
  await emit('clock',{...song,playing:false,position:song.duration+20});
  await page.waitForFunction(duration=>document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')===String(Math.round(duration)),song.duration);
  await emit('session',{...song,hasTimeline:false});
  await page.waitForFunction(()=>!document.querySelector('[role=progressbar]')?.hasAttribute('aria-valuenow'));
  await page.getByRole('button',{name:'显示控制栏'}).click();
  await emit('session',{...song,playing:false,position:36});
  assert.equal(await page.locator('audio,video').count(),0);
  console.log('PASS live audio progress / immersion checks');
  return ['old waveform removed','unshifted progress','immersive on/off and persistence','live FFT bars','pause settles bars','audio reactive off/on','stale input settles bars','backward seek','clamped progress','unknown timeline','no audio output'];
}
