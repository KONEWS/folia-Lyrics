import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_PROGRESS_BARS, smoothSpectrumLevels, spectrumLevels, spectrumPath } from '../../../src/desktopLyrics/audioProgressSpectrum';

// test/unit/desktop/audioProgressSpectrumEquivalence.test.ts — the cached band layout and shared response factors must not change a single bit
// of what the progress spectrum draws. The two functions below are the previous implementation, kept only as the oracle.
afterEach(() => { vi.restoreAllMocks(); });

function legacySpectrumLevels(bins: Uint8Array, sampleRate: number) {
  const result = new Float32Array(AUDIO_PROGRESS_BARS);
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || !bins.length) return result;
  const hz = sampleRate / (bins.length * 2), maxHz = Math.min(16000, sampleRate / 2);
  for (let i = 0; i < result.length; i++) {
    const start = Math.max(1, Math.floor(40 * Math.pow(maxHz / 40, i / result.length) / hz));
    const end = Math.min(bins.length - 1, Math.max(start, Math.ceil(40 * Math.pow(maxHz / 40, (i + 1) / result.length) / hz)));
    let sum = 0;
    for (let j = start; j <= end; j++) sum += bins[j] / 255;
    result[i] = Math.pow(sum / Math.max(1, end - start + 1), 1.4);
  }
  return result.map((value, i) => ((result[Math.max(0, i - 1)] + value * 2 + result[Math.min(result.length - 1, i + 1)]) / 4)
    * Math.pow(Math.sin(Math.PI * (i + .5) / result.length), .28));
}
function legacySmooth(levels: Float32Array, target: Float32Array, delta: number) {
  for (let i = 0; i < target.length; i++) {
    const response = 1 - Math.exp(-Math.min(delta, 100) / (target[i] > levels[i] ? 70 : 180));
    const next = levels[i] + (target[i] - levels[i]) * response;
    levels[i] = target[i] === 0 && next < .0001 ? 0 : next;
  }
}
// Compare raw bit patterns, so -0, NaN payloads and last-bit differences all count.
const bits = (values: Float32Array) => Array.from(new Uint32Array(values.buffer, values.byteOffset, values.length));
const seeded = (seed: number) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

describe('audio progress spectrum equivalence', () => {
  it('maps spectra to exactly the same bar levels and SVG as before across sample rates, bin counts and signals', () => {
    const random = seeded(1234);
    // Real device rates plus degenerate but finite ones: tiny rates push bin indices past 32 bits and into infinity, huge ones collapse every bar onto bin 1.
    const rates = [8000, 11025, 16000, 22050, 32000, 44100, 48000, 88200, 96000, 176400, 192000, 1, 79.9, 80, 1e-3, 1e9, 48000.5,
      1e-6, 1e-9, 1e-12, 1e-300, Number.MIN_VALUE, Number.MAX_VALUE];
    const counts = [1, 2, 3, 7, 64, 512, 1000, 1024, 1025, 2048, 4096];
    let compared = 0;
    for (const rate of rates) for (const count of counts) {
      const signals = [new Uint8Array(count), new Uint8Array(count).fill(255), Uint8Array.from({ length: count }, () => Math.floor(random() * 256)),
        Uint8Array.from({ length: count }, (_, i) => (i % 7 === 0 ? 255 : 0)), Uint8Array.from({ length: count }, (_, i) => Math.min(255, Math.floor(255 * Math.exp(-i / 90))))];
      for (const bins of signals) {
        const expected = legacySpectrumLevels(bins, rate), actual = spectrumLevels(bins, rate);
        expect(bits(actual)).toEqual(bits(expected));
        expect(spectrumPath(actual)).toBe(spectrumPath(expected));
        compared++;
      }
    }
    expect(compared).toBe(rates.length * counts.length * 5);
  });

  it('keeps invalid input silent and unchanged', () => {
    for (const rate of [NaN, 0, -48000, Infinity, -Infinity]) {
      expect(bits(spectrumLevels(new Uint8Array(1024).fill(255), rate))).toEqual(bits(legacySpectrumLevels(new Uint8Array(1024).fill(255), rate)));
      expect([...spectrumLevels(new Uint8Array(1024).fill(255), rate)].every(value => value === 0)).toBe(true);
    }
    expect([...spectrumLevels(new Uint8Array(), 48000)].every(value => value === 0)).toBe(true);
  });

  it('does not leak state between calls when the sample rate or bin count changes back and forth', () => {
    const random = seeded(99);
    const configs: [number, number][] = [[48000, 1024], [44100, 1024], [48000, 512], [48000, 1024], [96000, 2048], [44100, 1024], [48000, 1024]];
    for (let round = 0; round < 6; round++) for (const [rate, count] of configs) {
      const bins = Uint8Array.from({ length: count }, () => Math.floor(random() * 256));
      expect(bits(spectrumLevels(bins, rate))).toEqual(bits(legacySpectrumLevels(bins, rate)));
    }
  });

  it('never hands out a table that a caller could corrupt: results are fresh arrays and mutating one changes nothing later', () => {
    const bins = new Uint8Array(1024).fill(200);
    const first = spectrumLevels(bins, 48000), second = spectrumLevels(bins, 48000);
    expect(first).not.toBe(second);
    first.fill(123);
    expect(bits(spectrumLevels(bins, 48000))).toEqual(bits(legacySpectrumLevels(bins, 48000)));
  });

  it('smooths attack, decay, pause and silence frame by frame exactly like before, for awkward frame deltas', () => {
    const random = seeded(7);
    const deltas = [0, 1, 8.3, 16.7, 33, 33.4, 99.9, 100, 100.1, 250, 5000, -5, NaN, Infinity];
    for (const delta of deltas) {
      const actual = new Float32Array(AUDIO_PROGRESS_BARS), expected = new Float32Array(AUDIO_PROGRESS_BARS);
      for (let frame = 0; frame < 200; frame++) {
        const phase = frame % 80;                   // 0-29 attack on live audio, 30-49 decay on a quieter target, 50-79 silence
        const target = phase < 30 ? spectrumLevels(Uint8Array.from({ length: 1024 }, () => Math.floor(random() * 256)), 48000)
          : phase < 50 ? spectrumLevels(Uint8Array.from({ length: 1024 }, () => Math.floor(random() * 40)), 48000) : new Float32Array(AUDIO_PROGRESS_BARS);
        smoothSpectrumLevels(actual, target, delta); legacySmooth(expected, target, delta);
        expect(bits(actual)).toEqual(bits(expected));
      }
      expect(spectrumPath(actual)).toBe(spectrumPath(expected));
    }
  });

  it('settles silence to exact zeros on the same frame as before', () => {
    const actual = new Float32Array(AUDIO_PROGRESS_BARS).fill(1), expected = new Float32Array(AUDIO_PROGRESS_BARS).fill(1), silent = new Float32Array(AUDIO_PROGRESS_BARS);
    let settledAt = -1, expectedSettledAt = -1;
    for (let frame = 0; frame < 300; frame++) {
      smoothSpectrumLevels(actual, silent, 1000 / 60); legacySmooth(expected, silent, 1000 / 60);
      if (settledAt < 0 && actual.every(value => value === 0)) settledAt = frame;
      if (expectedSettledAt < 0 && expected.every(value => value === 0)) expectedSettledAt = frame;
    }
    expect(settledAt).toBeGreaterThan(0);
    expect(settledAt).toBe(expectedSettledAt);
  });

  it('avoids the redundant arithmetic: no band-range pow after the first call, two exp calls per smoothing frame instead of one per bar', () => {
    const bins = new Uint8Array(1024).fill(90), levels = new Float32Array(AUDIO_PROGRESS_BARS), target = spectrumLevels(bins, 48000);
    spectrumLevels(bins, 48000);                     // warm the layout for this sample rate and bin count
    const pow = vi.spyOn(Math, 'pow'), exp = vi.spyOn(Math, 'exp');
    spectrumLevels(bins, 48000);
    const warmPow = pow.mock.calls.length;
    pow.mockClear();
    legacySpectrumLevels(bins, 48000);
    const legacyPow = pow.mock.calls.length;
    smoothSpectrumLevels(levels, target, 33);
    expect(legacyPow).toBe(576);
    expect(warmPow).toBe(AUDIO_PROGRESS_BARS);       // only the signal-dependent 1.4 power per bar remains
    expect(exp.mock.calls.length).toBe(2);
  });
});
