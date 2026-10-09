import { describe, expect, it } from 'vitest';
import { AUDIO_PROGRESS_BARS, smoothSpectrumLevels, spectrumLevels, spectrumPath } from '../src/desktopLyrics/audioProgressSpectrum';

// test/audioProgressSpectrum.test.ts: ensure live bands never invent sound and map frequencies consistently.
describe('audio progress spectrum', () => {
  it('keeps silence and invalid sample rates silent', () => {
    expect([...spectrumLevels(new Uint8Array(1024), 48000)].every(n => n === 0)).toBe(true);
    expect([...spectrumLevels(new Uint8Array(1024).fill(255), NaN)].every(n => n === 0)).toBe(true);
    expect([...spectrumLevels(new Uint8Array(), 48000)].every(n => n === 0)).toBe(true);
  });
  it('maps a real low-frequency tone to the left and a high-frequency tone to the right', () => {
    const low = new Uint8Array(1024), high = new Uint8Array(1024);
    low[4] = 255; high[400] = 255;
    const a = spectrumLevels(low, 48000), b = spectrumLevels(high, 48000);
    expect(a.indexOf(Math.max(...a))).toBeLessThan(AUDIO_PROGRESS_BARS / 2);
    expect(b.indexOf(Math.max(...b))).toBeGreaterThan(AUDIO_PROGRESS_BARS / 2);
    expect(Math.max(...a)).toBeGreaterThan(0); expect(Math.max(...b)).toBeGreaterThan(0);
  });
  it('bounds full-scale audio and generates one rounded stroke per band', () => {
    const levels = spectrumLevels(new Uint8Array(1024).fill(255), 44100);
    expect(levels.length).toBe(AUDIO_PROGRESS_BARS);
    expect([...levels].every(n => Number.isFinite(n) && n >= 0 && n <= 1)).toBe(true);
    expect(spectrumPath(levels).match(/M/g)?.length).toBe(AUDIO_PROGRESS_BARS);
    expect(spectrumPath(levels)).not.toMatch(/NaN|Infinity/);
  });
  it('settles silent decay without changing the visible rounded SVG and resumes immediately', () => {
    const levels = new Float32Array(AUDIO_PROGRESS_BARS).fill(1), silent = new Float32Array(AUDIO_PROGRESS_BARS);
    for (let frame = 0; frame < 90; frame++) {
      const before = levels[0];
      smoothSpectrumLevels(levels, silent, 1000 / 30);
      if (before > 0 && levels[0] === 0) {
        const unsnapped = new Float32Array(AUDIO_PROGRESS_BARS).fill(before * Math.exp(-(1000 / 30) / 180));
        expect(spectrumPath(levels)).toBe(spectrumPath(unsnapped));
      }
    }
    expect([...levels].every(value => value === 0)).toBe(true);
    smoothSpectrumLevels(levels, new Float32Array(AUDIO_PROGRESS_BARS).fill(1), 1000 / 30);
    expect(levels[0]).toBeCloseTo(1 - Math.exp(-(1000 / 30) / 70), 6);
  });
});
