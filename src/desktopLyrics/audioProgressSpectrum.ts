// src/desktopLyrics/audioProgressSpectrum.ts: reduce the host's live FFT into gently blended logarithmic bands.
export const AUDIO_PROGRESS_BARS = 144;

export function spectrumLevels(bins: Uint8Array, sampleRate: number) {
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
  // Blend neighboring bands without generating any signal when the input is silent.
  return result.map((value, i) => ((result[Math.max(0, i - 1)] + value * 2 + result[Math.min(result.length - 1, i + 1)]) / 4)
    * Math.pow(Math.sin(Math.PI * (i + .5) / result.length), .28));
}

export function spectrumPath(levels: Float32Array) {
  return Array.from(levels, (level, i) => `M${((i + .5) * 1000 / levels.length).toFixed(2)} 49V${(47 - Math.min(1, Math.max(0, level)) * 44).toFixed(2)}`).join('');
}

// Preserve the existing attack/decay, then settle below the SVG's 0.01-unit precision so silence stops repainting.
export function smoothSpectrumLevels(levels: Float32Array, target: Float32Array, delta: number) {
  for (let i = 0; i < target.length; i++) {
    const response = 1 - Math.exp(-Math.min(delta, 100) / (target[i] > levels[i] ? 70 : 180));
    const next = levels[i] + (target[i] - levels[i]) * response;
    levels[i] = target[i] === 0 && next < .0001 ? 0 : next;
  }
}
