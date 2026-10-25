import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Runs the bundled models on generated audio against an already-running desktop Vite server.
const browser = await chromium.launch({ executablePath: process.env.FOLIA_CHROMIUM_PATH, headless: true, args: ['--enable-unsafe-webgpu'] });
try {
    const page = await browser.newPage();
    const weights = [];
    page.on('request', request => {
        if (request.url().includes('/analysis-models/') && request.method() === 'GET') weights.push(request.url());
    });
    page.on('console', message => {
        if (/\[(DesktopBeat|DesktopAnalysis|beat-this-gpu|DrumHits|BeatMeter)/.test(message.text())) console.log(message.text());
    });
    page.on('pageerror', error => console.error('[DesktopBeatProbe]', error));
    // Keep the host's Vite preamble but mount only the hook under test, so there is one live beat clock.
    await page.route('**/src/desktopLyrics/main.tsx', route => route.fulfill({ contentType: 'text/javascript', body: 'export {};' }));
    await page.goto(process.env.FOLIA_TEST_URL || 'http://localhost:5175/desktop.html', { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(async () => {
        const module = await import('/src/desktopLyrics/visualFeatures/beat/desktopBeatAnalysis.ts');
        const rate = 22050, seconds = 12, samples = rate * seconds;
        const data = new ArrayBuffer(44 + samples * 2), view = new DataView(data);
        const text = (offset, value) => [...value].forEach((letter, index) => view.setUint8(offset + index, letter.charCodeAt(0)));
        text(0, 'RIFF'); view.setUint32(4, data.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
        view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
        view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
        text(36, 'data'); view.setUint32(40, samples * 2, true);
        let random = 7;
        for (let sample = 0; sample < samples; sample++) {
            const t = sample / rate, beat = t % 0.5, hat = t % 0.25;
            random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
            const noise = random / 0xffffffff * 2 - 1;
            const kick = Math.sin(2 * Math.PI * (55 * beat + 7 * (1 - Math.exp(-beat * 35)))) * Math.exp(-beat * 18) * 0.55;
            const snare = Math.floor(t * 2) % 2 ? noise * Math.exp(-beat * 24) * 0.3 : 0;
            const hihat = noise * Math.exp(-hat * 100) * 0.16;
            const chord = [220, 277.18, 329.63].reduce((sum, hz) => sum + Math.sin(t * hz * 2 * Math.PI), 0) * 0.025;
            view.setInt16(44 + sample * 2, Math.max(-1, Math.min(1, kick + snare + hihat + chord)) * 32767, true);
        }
        const file = new File([data], 'generated-120bpm.wav', { type: 'audio/wav' });
        const errorOf = async promise => { try { await promise; return null; } catch (error) { return error.message; } };
        const rejected = await errorOf(module.analyseDesktopBeatFile('probe-invalid', seconds,
            new File(['not audio'], 'invalid.wav'), new AbortController().signal, () => {}));
        const mismatch = await errorOf(module.analyseDesktopBeatFile('probe-length', 60, file, new AbortController().signal, () => {}));
        const cancelled = new AbortController(); cancelled.abort();
        const aborted = await errorOf(module.analyseDesktopBeatFile('probe-abort', seconds, file, cancelled.signal, () => {}));
        const phase = value => console.info('[DesktopBeatProbe] phase', value);
        const started = performance.now();
        const binding = await module.analyseDesktopBeatFile('probe-generated-song', seconds, file, new AbortController().signal, phase);
        const saved = await module.readDesktopBeatBinding('probe-generated-song');
        const cached = await module.readDesktopBeatEvents(binding.key);
        return { rejected, mismatch, aborted, binding, saved, events: cached.events.length, trackScale: cached.trackScale, elapsedMs: performance.now() - started };
    });
    assert.equal(result.rejected, 'desktopVisual.beatAudioUnsupported');
    assert.equal(result.mismatch, 'desktopVisual.beatDurationMismatch');
    assert(result.aborted);
    assert.deepEqual(result.saved, result.binding);
    assert(result.events > 0, 'The generated rhythm must produce stored beats');
    await page.evaluate(async () => {
        const { mountDesktopBeatHook } = await import('/test/manual/desktopBeatHookProbe.tsx');
        window.__desktopBeatHook = mountDesktopBeatHook('probe-generated-song', 12);
    });
    const ready = () => page.waitForFunction(() => window.__desktopBeatHook.snapshot().ready);
    const snapshot = () => page.evaluate(() => window.__desktopBeatHook.snapshot());
    await ready();
    const cached = await snapshot();
    assert.equal(cached.binding.key, result.binding.key);
    assert.equal(cached.canAnalyse, false);
    assert.equal(cached.eventCount, result.events);
    await page.evaluate(async () => {
        window.__desktopBeatHook.fireFirstBeat();
        await window.__desktopBeatHook.analyse(new File(['must not be read'], 'cached-mode.wav'));
    });
    const cachedFired = await snapshot();
    assert(cachedFired.counts.beats + cachedFired.counts.downbeats > cached.counts.beats + cached.counts.downbeats, 'Cached mode must fire the beat clock');
    await page.evaluate(() => window.__desktopBeatHook.setMode('off'));
    await page.waitForFunction(() => !window.__desktopBeatHook.snapshot().ready && window.__desktopBeatHook.snapshot().eventCount === 0);
    const off = await snapshot();
    assert.equal(off.trackKey, null);
    assert.equal(off.canAnalyse, false);
    await page.evaluate(async () => {
        await window.__desktopBeatHook.analyse(new File(['must not be read'], 'off-mode.wav'));
        window.__desktopBeatHook.setMode('on');
    });
    await ready();
    const on = await snapshot();
    assert.equal(on.canAnalyse, true);
    await page.evaluate(() => window.__desktopBeatHook.fireFirstBeat());
    const onFired = await snapshot();
    assert(onFired.counts.beats + onFired.counts.downbeats > on.counts.beats + on.counts.downbeats, 'On mode must fire the stored beat clock');
    await page.evaluate(() => window.__desktopBeatHook.setIdentity('probe-unanalysed-song'));
    await page.waitForFunction(() => window.__desktopBeatHook.snapshot().binding === null && window.__desktopBeatHook.snapshot().eventCount === 0);
    const changed = await snapshot();
    assert.equal(changed.trackKey, null, 'A new song must not inherit the old binding');
    await page.evaluate(() => {
        window.__desktopBeatHook.setMode('cached');
        window.__desktopBeatHook.setIdentity('probe-generated-song');
    });
    await ready();
    const restored = await snapshot();
    assert.equal(restored.binding.key, result.binding.key);
    await page.evaluate(async () => {
        window.__desktopBeatHook.unmount();
        const module = await import('/src/desktopLyrics/visualFeatures/beat/desktopBeatAnalysis.ts');
        await module.clearDesktopBeatBinding('probe-generated-song');
        if (await module.readDesktopBeatBinding('probe-generated-song')) throw new Error('Binding was not cleared');
    });
    assert.equal(weights.length, 2, 'Only the actual analysis should load the two models');
    console.log('[DesktopBeatProbe] passed', { ...result, weights: weights.length, hookModes: ['cached', 'off', 'on'], songSwitch: true });
} finally {
    await browser.close();
}
