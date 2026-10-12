// src/desktopLyrics/audioProgressSpectrum.ts: reduce the host's live FFT into gently blended logarithmic bands.
export const AUDIO_PROGRESS_BARS = 144;

// Which FFT bins each bar averages depends only on the sample rate and the number of bins, never on the signal, and so does the sine
// taper of the outer bars. Both are computed once and reused until the sample rate or bin count changes (the sample rate is constant
// for a device). The stored values are the same doubles the per-call arithmetic produced; Float64Array keeps integers exact and
// preserves Infinity/NaN for degenerate inputs instead of truncating them like an Int32Array would.
type BandLayout = { sampleRate: number; binCount: number; starts: Float64Array; ends: Float64Array; counts: Float64Array };
let layout: BandLayout | null = null;
let taper: Float64Array | null = null;

function bandLayout(sampleRate: number, binCount: number): BandLayout {
  if (layout && layout.sampleRate === sampleRate && layout.binCount === binCount) return layout;
  const hz = sampleRate / (binCount * 2), maxHz = Math.min(16000, sampleRate / 2);
  const starts = new Float64Array(AUDIO_PROGRESS_BARS), ends = new Float64Array(AUDIO_PROGRESS_BARS), counts = new Float64Array(AUDIO_PROGRESS_BARS);
  for (let i = 0; i < AUDIO_PROGRESS_BARS; i++) {
    const start = Math.max(1, Math.floor(40 * Math.pow(maxHz / 40, i / AUDIO_PROGRESS_BARS) / hz));
    const end = Math.min(binCount - 1, Math.max(start, Math.ceil(40 * Math.pow(maxHz / 40, (i + 1) / AUDIO_PROGRESS_BARS) / hz)));
    starts[i] = start; ends[i] = end; counts[i] = Math.max(1, end - start + 1);
  }
  return layout = { sampleRate, binCount, starts, ends, counts };
}

function barTaper(): Float64Array {
  if (taper) return taper;
  const values = new Float64Array(AUDIO_PROGRESS_BARS);
  for (let i = 0; i < AUDIO_PROGRESS_BARS; i++) values[i] = Math.pow(Math.sin(Math.PI * (i + .5) / AUDIO_PROGRESS_BARS), .28);
  return taper = values;
}

export function spectrumLevels(bins: Uint8Array, sampleRate: number) {
  const result = new Float32Array(AUDIO_PROGRESS_BARS);
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || !bins.length) return result;
  const { starts, ends, counts } = bandLayout(sampleRate, bins.length);
  for (let i = 0; i < result.length; i++) {
    let sum = 0;
    for (let j = starts[i]; j <= ends[i]; j++) sum += bins[j] / 255;
    result[i] = Math.pow(sum / counts[i], 1.4);
  }
  // Blend neighboring bands without generating any signal when the input is silent.
  const bandTaper = barTaper();
  return result.map((value, i) => ((result[Math.max(0, i - 1)] + value * 2 + result[Math.min(result.length - 1, i + 1)]) / 4)
    * bandTaper[i]);
}

export function spectrumPath(levels: Float32Array) {
  return Array.from(levels, (level, i) => `M${((i + .5) * 1000 / levels.length).toFixed(2)} 49V${(47 - Math.min(1, Math.max(0, level)) * 44).toFixed(2)}`).join('');
}

// Preserve the existing attack/decay, then settle below the SVG's 0.01-unit precision so silence stops repainting.
// Both response factors depend only on the frame delta, so they are computed once per call instead of once per bar.
export function smoothSpectrumLevels(levels: Float32Array, target: Float32Array, delta: number) {
  const step = Math.min(delta, 100), attack = 1 - Math.exp(-step / 70), decay = 1 - Math.exp(-step / 180);
  for (let i = 0; i < target.length; i++) {
    const response = target[i] > levels[i] ? attack : decay;
    const next = levels[i] + (target[i] - levels[i]) * response;
    levels[i] = target[i] === 0 && next < .0001 ? 0 : next;
  }
}
