import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { openVisualSettings, closeVisualSettings, readVisual, waitVisual, visualFrame } from './desktop-visual-fixture.mjs';

// test/verify-desktop-monet-audio.mjs — actual upstream 2D audio canvas consumes the stable GSMTC-spectrum MotionValues.
export async function verifyDesktopMonetAudio(page, output, samples) {
  const panel = await openVisualSettings(page, 'visualizer');
  await panel.locator('[data-visual-mode="monet"]').click(); await waitVisual(page, { mode: 'monet', isPreviewMode: false });
  await page.waitForFunction(() => Boolean(window.__foliaReadResolvedVisualizerProps('monet')));
  await closeVisualSettings(page);
  const canvas = page.locator('.desktop-stage canvas.h-full.w-full'); await canvas.waitFor(); assert.equal(await canvas.count(), 1);
  await page.evaluate(() => {
    const props = window.__foliaReadResolvedVisualizerProps('monet');
    window.__foliaMonetAudioPower = props.audioPower; window.__foliaMonetAudioBands = props.audioBands;
    window.__foliaMonetSpectrum = props.audioBands.spectrum;
    window.__foliaSetMockPreferences({ audioReactive: true });
    window.__foliaVisualSpectrumLevel = 0;
    const send = () => { const bins = new Uint8Array(1024).fill(window.__foliaVisualSpectrumLevel);
      window.__foliaEmit('spectrum', { bins: btoa(String.fromCharCode(...bins)), sampleRate: 48000 }); };
    send(); window.__foliaVisualSpectrumTimer = setInterval(send, 50);
  });
  const pixels = () => canvas.evaluate(canvas => {
    const context = canvas.getContext('2d'); if (!context || !canvas.width || !canvas.height) return null;
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let alpha = 0, visible = 0; for (let index = 3; index < data.length; index += 4) { alpha += data[index]; if (data[index]) visible++; }
    return { width: canvas.width, height: canvas.height, alpha, visible, image: canvas.toDataURL('image/png').split(',')[1] };
  });
  try {
    await visualFrame(page); const low = await pixels(); assert(low && low.alpha > 0, 'the real canvas baseline has nontransparent pixels');
    await page.evaluate(() => { window.__foliaVisualSpectrumLevel = 240; });
    await page.waitForFunction(() => window.__foliaReadResolvedVisualizerProps('monet')?.audioBands.spectrum.get()[100] === 240);
    await visualFrame(page); const high = await pixels(); assert(high && high.alpha > low.alpha * 2, 'the actual high-energy FFT must visibly raise original Monet bars');
    assert(await page.evaluate(() => { const props = window.__foliaReadResolvedVisualizerProps('monet');
      return props.isPreviewMode === false && props.audioPower === window.__foliaMonetAudioPower
        && props.audioBands === window.__foliaMonetAudioBands && props.audioBands.spectrum === window.__foliaMonetSpectrum; }));
    assert.equal(await page.locator('audio,video').count(), 0, 'enabled upstream VideoLayer preferences cannot mount media in the desktop host');
    const { image: lowImage, ...lowMetrics } = low, { image: highImage, ...highMetrics } = high;
    await writeFile(`${output}/visual-monet-audio-low.png`, Buffer.from(lowImage, 'base64'));
    await writeFile(`${output}/visual-monet-audio-high.png`, Buffer.from(highImage, 'base64'));
    samples.push({ context: 'original-monet-live-audio', low: lowMetrics, high: highMetrics, alphaRatio: high.alpha / low.alpha,
      props: await readVisual(page), stableSpectrumReferences: true, mediaElements: 0 });
  } finally {
    await page.evaluate(() => { clearInterval(window.__foliaVisualSpectrumTimer); window.__foliaSetMockPreferences({ audioReactive: false });
      window.__foliaEmit('spectrum', { bins: btoa(String.fromCharCode(...new Uint8Array(1024))), sampleRate: 48000 }); });
    await visualFrame(page);
  }
  return ['original Monet uses live-mode stable spectrum MotionValues and its real 2D canvas rises on FFT input; upstream video preferences introduce no second media clock'];
}
