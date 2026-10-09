import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { isDesktop, send, type MediaAction } from './bridge';

// src/desktopLyrics/useDesktopPlaybackInput.ts
type Options = { root: RefObject<HTMLElement | null>; active: boolean; panel: boolean; clickThrough: boolean;
  playing: boolean; control: (action: MediaAction) => void };
const editing = (target: EventTarget | null) => target instanceof Element && Boolean(
  target.closest('input,textarea,select,[role="combobox"],[role="listbox"],.control-panel,.desktop-glass-menu')
  || target instanceof HTMLElement && target.isContentEditable);
const modified = (event: KeyboardEvent | MouseEvent) => event.ctrlKey || event.altKey || event.metaKey || event.shiftKey;

export function useDesktopPlaybackInput(options: Options) {
  const latest = useRef(options);
  const wheelState = useRef({ remainder: 0, lastWheel: 0 });
  useLayoutEffect(() => {
    if (options.active !== latest.current.active || options.panel !== latest.current.panel || options.clickThrough !== latest.current.clickThrough) {
      wheelState.current.remainder = 0; wheelState.current.lastWheel = 0;
    }
    latest.current = options;
  });
  useEffect(() => {
    const surface = options.root.current;
    if (!surface) return;
    const accumulator = wheelState.current;
    let sidePressed: number | null = null;
    const enabled = () => isDesktop() && latest.current.active && !latest.current.panel && !latest.current.clickThrough
      && !surface.querySelector('.desktop-glass-menu');
    const key = (event: KeyboardEvent) => {
      if (!enabled() || event.defaultPrevented || event.isComposing || event.keyCode === 229 || modified(event) || editing(event.target) || editing(document.activeElement)) return;
      // Focused toolbar controls keep their native keyboard activation; transport buttons retain playback shortcuts.
      if ([event.target, document.activeElement].some(target => target instanceof Element && target.closest('.desktop-topbar-shell button'))) return;
      const action = event.code === 'Space' || event.key === ' ' ? latest.current.playing ? 'pause' : 'play'
        : event.key === 'ArrowLeft' ? 'previous' : event.key === 'ArrowRight' ? 'next' : null;
      if (!action) return;
      event.preventDefault();
      if (!event.repeat) latest.current.control(action);
    };
    // 侧键只在松开时执行一次；三个鼠标事件均拦截默认的浏览器前进/后退。
    const side = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      const paired = sidePressed === event.button;
      if (event.type === 'mousedown' || event.type === 'mouseup') sidePressed = null;
      if (!enabled() || event.defaultPrevented || modified(event) || editing(event.target)) return;
      event.preventDefault();
      if (event.type === 'mousedown') sidePressed = event.button;
      if (event.type === 'mouseup' && paired) latest.current.control(event.button === 3 ? 'previous' : 'next');
    };
    const scrollable = (target: EventTarget | null) => {
      for (let node = target instanceof Element ? target : null; node && node !== surface; node = node.parentElement) {
        if (node.scrollHeight > node.clientHeight && /^(auto|scroll)$/.test(getComputedStyle(node).overflowY)) return true;
      }
      return false;
    };
    // 累积触控板的小幅滚动，反向/停顿即丢弃余量，单事件限幅且不逐帧更新 React。
    const wheel = (event: WheelEvent) => {
      if (!enabled() || event.defaultPrevented || modified(event) || editing(event.target) || scrollable(event.target)
        || !Number.isFinite(event.deltaY) || !Number.isFinite(event.deltaX) || !event.deltaY || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
        accumulator.remainder = 0; accumulator.lastWheel = 0; return;
      }
      event.preventDefault();
      const pixels = event.deltaY * (event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 100 : 1);
      const now = performance.now();
      if (now - accumulator.lastWheel > 250 || Math.sign(pixels) !== Math.sign(accumulator.remainder)) accumulator.remainder = 0;
      accumulator.lastWheel = now; accumulator.remainder += pixels;
      const steps = Math.min(4, Math.floor(Math.abs(accumulator.remainder) / 100));
      if (!steps) return;
      const delta = -Math.sign(accumulator.remainder) * steps;
      accumulator.remainder %= 100;
      send('systemVolume', { delta });
    };
    window.addEventListener('keydown', key);
    surface.addEventListener('mousedown', side); surface.addEventListener('mouseup', side); surface.addEventListener('auxclick', side);
    surface.addEventListener('wheel', wheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', key);
      surface.removeEventListener('mousedown', side); surface.removeEventListener('mouseup', side); surface.removeEventListener('auxclick', side);
      surface.removeEventListener('wheel', wheel); accumulator.remainder = 0; accumulator.lastWheel = 0;
    };
  }, [options.root]);
}
