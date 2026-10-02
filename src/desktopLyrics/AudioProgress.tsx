import { useEffect, useId, useRef, type RefObject } from 'react';
import { useMotionValueEvent, type MotionValue } from 'framer-motion';
import i18n from '../i18n/config';
import { timeLabel } from './clock';
import { AUDIO_PROGRESS_BARS, spectrumLevels, spectrumPath } from './audioProgressSpectrum';
import './audio-progress.css';

// src/desktopLyrics/AudioProgress.tsx: live output spectrum plus read-only, unshifted media progress.
export default function AudioProgress({ time, duration, spectrum, input, playing, unavailable }: {
  time: MotionValue<number>; duration: number; spectrum: MotionValue<Uint8Array<ArrayBuffer>>;
  input: RefObject<{ sampleRate: number }>; playing: boolean; unavailable: boolean;
}) {
  const root = useRef<HTMLDivElement>(null), clip = useRef<SVGRectElement>(null), line = useRef<SVGLineElement>(null), bars = useRef<SVGPathElement>(null);
  const levels = useRef(new Float32Array(AUDIO_PROGRESS_BARS)), lastFrame = useRef(0), lastSecond = useRef(-1);
  const id = useId().replace(/:/g, ''), known = !unavailable && Number.isFinite(duration) && duration > 0;
  const update = (value: number) => {
    const position = known && Number.isFinite(value) ? Math.min(duration, Math.max(0, value)) : 0;
    const x = known ? position / duration * 1000 : 0;
    clip.current?.setAttribute('width', String(x)); line.current?.setAttribute('x2', String(x));
    if (root.current && Math.floor(position) !== lastSecond.current) {
      lastSecond.current = Math.floor(position);
      if (known) root.current.setAttribute('aria-valuenow', String(Math.round(position)));
      else root.current.removeAttribute('aria-valuenow');
      root.current.setAttribute('aria-valuetext', known ? `${timeLabel(position)} / ${timeLabel(duration)}` : i18n.t('desktopLyrics.noProgress', { lng: 'zh-CN' }));
    }
  };
  useMotionValueEvent(time, 'change', update);
  useEffect(() => { lastSecond.current = -1; update(time.get()); }, [time, duration, known]);
  // The existing runtime owns the animation loop; update SVG at most 30 times/second without React frame state.
  useMotionValueEvent(spectrum, 'change', bins => {
    const now = performance.now(), delta = now - lastFrame.current;
    if (delta < 33) return;
    lastFrame.current = now;
    // A settled silent spectrum already has the exact initial SVG; preserve nonzero decay without rebuilding it.
    if ((!playing || !bins.some(value => value !== 0)) && levels.current.every(value => value === 0)) return;
    const target = playing ? spectrumLevels(bins, input.current.sampleRate) : new Float32Array(AUDIO_PROGRESS_BARS);
    for (let i = 0; i < target.length; i++) {
      const response = 1 - Math.exp(-Math.min(delta, 100) / (target[i] > levels.current[i] ? 70 : 180));
      levels.current[i] += (target[i] - levels.current[i]) * response;
    }
    bars.current?.setAttribute('d', spectrumPath(levels.current));
    root.current?.setAttribute('data-energy', Math.max(...levels.current).toFixed(3));
  });
  const label = i18n.t('desktopLyrics.audioProgress', { lng: 'zh-CN' });
  return <div ref={root} className={`audio-progress ${known ? '' : 'unknown-progress'}`} role="progressbar" aria-label={label} data-energy="0.000"
    aria-valuemin={0} aria-valuemax={known ? duration : undefined} title={i18n.t('desktopLyrics.audioProgressHint', { lng: 'zh-CN' })}>
    <svg viewBox="0 0 1000 50" preserveAspectRatio="none" aria-hidden="true">
      <defs><clipPath id={`${id}-clip`}><rect ref={clip} x="0" y="0" width="0" height="50"/></clipPath>
        <path ref={bars} id={`${id}-bars`} d={spectrumPath(new Float32Array(AUDIO_PROGRESS_BARS))}/></defs>
      <use className="spectrum-remaining" href={`#${id}-bars`}/><use className="spectrum-played" href={`#${id}-bars`} clipPath={`url(#${id}-clip)`}/>
      <line className="progress-track" x1="0" x2="1000" y1="49" y2="49"/>
      <line ref={line} className="progress-played" x1="0" x2="0" y1="49" y2="49"/>
    </svg>
  </div>;
}
