import { installGlobalVisualizerFrameRateLimiter, VISUALIZER_FRAME_RATE_STORAGE_KEY } from '../utils/frameRateLimiter';

// src/desktopLyrics/main.tsx — install the shared frame budget before Motion and Pixi can capture the browser's RAF implementation.
if (localStorage.getItem(VISUALIZER_FRAME_RATE_STORAGE_KEY) === null) localStorage.setItem(VISUALIZER_FRAME_RATE_STORAGE_KEY, '60');
installGlobalVisualizerFrameRateLimiter();
// Connect to the host immediately; the lyric stage prepares only the fonts selected for actual lyrics.
void import('./bootstrap');
