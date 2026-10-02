import { useLayoutEffect, type RefObject } from 'react';
import { playerBottomBarLiveOffset } from '../stores/motionSignals';
import { usePlayerChromeSettingsStore } from '../stores/usePlayerChromeSettingsStore';
import { PLAYER_BOTTOM_BAR_BASE_OFFSET_PX, PLAYER_BOTTOM_BAR_SUBTITLE_CLEARANCE_PX } from '../utils/playerBottomBarLayout';

// src/desktopLyrics/useDesktopSubtitleLayout.ts
export function useDesktopSubtitleLayout(root: RefObject<HTMLElement | null>, footer: RefObject<HTMLElement | null>, visible: boolean) {
  useLayoutEffect(() => {
    const offset = playerBottomBarLiveOffset.get(), hidden = usePlayerChromeSettingsStore.getState().hidePlayerProgressBar;
    return () => {
      playerBottomBarLiveOffset.set(offset);
      usePlayerChromeSettingsStore.setState({ hidePlayerProgressBar: hidden });
    };
  }, []);
  useLayoutEffect(() => {
    const surface = root.current, bar = footer.current;
    if (!surface || !bar) return;
    if (usePlayerChromeSettingsStore.getState().hidePlayerProgressBar !== !visible) {
      usePlayerChromeSettingsStore.setState({ hidePlayerProgressBar: !visible });
    }
    // 实际底栏几何驱动原版字幕的共享净空；只更新 MotionValue，不改变整幅渲染画布。
    const measure = () => {
      const distance = surface.getBoundingClientRect().bottom - bar.getBoundingClientRect().top;
      const offset = Math.max(PLAYER_BOTTOM_BAR_BASE_OFFSET_PX, Math.ceil(distance + 12) - PLAYER_BOTTOM_BAR_SUBTITLE_CLEARANCE_PX);
      if (playerBottomBarLiveOffset.get() !== offset) playerBottomBarLiveOffset.set(offset);
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(surface); observer.observe(bar);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [root, footer, visible]);
}
